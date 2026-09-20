import 'dotenv/config'
import { z } from 'zod'
import { reasoningEffortValues } from '../llm/types.js'

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value)
function parseGroupIds(value: string): ReadonlySet<string> { return new Set(value.split(',').map((id) => id.trim()).filter(Boolean)) }

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine((value) => { const protocol = new URL(value).protocol; return protocol === 'postgres:' || protocol === 'postgresql:' }, 'DATABASE_URL 必须使用 postgres 或 postgresql 协议'),
  NAPCAT_WS_URL: z.string().url().refine((value) => { const protocol = new URL(value).protocol; return protocol === 'ws:' || protocol === 'wss:' }, 'NAPCAT_WS_URL 必须使用 ws 或 wss 协议'),
  NAPCAT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  BOT_OWNER_QQ: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ALLOWED_GROUP_IDS: z.string().default(''),
  GROUP_SUMMARY_ENABLED_GROUP_IDS: z.string().default(''),
  GROUP_SUMMARY_TIMEZONE: z.string().default('Asia/Shanghai').refine((value) => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true } catch { return false }
  }, 'GROUP_SUMMARY_TIMEZONE 必须是有效 IANA 时区'),
  GROUP_SUMMARY_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  GROUP_SUMMARY_CACHE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  GROUP_SUMMARY_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
  GROUP_SUMMARY_CHUNK_CHAR_LIMIT: z.coerce.number().int().min(500).max(20000).default(6000),
  GROUP_SUMMARY_MAX_SOURCE_MESSAGES: z.coerce.number().int().min(1).max(10000).default(2000),
  GROUP_SUMMARY_MAX_SOURCE_CHARS: z.coerce.number().int().min(1000).max(1_000_000).default(100000),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OPENAI_MODEL: z.string().min(1),
  // 留空时不干预服务商默认行为；非空时必须是 Chat Completions 支持的标准推理强度。
  LLM_REASONING_EFFORT: z.preprocess(emptyToUndefined, z.enum(reasoningEffortValues).optional()),
  OPENAI_SYSTEM_PROMPT: z.string().min(1),
  LLM_HISTORY_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  ONEBOT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000)
})

export type AppConfig = Readonly<z.infer<typeof envSchema>> & {
  readonly allowedGroupIds: ReadonlySet<string>
  readonly groupSummaryEnabledGroupIds: ReadonlySet<string>
}

/** 启动期集中校验环境变量，避免服务在运行中因缺少配置失败。 */
export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(input)
  const allowedGroupIds = parseGroupIds(parsed.ALLOWED_GROUP_IDS)
  const requestedSummaryGroupIds = parseGroupIds(parsed.GROUP_SUMMARY_ENABLED_GROUP_IDS)
  return Object.freeze({
    ...parsed,
    allowedGroupIds,
    // 总结归档必须同时受白名单和显式开关约束，避免仅配置开关时扩大群数据收集范围。
    groupSummaryEnabledGroupIds: new Set([...requestedSummaryGroupIds].filter((id) => allowedGroupIds.has(id)))
  })
}
