export interface LlmTextContentPart { readonly type: 'text'; readonly text: string }
export interface LlmImageContentPart { readonly type: 'image_url'; readonly image_url: { readonly url: string; readonly detail?: 'auto' | 'low' | 'high' } }
export type LlmContentPart = LlmTextContentPart | LlmImageContentPart
export type LlmContent = string | readonly LlmContentPart[]
export interface LlmMessage { readonly role: 'system' | 'user' | 'assistant'; readonly content: LlmContent }
export interface LlmProvider { chat(messages: readonly LlmMessage[]): Promise<string> }

/** OpenAI Chat Completions 推理强度；`none` 表示请求模型关闭推理。 */
export const reasoningEffortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof reasoningEffortValues)[number]
