import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { Logger } from 'pino'
import { oneBotApiResponseSchema, type OneBotApiResponse, type OneBotRequest } from './types.js'
import { safeError } from '../../utils/logger.js'

export interface OneBotClientOptions { readonly url: string; readonly token?: string; readonly timeoutMs: number; readonly logger: Logger; readonly onEvent: (event: unknown) => void }
interface PendingCall { readonly resolve: (value: OneBotApiResponse) => void; readonly reject: (reason: Error) => void; readonly timer: NodeJS.Timeout }

/** 最小正向 OneBot 11 客户端：连接和协议可靠性保持在 Gateway 边界内。 */
export class OneBotClient {
  #socket: WebSocket | undefined
  #pending = new Map<string, PendingCall>()
  #closed = false
  #acceptEvents = true
  #connected = false
  #reconnectTimer: NodeJS.Timeout | undefined
  #attempt = 0
  constructor(private readonly options: OneBotClientOptions) {}
  get connected(): boolean { return this.#connected }
  connect(): void { this.#closed = false; this.#acceptEvents = true; this.open() }
  /** 退出时停止向 Bot Core 投递新事件，但保留在途任务自行完成。 */
  pauseEvents(): void { this.#acceptEvents = false }
  private open(): void {
    const headers = this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined
    const socket = new WebSocket(this.options.url, { headers })
    this.#socket = socket
    socket.on('open', () => { this.#connected = true; this.#attempt = 0; this.options.logger.info('OneBot WebSocket 已连接') })
    socket.on('message', (payload) => this.handlePayload(payload.toString()))
    socket.on('error', (error) => this.options.logger.warn({ error: safeError(error) }, 'OneBot WebSocket 错误'))
    socket.on('close', () => { this.#connected = false; this.rejectPending(new Error('OneBot WebSocket 已断开')); if (!this.#closed) this.scheduleReconnect() })
  }
  private handlePayload(payload: string): void {
    let data: unknown
    try { data = JSON.parse(payload) as unknown } catch { this.options.logger.warn('忽略非 JSON OneBot 负载'); return }
    if (data !== null && typeof data === 'object' && typeof (data as { echo?: unknown }).echo === 'string') {
      const parsed = oneBotApiResponseSchema.safeParse(data)
      if (!parsed.success) { this.options.logger.warn('忽略格式无效的 OneBot API 响应'); return }
      const pending = this.#pending.get(parsed.data.echo)
      if (pending) { clearTimeout(pending.timer); this.#pending.delete(parsed.data.echo); pending.resolve(parsed.data); return }
    }
    if (this.#acceptEvents) this.options.onEvent(data)
  }
  private scheduleReconnect(): void {
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.#attempt++, 6))
    this.options.logger.warn({ delay }, 'OneBot 将重连')
    this.#reconnectTimer = setTimeout(() => this.open(), delay)
  }
  async call(action: string, params: Record<string, unknown>): Promise<OneBotApiResponse> {
    const socket = this.#socket
    if (!this.#connected || !socket || socket.readyState !== WebSocket.OPEN) throw new Error('OneBot WebSocket 未连接')
    const echo = randomUUID(); const request: OneBotRequest = { action, params, echo }
    return new Promise<OneBotApiResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(echo); reject(new Error(`OneBot 调用超时: ${action}`)) }, this.options.timeoutMs)
      this.#pending.set(echo, { resolve, reject, timer })
      socket.send(JSON.stringify(request), (error) => { if (error) { clearTimeout(timer); this.#pending.delete(echo); reject(error) } })
    })
  }
  close(): void { this.#closed = true; if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer); this.rejectPending(new Error('OneBot 客户端正在关闭')); this.#socket?.close() }
  private rejectPending(error: Error): void { for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error) }; this.#pending.clear() }
}
