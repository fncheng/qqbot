import OpenAI from 'openai'
import type { LlmProvider } from './types.js'

/** 调用 OpenAI-compatible Chat Completions，兼容 OpenAI、DeepSeek 和阿里云百炼等服务商。 */
export function createOpenAiCompatibleProvider(apiKey: string, model: string, baseURL?: string): LlmProvider {
  const client = new OpenAI({ apiKey, baseURL })

  return {
    async chat(messages) {
      const completion = await client.chat.completions.create({
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content }))
      })
      const content = completion.choices[0]?.message.content?.trim()
      if (!content) throw new Error('LLM 未返回文本内容')
      return content
    }
  }
}
