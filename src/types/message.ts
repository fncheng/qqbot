export type ChatType = 'private' | 'group'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface TextSegment { readonly type: 'text'; readonly text: string }
export interface AtSegment { readonly type: 'at'; readonly target: string }
export interface UnsupportedSegment { readonly type: 'unsupported'; readonly segmentType: string }
export type BotMessageSegment = TextSegment | AtSegment | UnsupportedSegment

/** Bot Core 只依赖此统一模型，不依赖 OneBot 原始事件。 */
export interface BotMessage {
  readonly id: string
  readonly platform: 'qq'
  readonly selfId: string
  readonly chatType: ChatType
  readonly userId: string
  readonly groupId?: string
  readonly text: string
  readonly segments: readonly BotMessageSegment[]
  readonly mentionsBot: boolean
  readonly timestamp: number
}

export interface PrivateOutboundTextMessage { readonly chatType: 'private'; readonly userId: string; readonly text: string }
export interface GroupOutboundTextMessage { readonly chatType: 'group'; readonly userId: string; readonly groupId: string; readonly text: string }
export type OutboundTextMessage = PrivateOutboundTextMessage | GroupOutboundTextMessage
export interface MessageGateway { sendText(message: OutboundTextMessage): Promise<void> }
