import type { Logger } from 'pino'
import type { AppConfig } from '../config/env.js'
import type { CommandRegistry } from '../commands/registry.js'
import { parseCommand } from '../commands/registry.js'
import type { ConversationRepository } from '../database/repositories/conversation-repository.js'
import type { LlmProvider } from '../llm/types.js'
import { removeBotMention } from '../gateway/qq/mapper.js'
import { ExpiringSet } from '../services/expiring-cache.js'
import { MemoryRateLimiter } from '../services/rate-limiter.js'
import { KeyedSerialQueue } from '../services/serial-queue.js'
import { GroupSummaryService, isGroupSummaryRequest } from '../services/group-summary-service.js'
import type { BotMessage, MessageGateway } from '../types/message.js'
import { safeError } from '../utils/logger.js'

export interface BotRouterDependencies {
  readonly config: AppConfig
  readonly repository: ConversationRepository
  readonly groupSummaryService?: GroupSummaryService
  readonly llm: LlmProvider
  readonly gateway: MessageGateway
  readonly commands: CommandRegistry
  readonly logger: Logger
  readonly dedupe?: ExpiringSet
  readonly rateLimiter?: MemoryRateLimiter
  readonly summaryRateLimiter?: MemoryRateLimiter
  readonly queue?: KeyedSerialQueue
}

const MAX_REPLY_TOTAL = 6_000
const MAX_REPLY_CHUNK = 1_500

function conversationKey(message: BotMessage): string { return message.chatType === 'private' ? `private:${message.userId}` : `group:${message.groupId}:${message.userId}` }
/** 外部标识加入会话作用域，兼容不同会话中重复的 OneBot message_id。 */
function externalMessageId(message: BotMessage): string { return message.chatType === 'private' ? `private:${message.userId}:${message.id}` : `group:${message.groupId}:${message.id}` }
function splitReply(text: string): readonly string[] { const safe = text.slice(0, MAX_REPLY_TOTAL); return Array.from({ length: Math.ceil(safe.length / MAX_REPLY_CHUNK) }, (_, index) => safe.slice(index * MAX_REPLY_CHUNK, (index + 1) * MAX_REPLY_CHUNK)).filter(Boolean) }

