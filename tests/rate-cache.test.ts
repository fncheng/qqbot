import { describe, expect, it } from 'vitest'
import { ExpiringSet } from '../src/services/expiring-cache.js'
import { MemoryRateLimiter } from '../src/services/rate-limiter.js'
import type { BotMessage } from '../src/types/message.js'

const message: BotMessage = { id: 'm', platform: 'qq', selfId: 'bot', chatType: 'private', userId: 'u', text: 'x', segments: [{ type: 'text', text: 'x' }], mentionsBot: false, timestamp: 1 }

describe('内存防护', () => {
  it('去重按 TTL 过期', () => { let now = 0; const cache = new ExpiringSet(10, 3, () => now); expect(cache.hasOrAdd('x')).toBe(false); expect(cache.hasOrAdd('x')).toBe(true); now = 10; expect(cache.hasOrAdd('x')).toBe(false) })
  it('私聊在 10 秒内只允许 5 条', () => { const limiter = new MemoryRateLimiter(); for (let index = 0; index < 5; index += 1) expect(limiter.allow(message)).toBe(true); expect(limiter.allow(message)).toBe(false) })
})
