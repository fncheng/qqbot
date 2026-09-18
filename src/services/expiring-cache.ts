/** 固定容量、惰性过期清理的内存集合，适合单进程 MVP 去重。 */
export class ExpiringSet {
  #items = new Map<string, number>()
  constructor(private readonly ttlMs: number, private readonly capacity: number, private readonly now: () => number = Date.now) {}
  hasOrAdd(key: string): boolean {
    this.cleanup()
    if (this.#items.has(key)) return true
    if (this.#items.size >= this.capacity) this.#items.delete(this.#items.keys().next().value as string)
    this.#items.set(key, this.now() + this.ttlMs)
    return false
  }
  private cleanup(): void { const current = this.now(); for (const [key, expiresAt] of this.#items) if (expiresAt <= current) this.#items.delete(key) }
}