/** 固定路由优先级的 Bot Core；任何异常都在事件边界被捕获。 */
export class BotRouter {
  readonly #dedupe: ExpiringSet; readonly #rateLimiter: MemoryRateLimiter; readonly #summaryRateLimiter: MemoryRateLimiter; readonly #queue: KeyedSerialQueue
  constructor(private readonly deps: BotRouterDependencies) {
    this.#dedupe = deps.dedupe ?? new ExpiringSet(300_000, 50_000)
    this.#rateLimiter = deps.rateLimiter ?? new MemoryRateLimiter()
    // 总结消耗多个模型请求，使用独立且更严格的群级滑动窗口。
    this.#summaryRateLimiter = deps.summaryRateLimiter ?? new MemoryRateLimiter(60_000, 2, 3)
    this.#queue = deps.queue ?? new KeyedSerialQueue()
  }
  async handle(message: BotMessage): Promise<void> {
    if (message.userId === message.selfId || !message.text.trim()) return
    // 未提及机器人的消息仅在同时满足白名单和显式总结开关时静默归档。
    if (message.chatType === 'group' && (!message.groupId || !this.deps.config.allowedGroupIds.has(message.groupId))) return
    if (message.chatType === 'group' && !message.mentionsBot) {
      if (!this.deps.config.groupSummaryEnabledGroupIds.has(message.groupId!) || this.deps.groupSummaryService === undefined) return
      // 第一阶段只归档完整纯文本事件，图文混合、文件和语音等非文本段不进入总结素材。
      if (!message.segments.every((segment) => segment.type === 'text')) return
      if (this.#dedupe.hasOrAdd(`${message.platform}:group-archive:${message.groupId}:${message.id}`)) return
      await this.#queue.run(`group-archive:${message.groupId}`, async () => this.archiveGroupMessage(message))
      return
    }
    if (this.#dedupe.hasOrAdd(`${message.platform}:${externalMessageId(message)}`)) return
    const normalized = message.chatType === 'group' ? removeBotMention(message) : message
    if (!normalized.text) return
    await this.#queue.run(conversationKey(message), async () => this.process(normalized))
  }
  private async archiveGroupMessage(message: BotMessage): Promise<void> {
    try {
      const group = await this.deps.repository.ensureGroup(message.groupId!)
      if (!group.enabled) return
      await this.deps.groupSummaryService?.archive(group.id, message)
    } catch (error) {
      // 归档失败不能将未 @ 消息变成主动回复，但必须保留运维可见日志。
      this.deps.logger.error({ error: safeError(error), messageId: message.id, groupId: message.groupId }, '群消息归档失败')
    }
  }
  private async process(message: BotMessage): Promise<void> {
    try {
      const user = await this.deps.repository.ensureUser(message.userId, this.deps.config.BOT_OWNER_QQ)
      if (user.blocked) return
      const group = message.groupId ? await this.deps.repository.ensureGroup(message.groupId) : undefined
      if (group !== undefined && !group.enabled) return
      if (message.groupId !== undefined && this.deps.config.groupSummaryEnabledGroupIds.has(message.groupId) && this.deps.groupSummaryService !== undefined && isGroupSummaryRequest(message.text)) {
        if (!this.#summaryRateLimiter.allow(message)) { await this.reply(message, '群聊总结请求过于频繁，请稍后再试。'); return }
        const result = await this.deps.groupSummaryService.summarize({ groupId: group!.id, qqGroupId: message.groupId })
        await this.reply(message, result.content)
        return
      }
      // 权限与群启用状态确认后再计入限流，保证被封禁用户和禁用群始终静默。
      if (!this.#rateLimiter.allow(message)) { await this.reply(message, '请求过于频繁，请稍后再试。'); return }
      const conversationId = await this.deps.repository.getOrCreate(conversationKey(message), user.id, group?.id)
      const command = parseCommand(message.text)
      if (command) {
        const registered = this.deps.commands.get(command.name)
        await this.reply(message, registered ? await registered.execute({ conversationId, userId: message.userId, ...(message.groupId === undefined ? {} : { groupId: message.groupId }) }) : `未知指令：/${command.name}\n${this.deps.commands.help()}`)
        return
      }
      const persisted = await this.deps.repository.addMessage(conversationId, 'user', message.text, externalMessageId(message))
      if (!persisted) return
      const history = await this.deps.repository.history(conversationId, this.deps.config.LLM_HISTORY_LIMIT)
      const response = await this.deps.llm.chat([{ role: 'system', content: this.deps.config.OPENAI_SYSTEM_PROMPT }, ...history.filter((item): item is { role: 'user' | 'assistant'; content: string } => item.role === 'user' || item.role === 'assistant')])
      await this.deps.repository.addMessage(conversationId, 'assistant', response)
      await this.reply(message, response)
    } catch (error) {
      this.deps.logger.error({ error: safeError(error), messageId: message.id, userId: message.userId, groupId: message.groupId }, '消息处理失败')
      await this.reply(message, '处理消息时出现错误，请稍后再试。').catch((sendError: unknown) => this.deps.logger.error({ error: safeError(sendError) }, '错误提示发送失败'))
    }
  }
  private async reply(message: BotMessage, text: string): Promise<void> {
    for (const chunk of splitReply(text)) {
      const outbound = message.chatType === 'private'
        ? { chatType: 'private' as const, userId: message.userId, text: chunk }
        : { chatType: 'group' as const, userId: message.userId, groupId: message.groupId!, text: chunk }
      await this.deps.gateway.sendText(outbound)
    }
  }
  get processingCount(): number { return this.#queue.pending }
}
