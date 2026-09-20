import OpenAI from 'openai'
import type { LlmProvider, ReasoningEffort } from './types.js'

interface ChatCompletionRequest {
  readonly model: string
  readonly messages: ReadonlyArray<{ readonly role: 'system' | 'user' | 'assistant'; readonly content: string }>
  readonly reasoning_effort?: ReasoningEffort
}

/** 调用 OpenAI-compatible Chat Completions，兼容 OpenAI、DeepSeek 和阿里云百炼等服务商。 */
export function createOpenAiCompatibleProvider(apiKey: string, model: string, baseURL?: string, reasoningEffort?: ReasoningEffort): LlmProvider {
  const client = new OpenAI({ apiKey, baseURL })

  return {
    async chat(messages) {
      const request: ChatCompletionRequest = {
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort })
      }
      // 本项目使用的 SDK 类型尚未覆盖 OpenAI 当前支持的 `none` 与 `xhigh`，但运行时请求格式与官方 Chat Completions 协议一致。
      const completion = await client.chat.completions.create(request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
      const content = completion.choices[0]?.message.content?.trim()
      if (!content) throw new Error('LLM 未返回文本内容')
      return content
    }
  }
}
