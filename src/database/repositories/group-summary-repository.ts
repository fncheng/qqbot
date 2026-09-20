import { and, asc, eq, gte, lt } from 'drizzle-orm'
import type { Database } from '../client.js'
import { groupDailySummaries, groupMessageArchives } from '../schema/index.js'

export interface GroupArchiveInput {
  readonly groupId: string
  readonly qqUserId: string
  readonly externalMessageId: string
  readonly content: string
  readonly sentAt: Date
}

export interface ArchivedGroupMessage { readonly id: string; readonly qqUserId: string; readonly content: string; readonly sentAt: Date }
export interface DailySummaryCache { readonly content: string; readonly timezone: string; readonly sourceMessageCount: number; readonly sourceLatestMessageAt: Date }
export interface SaveDailySummaryInput extends DailySummaryCache { readonly groupId: string; readonly summaryDate: string }

export interface GroupSummaryRepository {
  /** 返回 false 代表 OneBot 重推的同一群消息已经归档。 */
  archive(input: GroupArchiveInput): Promise<boolean>
  listMessages(groupId: string, start: Date, end: Date): Promise<readonly ArchivedGroupMessage[]>
  findDailySummary(groupId: string, summaryDate: string): Promise<DailySummaryCache | null>
  saveDailySummary(input: SaveDailySummaryInput): Promise<void>
  cleanup(archiveBefore: Date, summaryBefore: Date): Promise<void>
}

/** 群归档与摘要缓存的数据访问层，独立于 ConversationRepository。 */
export function createGroupSummaryRepository(db: Database): GroupSummaryRepository {
  return {
    async archive(input) {
      const inserted = await db.insert(groupMessageArchives).values(input).onConflictDoNothing().returning({ id: groupMessageArchives.id })
      return inserted.length > 0
    },
    async listMessages(groupId, start, end) {
      return db.select({ id: groupMessageArchives.id, qqUserId: groupMessageArchives.qqUserId, content: groupMessageArchives.content, sentAt: groupMessageArchives.sentAt })
        .from(groupMessageArchives)
        .where(and(eq(groupMessageArchives.groupId, groupId), gte(groupMessageArchives.sentAt, start), lt(groupMessageArchives.sentAt, end)))
        .orderBy(asc(groupMessageArchives.sentAt), asc(groupMessageArchives.id))
    },
    async findDailySummary(groupId, summaryDate) {
      const row = (await db.select({ content: groupDailySummaries.content, timezone: groupDailySummaries.timezone, sourceMessageCount: groupDailySummaries.sourceMessageCount, sourceLatestMessageAt: groupDailySummaries.sourceLatestMessageAt })
        .from(groupDailySummaries).where(and(eq(groupDailySummaries.groupId, groupId), eq(groupDailySummaries.summaryDate, summaryDate))).limit(1))[0]
      return row ?? null
    },
    async saveDailySummary(input) {
      await db.insert(groupDailySummaries).values({ ...input, updatedAt: new Date() }).onConflictDoUpdate({
        target: [groupDailySummaries.groupId, groupDailySummaries.summaryDate],
        set: { timezone: input.timezone, sourceMessageCount: input.sourceMessageCount, sourceLatestMessageAt: input.sourceLatestMessageAt, content: input.content, updatedAt: new Date() }
      })
    },
    async cleanup(archiveBefore, summaryBefore) {
      await db.delete(groupMessageArchives).where(lt(groupMessageArchives.sentAt, archiveBefore))
      await db.delete(groupDailySummaries).where(lt(groupDailySummaries.createdAt, summaryBefore))
    }
  }
}
