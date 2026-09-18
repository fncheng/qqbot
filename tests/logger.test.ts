import { describe, expect, it } from 'vitest'
import { safeError } from '../src/utils/logger.js'

describe('安全错误摘要', () => {
  it('隐藏 URL 密码、Bearer 和常见键值密钥', () => {
    const summary = safeError(new Error('postgresql://bot:db-secret@localhost/db Bearer token-secret apiKey=api-secret password=pw-secret'))
    const text = `${summary.message}\n${summary.stack ?? ''}`
    expect(text).not.toContain('db-secret')
    expect(text).not.toContain('token-secret')
    expect(text).not.toContain('api-secret')
    expect(text).not.toContain('pw-secret')
    expect(text).toContain('[REDACTED]')
  })
})
