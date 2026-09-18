import type { ConversationRepository } from '../database/repositories/conversation-repository.js'
import type { BotCommand } from './registry.js'

export function createBuiltinCommands(repository: ConversationRepository): readonly BotCommand[] {
  return [
    { name: 'ping', description: '检查机器人是否在线', async execute() { return 'pong' } },
    { name: 'help', description: '显示可用指令', async execute() { return '/ping - 检查机器人是否在线\n/help - 显示可用指令\n/clear - 清除当前对话历史' } },
    { name: 'clear', description: '清除当前对话历史', async execute(context) { await repository.clear(context.conversationId); return '当前对话历史已清除。' } }
  ]
}
