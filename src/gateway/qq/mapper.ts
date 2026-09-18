import type { BotMessage, BotMessageSegment } from '../../types/message.js'
import { oneBotMessageEventSchema } from './types.js'

function asString(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** 将 OneBot 消息段转换成平台无关段；只有 text 段参与文本拼接。 */
export function mapOneBotMessage(input: unknown): BotMessage | null {
  const parsed = oneBotMessageEventSchema.safeParse(input)
  if (!parsed.success) return null
  const event = parsed.data
  if (event.message_type === 'group' && event.group_id === undefined) return null
  const segments: BotMessageSegment[] = typeof event.message === 'string'
    ? [{ type: 'text', text: event.message }]
    : event.message.map((segment) => {
      if (segment.type === 'text') return { type: 'text', text: asString(segment.data, 'text') }
      if (segment.type === 'at') return { type: 'at', target: asString(segment.data, 'qq') }
      return { type: 'unsupported', segmentType: segment.type }
    })
  const selfId = String(event.self_id)
  return {
    id: String(event.message_id), platform: 'qq', selfId, chatType: event.message_type,
    userId: String(event.user_id), ...(event.group_id === undefined ? {} : { groupId: String(event.group_id) }),
    text: segments.filter((segment): segment is Extract<BotMessageSegment, { type: 'text' }> => segment.type === 'text').map((segment) => segment.text).join(''),
    segments, mentionsBot: segments.some((segment) => segment.type === 'at' && segment.target === selfId), timestamp: event.time
  }
}

/** 仅移除触发机器人回复的 at 段，保留用户文本与其他提及。 */
export function removeBotMention(message: BotMessage): BotMessage {
  if (!message.mentionsBot) return message
  const segments = message.segments.filter((segment) => segment.type !== 'at' || segment.target !== message.selfId)
  return { ...message, segments, text: segments.filter((segment): segment is Extract<BotMessageSegment, { type: 'text' }> => segment.type === 'text').map((segment) => segment.text).join('').trim(), mentionsBot: false }
}
