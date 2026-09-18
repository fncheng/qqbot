export interface LlmMessage { readonly role: 'system' | 'user' | 'assistant'; readonly content: string }
export interface LlmProvider { chat(messages: readonly LlmMessage[]): Promise<string> }
