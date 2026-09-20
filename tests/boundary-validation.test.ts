import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'
import { oneBotApiResponseSchema } from '../src/gateway/qq/types.js'

describe('外部边界校验', () => {
  it('不将只有 echo 的对象视为 OneBot API 响应', () => {
    expect(oneBotApiResponseSchema.safeParse({ echo: 'request-id' }).success).toBe(false)
    expect(oneBotApiResponseSchema.safeParse({ echo: 'request-id', status: 'ok', retcode: 0 }).success).toBe(true)
  })
  it('仅接受 PostgreSQL 与 WebSocket 协议', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost/db', NAPCAT_WS_URL: 'wss://localhost:3001', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', OPENAI_SYSTEM_PROMPT: 'system' }
    expect(loadConfig(base).DATABASE_URL).toBe(base.DATABASE_URL)
    expect(() => loadConfig({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow()
    expect(() => loadConfig({ ...base, NAPCAT_WS_URL: 'http://localhost:3001' })).toThrow()
  })

  it('仅接受标准推理强度，并保留 none 作为关闭推理的显式值', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost/db', NAPCAT_WS_URL: 'wss://localhost:3001', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', OPENAI_SYSTEM_PROMPT: 'system' }
    expect(loadConfig({ ...base, LLM_REASONING_EFFORT: 'none' }).LLM_REASONING_EFFORT).toBe('none')
    expect(loadConfig({ ...base, LLM_REASONING_EFFORT: 'high' }).LLM_REASONING_EFFORT).toBe('high')
    expect(() => loadConfig({ ...base, LLM_REASONING_EFFORT: 'ultra' })).toThrow()
  })
})
