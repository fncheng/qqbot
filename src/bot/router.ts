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
import type { BotMessage, MessageGateway } from '../types/message.js'
import { safeError } from '../utils/logger.js'

export interface BotRouterDependencies { readonly config: AppConfig; readonly repository: ConversationRepository; readonly llm: LlmProvider; readonly gateway: MessageGateway; readonly commands: CommandRegistry; readonly logger: Logger; readonly dedupe?: ExpiringSet; readonly rateLimiter?: MemoryRateLimiter; readonly queue?: KeyedSerialQueue }

const MAX_REPLY_TOTAL = 6_000
const MAX_REPLY_CHUNK = 1_500

function conversationKey(message: BotMessage): string { return message.chatType === 'private' ? `private:${message.userId}` : `group:${message.groupId}:${message.userId}` }
/** 外部标识加入会话作用域，兼容不同会话中重复的 OneBot message_id。 */
function externalMessageId(message: BotMessage): string { return message.chatType === 'private' ? `private:${message.userId}:${message.id}` : `group:${message.groupId}:${message.id}` }
function splitReply(text: string): readonly string[] { const safe = text.slice(0, MAX_REPLY_TOTAL); return Array.from({ length: Math.ceil(safe.length / MAX_REPLY_CHUNK) }, (_, index) => safe.slice(index * MAX_REPLY_CHUNK, (index + 1) * MAX_REPLY_CHUNK)).filter(Boolean) }

/** 固定路由优先级的 Bot Core；任何异常都在事件边界被捕获。 */
export class BotRouter {
  readonly #dedupe: ExpiringSet; readonly #rateLimiter: MemoryRateLimiter; readonly #queue: KeyedSerialQueue
  constructor(private readonly deps: BotRouterDependencies) { this.#dedupe = deps.dedupe ?? new ExpiringSet(300_000, 50_000); this.#rateLimiter = deps.rateLimiter ?? new MemoryRateLimiter(); this.#queue = deps.queue ?? new KeyedSerialQueue() }
  async handle(message: BotMessage): Promise<void> {
    if (message.userId === message.selfId || !message.text.trim()) return
    // 群聊触发条件先于去重和限流，避免无关群消息消耗机器人资源或触发限流回复。
    if (message.chatType === 'group' && (!message.groupId || !this.deps.config.allowedGroupIds.has(message.groupId) || !message.mentionsBot)) return
    if (this.#dedupe.hasOrAdd(`${message.platform}:${externalMessageId(message)}`)) return
    const normalized = message.chatType === 'group' ? removeBotMention(message) : message
    if (!normalized.text) return
    await this.#queue.run(conversationKey(message), async () => this.process(normalized))
  }
  private async process(message: BotMessage): Promise<void> {
    try {
      const user = await this.deps.repository.ensureUser(message.userId, this.deps.config.BOT_OWNER_QQ)
      if (user.blocked) return
      const group = message.groupId ? await this.deps.repository.ensureGroup(message.groupId) : undefined
      if (group !== undefined && !group.enabled) return
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
