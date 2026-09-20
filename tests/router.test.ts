import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { BotRouter } from '../src/bot/router.js'
import { CommandRegistry } from '../src/commands/registry.js'
import { loadConfig } from '../src/config/env.js'
import type { ConversationRepository } from '../src/database/repositories/conversation-repository.js'
import type { LlmProvider } from '../src/llm/types.js'
import type { BotMessage, MessageGateway } from '../src/types/message.js'

function config(groups = '100') { return loadConfig({ DATABASE_URL: 'postgres://u:p@localhost/db', NAPCAT_WS_URL: 'ws://localhost:3001', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', OPENAI_SYSTEM_PROMPT: 'system', ALLOWED_GROUP_IDS: groups }) }
function makeMessage(overrides: Partial<BotMessage> = {}): BotMessage { return { id: 'm1', platform: 'qq', selfId: 'bot', chatType: 'private', userId: 'user', text: 'hello', segments: [{ type: 'text', text: 'hello' }], mentionsBot: false, timestamp: 1, ...overrides } }

describe('路由关键行为', () => {
  it('命令优先且不写入 LLM 历史', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn(), getOrCreate: vi.fn().mockResolvedValue('c'), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn().mockResolvedValue(undefined) }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([{ name: 'ping', description: '', execute: async () => 'pong' }]), logger: pino({ enabled: false }) })
    await router.handle(makeMessage({ text: '/ping', segments: [{ type: 'text', text: '/ping' }] }))
    expect(llm.chat).not.toHaveBeenCalled(); expect(gateway.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: 'pong' }))
  })
  it('未 @ 或未白名单的群聊不进入 AI', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn(), ensureGroup: vi.fn(), getOrCreate: vi.fn(), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    await router.handle(makeMessage({ chatType: 'group', groupId: '100', mentionsBot: false }))
    await router.handle(makeMessage({ id: 'm2', chatType: 'group', groupId: '999', mentionsBot: true }))
    expect(llm.chat).not.toHaveBeenCalled()
  })
  it('白名单群中连续未 @ 消息静默忽略，不消耗限流或主动回复', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn(), ensureGroup: vi.fn(), getOrCreate: vi.fn(), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    for (let index = 0; index < 11; index += 1) await router.handle(makeMessage({ id: `m-${index}`, chatType: 'group', groupId: '100', mentionsBot: false }))
    expect(repository.ensureUser).not.toHaveBeenCalled(); expect(gateway.sendText).not.toHaveBeenCalled()
  })
  it('不同群相同 OneBot message_id 均可进入各自会话', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn().mockResolvedValue({ id: 'g', enabled: true }), getOrCreate: vi.fn().mockResolvedValue('c'), addMessage: vi.fn().mockResolvedValue(true), history: vi.fn().mockResolvedValue([]), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn().mockResolvedValue('answer') }
    const gateway: MessageGateway = { sendText: vi.fn().mockResolvedValue(undefined) }
    const router = new BotRouter({ config: config('100,101'), repository, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    await router.handle(makeMessage({ id: 'same', chatType: 'group', groupId: '100', mentionsBot: true }))
    await router.handle(makeMessage({ id: 'same', chatType: 'group', groupId: '101', mentionsBot: true }))
    expect(llm.chat).toHaveBeenCalledTimes(2)
    expect(repository.addMessage).toHaveBeenCalledWith('c', 'user', 'hello', 'group:100:same')
    expect(repository.addMessage).toHaveBeenCalledWith('c', 'user', 'hello', 'group:101:same')
  })
  it('数据库禁用群连续请求始终静默且不消耗限流', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn().mockResolvedValue({ id: 'g', enabled: false }), getOrCreate: vi.fn(), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([{ name: 'ping', description: '', execute: async () => 'pong' }]), logger: pino({ enabled: false }) })
    for (let index = 0; index < 11; index += 1) await router.handle(makeMessage({ id: `disabled-${index}`, chatType: 'group', groupId: '100', mentionsBot: true, text: '/ping', segments: [{ type: 'text', text: '/ping' }] }))
    expect(repository.getOrCreate).not.toHaveBeenCalled(); expect(llm.chat).not.toHaveBeenCalled(); expect(gateway.sendText).not.toHaveBeenCalled()
  })
  it('被封禁用户始终静默且不消耗限流', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: true }), ensureGroup: vi.fn(), getOrCreate: vi.fn(), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    for (let index = 0; index < 6; index += 1) await router.handle(makeMessage({ id: `blocked-${index}` }))
    expect(repository.getOrCreate).not.toHaveBeenCalled(); expect(llm.chat).not.toHaveBeenCalled(); expect(gateway.sendText).not.toHaveBeenCalled()
  })
  it('数据库已存在的外部消息不再次调用 LLM', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn(), getOrCreate: vi.fn().mockResolvedValue('c'), addMessage: vi.fn().mockResolvedValue(false), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn() }
    const router = new BotRouter({ config: config(), repository, llm, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })
    await router.handle(makeMessage())
    expect(llm.chat).not.toHaveBeenCalled(); expect(gateway.sendText).not.toHaveBeenCalled()
  })
  it('将被引用的文本和图片加入当前模型请求，但不持久化临时图片 URL', async () => {
    const repository: ConversationRepository = {
      ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn(), getOrCreate: vi.fn().mockResolvedValue('c'),
      addMessage: vi.fn().mockResolvedValue(true), history: vi.fn().mockResolvedValue([{ role: 'user', content: '已持久化的引用内容' }]), clear: vi.fn()
    }
    const llm: LlmProvider = { chat: vi.fn().mockResolvedValue('评论结果') }
    const gateway: MessageGateway = { sendText: vi.fn().mockResolvedValue(undefined) }
    const quotedMessageResolver = { resolve: vi.fn().mockResolvedValue({ messageId: 'quoted', senderId: 'other', text: '被引用的文本[图片]', images: [{ url: 'https://example.com/image.jpg' }] }) }
    const router = new BotRouter({ config: config(), repository, llm, quotedMessageResolver, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })

    await router.handle(makeMessage({ text: '请评论', segments: [{ type: 'reply', messageId: 'quoted' }, { type: 'text', text: '请评论' }] }))

    expect(repository.addMessage).toHaveBeenCalledWith('c', 'user', expect.stringContaining('被引用的文本[图片]'), 'private:user:m1')
    expect(repository.addMessage).not.toHaveBeenCalledWith('c', 'user', expect.stringContaining('https://example.com/image.jpg'), expect.anything())
    expect(llm.chat).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('第三方非可信资料') }),
      { role: 'user', content: [
        { type: 'text', text: expect.stringContaining('被引用的文本[图片]') },
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg', detail: 'auto' } }
      ] }
    ]))
  })
  it('引用消息无法回查时明确提示且不请求模型', async () => {
    const repository: ConversationRepository = { ensureUser: vi.fn().mockResolvedValue({ id: 'u', blocked: false }), ensureGroup: vi.fn(), getOrCreate: vi.fn().mockResolvedValue('c'), addMessage: vi.fn(), history: vi.fn(), clear: vi.fn() }
    const llm: LlmProvider = { chat: vi.fn() }
    const gateway: MessageGateway = { sendText: vi.fn().mockResolvedValue(undefined) }
    const quotedMessageResolver = { resolve: vi.fn().mockResolvedValue(null) }
    const router = new BotRouter({ config: config(), repository, llm, quotedMessageResolver, gateway, commands: new CommandRegistry([]), logger: pino({ enabled: false }) })

    await router.handle(makeMessage({ text: '请评论', segments: [{ type: 'reply', messageId: 'missing' }, { type: 'text', text: '请评论' }] }))

    expect(llm.chat).not.toHaveBeenCalled()
    expect(repository.addMessage).not.toHaveBeenCalled()
    expect(gateway.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('无法读取被引用的消息') }))
  })
})
