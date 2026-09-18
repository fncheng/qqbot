import type { BotMessage } from '../types/message.js'

interface Bucket { readonly timestamps: number[] }
/** 滑动窗口限流：私聊按用户，群聊按群，缓存数量受上限约束。 */
export class MemoryRateLimiter {
  #buckets = new Map<string, Bucket>()
  constructor(private readonly windowMs = 10_000, private readonly privateLimit = 5, private readonly groupLimit = 10, private readonly capacity = 10_000, private readonly now: () => number = Date.now) {}
  allow(message: BotMessage): boolean {
    const key = message.chatType === 'private' ? `private:${message.userId}` : `group:${message.groupId ?? ''}`
    if (this.#buckets.size >= this.capacity && !this.#buckets.has(key)) this.#buckets.delete(this.#buckets.keys().next().value as string)
    const start = this.now() - this.windowMs
    const bucket = this.#buckets.get(key) ?? { timestamps: [] }
    while (bucket.timestamps[0] !== undefined && bucket.timestamps[0] <= start) bucket.timestamps.shift()
    const limit = message.chatType === 'private' ? this.privateLimit : this.groupLimit
    if (bucket.timestamps.length >= limit) return false
    bucket.timestamps.push(this.now()); this.#buckets.set(key, bucket); return true
  }
}
