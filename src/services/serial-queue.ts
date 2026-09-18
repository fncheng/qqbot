/** 同一 key 的任务顺序执行；完成后删除链，避免会话队列泄漏。 */
export class KeyedSerialQueue {
  #chains = new Map<string, Promise<void>>()
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#chains.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(task)
    const completion = result.then(() => undefined, () => undefined)
    this.#chains.set(key, completion)
    void completion.finally(() => { if (this.#chains.get(key) === completion) this.#chains.delete(key) })
    return result
  }
  get pending(): number { return this.#chains.size }
}
