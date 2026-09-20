export interface LlmMessage { readonly role: 'system' | 'user' | 'assistant'; readonly content: string }
export interface LlmProvider { chat(messages: readonly LlmMessage[]): Promise<string> }

/** OpenAI Chat Completions 推理强度；`none` 表示请求模型关闭推理。 */
export const reasoningEffortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof reasoningEffortValues)[number]
