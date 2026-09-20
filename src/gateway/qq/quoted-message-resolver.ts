import { z } from 'zod'
import type { BotMessage, QuotedImage, QuotedMessage, QuotedMessageResolver } from '../../types/message.js'
import type { OneBotApiResponse } from './types.js'
import { oneBotSegmentSchema } from './types.js'

const idSchema = z.union([z.string(), z.number()])
const quotedMessageDataSchema = z.object({
  message_type: z.enum(['private', 'group']).optional(),
  group_id: idSchema.optional(),
  sender: z.object({
    user_id: idSchema.optional(),
    nickname: z.string().optional(),
    card: z.string().optional()
  }).passthrough().optional(),
  message: z.array(oneBotSegmentSchema).or(z.string())
}).passthrough()

interface OneBotApiCaller {
  call(action: string, params: Record<string, unknown>): Promise<OneBotApiResponse>
}

const MAX_QUOTED_TEXT_LENGTH = 8_000
const MAX_QUOTED_IMAGES = 4

function asString(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** 仅允许模型服务能够直接读取的远程图片地址，不向模型暴露 NapCat 本地路径。 */
function remoteImageUrl(data: Record<string, unknown>): string | undefined {
  const candidate = asString(data, 'url') || asString(data, 'file')
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function describeNonTextSegment(type: string, data: Record<string, unknown>): string {
  if (type === 'at') return `@${asString(data, 'qq') || '未知用户'}`
  if (type === 'face') return `[QQ表情${asString(data, 'id') ? ` ${asString(data, 'id')}` : ''}]`
  if (type === 'record') return '[语音消息]'
  if (type === 'video') return '[视频消息]'
  if (type === 'file') return `[文件${asString(data, 'file') ? `：${asString(data, 'file')}` : ''}]`
  if (type === 'forward') return '[合并转发消息]'
  return ''
}

function parseContent(message: z.infer<typeof quotedMessageDataSchema>['message']): { readonly text: string; readonly images: readonly QuotedImage[] } {
  if (typeof message === 'string') return { text: message.slice(0, MAX_QUOTED_TEXT_LENGTH), images: [] }
  const textParts: string[] = []
  const images: QuotedImage[] = []
  for (const segment of message) {
    if (segment.type === 'reply') continue
    if (segment.type === 'text') {
      textParts.push(asString(segment.data, 'text'))
      continue
    }
    if (segment.type === 'image') {
      if (images.length >= MAX_QUOTED_IMAGES) continue
      const url = remoteImageUrl(segment.data)
      const summary = asString(segment.data, 'summary')
      if (url !== undefined) images.push({ url, ...(summary ? { summary } : {}) })
      textParts.push(summary ? `[图片：${summary}]` : '[图片]')
      continue
    }
    const description = describeNonTextSegment(segment.type, segment.data)
    if (description) textParts.push(description)
  }
  return { text: textParts.join('').trim().slice(0, MAX_QUOTED_TEXT_LENGTH), images }
}

function isSameConversation(source: BotMessage, data: z.infer<typeof quotedMessageDataSchema>): boolean {
  if (data.message_type !== undefined && data.message_type !== source.chatType) return false
  if (source.chatType === 'group' && data.group_id !== undefined && String(data.group_id) !== source.groupId) return false
  return true
}

/** 使用 OneBot `get_msg` 即时解析一层引用；旧消息、撤回消息或越界消息统一返回不可用。 */
export function createQqQuotedMessageResolver(client: OneBotApiCaller): QuotedMessageResolver {
  return {
    async resolve(source, messageId): Promise<QuotedMessage | null> {
      const response = await client.call('get_msg', { message_id: messageId })
      if (response.status !== 'ok' || response.retcode !== 0) return null
      const parsed = quotedMessageDataSchema.safeParse(response.data)
      if (!parsed.success || !isSameConversation(source, parsed.data)) return null
      const content = parseContent(parsed.data.message)
      if (!content.text && content.images.length === 0) return null
      const senderId = parsed.data.sender?.user_id
      const senderDisplayName = parsed.data.sender?.card || parsed.data.sender?.nickname
      return {
        messageId,
        ...(senderId === undefined ? {} : { senderId: String(senderId) }),
        ...(senderDisplayName ? { senderDisplayName } : {}),
        text: content.text,
        images: content.images
      }
    }
  }
}
