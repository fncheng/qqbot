import OpenAI from 'openai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAiCompatibleProvider } from '../src/llm/openai-compatible-provider.js'

const mocks = vi.hoisted(() => ({ createCompletion: vi.fn() }))

vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mocks.createCompletion } } }))
}))

describe('OpenAI-compatible LLM 适配器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('使用服务商配置调用 Chat Completions 并返回文本', async () => {
    mocks.createCompletion.mockResolvedValue({ choices: [{ message: { content: ' 你好 ' } }] })
    const provider = createOpenAiCompatibleProvider('provider-key', 'provider-model', 'https://provider.example/v1')

    await expect(provider.chat([{ role: 'user', content: '你好' }])).resolves.toBe('你好')
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'provider-key', baseURL: 'https://provider.example/v1' })
    expect(mocks.createCompletion).toHaveBeenCalledWith({
      model: 'provider-model',
      messages: [{ role: 'user', content: '你好' }]
    })
  })

  it('服务商未返回文本时抛出明确错误', async () => {
    mocks.createCompletion.mockResolvedValue({ choices: [{ message: { content: null } }] })
    const provider = createOpenAiCompatibleProvider('provider-key', 'provider-model')

    await expect(provider.chat([{ role: 'user', content: '你好' }])).rejects.toThrow('LLM 未返回文本内容')
  })
})
