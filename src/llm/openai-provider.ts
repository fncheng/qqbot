import OpenAI from 'openai'
import type { LlmProvider } from './types.js'

/** OpenAI Responses API 适配层；store:false 确保由本地数据库维护历史。 */
export function createOpenAiProvider(apiKey: string, model: string, baseURL?: string): LlmProvider {
  const client = new OpenAI({ apiKey, baseURL })
  return { async chat(messages) {
    const response = await client.responses.create({ model, store: false, input: messages.map((message) => ({ role: message.role, content: [{ type: 'input_text' as const, text: message.content }] })) })
    const content = response.output_text.trim()
    if (!content) throw new Error('LLM 未返回文本内容')
    return content
  } }
}
