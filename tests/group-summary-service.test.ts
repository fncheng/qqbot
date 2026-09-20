import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { BotRouter } from '../src/bot/router.js'
import { CommandRegistry } from '../src/commands/registry.js'
import { loadConfig } from '../src/config/env.js'
import type { ArchivedGroupMessage, DailySummaryCache, GroupArchiveInput, GroupSummaryRepository, SaveDailySummaryInput } from '../src/database/repositories/group-summary-repository.js'
import type { LlmProvider } from '../src/llm/types.js'
import { GroupSummaryService, isGroupSummaryRequest } from '../src/services/group-summary-service.js'
import type { BotMessage, MessageGateway } from '../src/types/message.js'
import type { ConversationRepository } from '../src/database/repositories/conversation-repository.js'

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL: 'postgres://u:p@localhost/db', NAPCAT_WS_URL: 'ws://localhost:3001', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', OPENAI_SYSTEM_PROMPT: 'system',
    ALLOWED_GROUP_IDS: '100,200', GROUP_SUMMARY_ENABLED_GROUP_IDS: '100', GROUP_SUMMARY_TIMEZONE: 'Asia/Shanghai', GROUP_SUMMARY_CHUNK_CHAR_LIMIT: '500', GROUP_SUMMARY_MAX_SOURCE_MESSAGES: '100', GROUP_SUMMARY_MAX_SOURCE_CHARS: '10000',
    ...overrides
  })
}

class MemorySummaryRepository implements GroupSummaryRepository {
  readonly archives: ArchivedGroupMessage[] = []
  readonly summaries = new Map<string, DailySummaryCache>()
  readonly listCalls: Array<{ readonly groupId: string; readonly start: Date; readonly end: Date }> = []
  readonly cleanups: Array<{ readonly archiveBefore: Date; readonly summaryBefore: Date }> = []
  async archive(input: GroupArchiveInput): Promise<boolean> {
    if (this.archives.some((item) => item.id === `${input.groupId}:${input.externalMessageId}`)) return false
    this.archives.push({ id: `${input.groupId}:${input.externalMessageId}`, qqUserId: input.qqUserId, content: input.content, sentAt: input.sentAt })
    return true
  }
  async listMessages(groupId: string, start: Date, end: Date): Promise<readonly ArchivedGroupMessage[]> {
    this.listCalls.push({ groupId, start, end })
    return this.archives.filter((item) => item.id.startsWith(`${groupId}:`) && item.sentAt >= start && item.sentAt < end).sort((left, right) => left.sentAt.getTime() - right.sentAt.getTime())
  }
  async findDailySummary(groupId: string, summaryDate: string): Promise<DailySummaryCache | null> { return this.summaries.get(`${groupId}:${summaryDate}`) ?? null }
  async saveDailySummary(input: SaveDailySummaryInput): Promise<void> { this.summaries.set(`${input.groupId}:${input.summaryDate}`, input) }
  async cleanup(archiveBefore: Date, summaryBefore: Date): Promise<void> { this.cleanups.push({ archiveBefore, summaryBefore }) }
}

function message(id: string, groupId = 'g1', timestamp = Date.parse('2026-09-18T01:00:00Z')): BotMessage {
  return { id, platform: 'qq', selfId: 'bot', chatType: 'group', groupId, userId: 'u1', text: '普通群消息', segments: [{ type: 'text', text: '普通群消息' }], mentionsBot: false, timestamp: Math.floor(timestamp / 1000) }
}

