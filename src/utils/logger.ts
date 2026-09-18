import pino, { type Logger } from 'pino'

function redactErrorText(value: string): string {
  return value
    .replace(/([a-z][a-z\d+.-]*:\/\/[^\s/:@]+:)([^@\s/]+)(@)/gi, '$1[REDACTED]$3')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|password)\s*=\s*)[^\s&,;]+/gi, '$1[REDACTED]')
}

/** 只记录 Error 的诊断摘要，避免 SDK 请求对象携带的密钥或请求体进入日志。 */
export function safeError(error: unknown): { readonly name: string; readonly message: string; readonly stack?: string } {
  if (error instanceof Error) return { name: error.name, message: redactErrorText(error.message), ...(error.stack === undefined ? {} : { stack: redactErrorText(error.stack) }) }
  return { name: 'UnknownError', message: redactErrorText(String(error)) }
}

export function createLogger(): Logger {
  return pino({ level: process.env.LOG_LEVEL ?? 'info', redact: { paths: ['req.headers.authorization'], censor: '[REDACTED]' } })
}
