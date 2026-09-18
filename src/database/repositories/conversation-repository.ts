import { desc, eq } from 'drizzle-orm'
import type { Database } from '../client.js'
import { conversations, groups, messages, users, type messageRole } from '../schema/index.js'
import type { MessageRole } from '../../types/message.js'

export interface StoredMessage { readonly role: MessageRole; readonly content: string }
export interface ConversationRepository {
  ensureUser(qqUserId: string, ownerQq?: string): Promise<{ id: string; blocked: boolean }>
  ensureGroup(qqGroupId: string): Promise<{ id: string; enabled: boolean }>
  getOrCreate(key: string, userId: string, groupId?: string): Promise<string>
  /** 返回 false 表示外部消息已在数据库中存在，调用方不得再次请求 LLM。 */
  addMessage(conversationId: string, role: MessageRole, content: string, externalMessageId?: string): Promise<boolean>
  history(conversationId: string, limit: number): Promise<readonly StoredMessage[]>
  clear(conversationId: string): Promise<void>
}

/** Drizzle 适配层集中数据库语义，Bot Core 不直接依赖表结构。 */
export function createConversationRepository(db: Database): ConversationRepository {
  return {
    async ensureUser(qqUserId, ownerQq) {
      const role = ownerQq === qqUserId ? 'OWNER' : 'USER'
      const inserted = await db.insert(users).values({ qqUserId, role }).onConflictDoNothing().returning({ id: users.id, status: users.status, role: users.role })
      const row = inserted[0] ?? (await db.select({ id: users.id, status: users.status, role: users.role }).from(users).where(eq(users.qqUserId, qqUserId)).limit(1))[0]
      if (!row) throw new Error('无法创建或查询用户')
      return { id: row.id, blocked: row.status === 'BLOCKED' || row.role === 'BLOCKED' }
    },
    async ensureGroup(qqGroupId) {
      const inserted = await db.insert(groups).values({ qqGroupId }).onConflictDoNothing().returning({ id: groups.id, enabled: groups.enabled })
      const row = inserted[0] ?? (await db.select({ id: groups.id, enabled: groups.enabled }).from(groups).where(eq(groups.qqGroupId, qqGroupId)).limit(1))[0]
      if (!row) throw new Error('无法创建或查询群')
      return row
    },
    async getOrCreate(conversationKey, userId, groupId) {
      const inserted = await db.insert(conversations).values({ conversationKey, userId, groupId }).onConflictDoNothing().returning({ id: conversations.id })
      const row = inserted[0] ?? (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.conversationKey, conversationKey)).limit(1))[0]
      if (!row) throw new Error('无法创建或查询会话')
      return row.id
    },
    async addMessage(conversationId, role, content, externalMessageId) {
      const inserted = await db.insert(messages).values({ conversationId, role: role as typeof messageRole.enumValues[number], content, platform: externalMessageId ? 'qq' : null, externalMessageId: externalMessageId ?? null }).onConflictDoNothing().returning({ id: messages.id })
      return inserted.length > 0
    },
    async history(conversationId, limit) {
      const rows = await db.select({ role: messages.role, content: messages.content }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(limit)
      return rows.reverse().map((row) => ({ role: row.role, content: row.content }))
    },
    async clear(conversationId) { await db.delete(messages).where(eq(messages.conversationId, conversationId)) }
  }
}