describe('群聊每日总结', () => {
  it('仅识别文档列出的明确触发写法，且启用群是白名单的子集', () => {
    expect(isGroupSummaryRequest('/summary today')).toBe(true)
    expect(isGroupSummaryRequest('告诉我今天群内发生了什么')).toBe(true)
    expect(isGroupSummaryRequest('总结今天群聊')).toBe(true)
    expect(isGroupSummaryRequest('请总结今天群聊')).toBe(false)
    expect(config({ ALLOWED_GROUP_IDS: '100', GROUP_SUMMARY_ENABLED_GROUP_IDS: '100,200' }).groupSummaryEnabledGroupIds).toEqual(new Set(['100']))
  })

  it('归档幂等，并按默认七天原始数据和缓存保留期发起清理', async () => {
    const repository = new MemorySummaryRepository()
    const service = new GroupSummaryService({ config: config(), repository, llm: { chat: vi.fn() }, now: () => new Date('2026-09-18T01:00:00Z') })
    expect(await service.archive('g1', message('same'))).toBe(true)
    expect(await service.archive('g1', message('same'))).toBe(false)
    await service.cleanupExpired()
    expect(repository.archives).toHaveLength(1)
    expect(repository.cleanups).toHaveLength(3)
    const firstCleanup = repository.cleanups.at(0)
    if (firstCleanup === undefined) throw new Error('预期存在清理记录')
    expect(firstCleanup.archiveBefore.toISOString()).toBe('2026-09-11T01:00:00.000Z')
    expect(firstCleanup.summaryBefore.toISOString()).toBe('2026-08-19T01:00:00.000Z')
  })

  it('只查询触发群在 Asia/Shanghai 当天的消息，并正确跨越当地午夜', async () => {
    const repository = new MemorySummaryRepository()
    const llm: LlmProvider = { chat: vi.fn().mockResolvedValue('摘要') }
    const service = new GroupSummaryService({ config: config(), repository, llm, now: () => new Date('2026-09-18T00:30:00+08:00') })
    await repository.archive({ groupId: 'g1', qqUserId: 'u', externalMessageId: 'before', content: '昨晚', sentAt: new Date('2026-09-17T15:59:59Z') })
    await repository.archive({ groupId: 'g1', qqUserId: 'u', externalMessageId: 'today', content: '今天', sentAt: new Date('2026-09-17T16:00:01Z') })
    await repository.archive({ groupId: 'g2', qqUserId: 'u', externalMessageId: 'other-group', content: '其他群', sentAt: new Date('2026-09-17T16:00:01Z') })
    const result = await service.summarize({ groupId: 'g1', qqGroupId: '100' })
    const firstListCall = repository.listCalls.at(0)
    if (firstListCall === undefined) throw new Error('预期存在归档查询记录')
    expect(firstListCall.groupId).toBe('g1')
    expect(firstListCall.start.toISOString()).toBe('2026-09-17T16:00:00.000Z')
    expect(result.content).toContain('1 条')
    expect(llm.chat).toHaveBeenCalledTimes(2)
  })

  it('当天没有素材时提示空数据且不调用模型', async () => {
    const repository = new MemorySummaryRepository()
    const llm: LlmProvider = { chat: vi.fn() }
    const service = new GroupSummaryService({ config: config(), repository, llm, now: () => new Date('2026-09-18T01:00:00Z') })
    await expect(service.summarize({ groupId: 'g1', qqGroupId: '100' })).resolves.toMatchObject({ content: '今天还没有可用于总结的群聊文本消息。', fromCache: false })
    expect(llm.chat).not.toHaveBeenCalled()
  })

  it('超出分段预算时执行 Map-Reduce，并在无新消息时命中缓存、新消息后重新生成', async () => {
    const repository = new MemorySummaryRepository()
    const llm: LlmProvider = { chat: vi.fn().mockResolvedValue('模型结果') }
    const service = new GroupSummaryService({ config: config(), repository, llm, now: () => new Date('2026-09-18T08:00:00Z') })
    for (let index = 0; index < 3; index += 1) await repository.archive({ groupId: 'g1', qqUserId: 'u', externalMessageId: String(index), content: 'a'.repeat(300), sentAt: new Date(`2026-09-18T0${index}:00:00Z`) })
    const first = await service.summarize({ groupId: 'g1', qqGroupId: '100' })
    expect(first.fromCache).toBe(false)
    expect(llm.chat).toHaveBeenCalledTimes(4)
    const cached = await service.summarize({ groupId: 'g1', qqGroupId: '100' })
    expect(cached.fromCache).toBe(true)
    expect(llm.chat).toHaveBeenCalledTimes(4)
    await repository.archive({ groupId: 'g1', qqUserId: 'u', externalMessageId: 'new', content: '新消息', sentAt: new Date('2026-09-18T07:30:00Z') })
    const regenerated = await service.summarize({ groupId: 'g1', qqGroupId: '100' })
    expect(regenerated.fromCache).toBe(false)
    expect(llm.chat).toHaveBeenCalledTimes(8)
  })

  it('已启用白名单群的未 @ 消息仅归档，不回复也不调用模型；未启用或非白名单群不归档', async () => {
    const summaryRepository = new MemorySummaryRepository()
    const llm: LlmProvider = { chat: vi.fn() }
    const service = new GroupSummaryService({ config: config(), repository: summaryRepository, llm, now: () => new Date('2026-09-18T01:00:00Z') })
    const conversationRepository: ConversationRepository = { ensureUser: vi.fn(), ensureGroup: vi.fn().mockResolvedValue({ id: 'g1', enabled: true }), getOrCreate: vi.fn(), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository: conversationRepository, groupSummaryService: service, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    await router.handle(message('enabled', '100'))
    await router.handle(message('disabled', '200'))
    await router.handle(message('not-allowed', '999'))
    await router.handle({ ...message('mixed', '100'), segments: [{ type: 'text', text: '带图片' }, { type: 'unsupported', segmentType: 'image' }], text: '带图片' })
    expect(summaryRepository.archives).toHaveLength(1)
    expect(llm.chat).not.toHaveBeenCalled()
    expect(gateway.sendText).not.toHaveBeenCalled()
  })
})
