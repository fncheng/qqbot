import 'dotenv/config'
import { z } from 'zod'

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine((value) => { const protocol = new URL(value).protocol; return protocol === 'postgres:' || protocol === 'postgresql:' }, 'DATABASE_URL 必须使用 postgres 或 postgresql 协议'),
  NAPCAT_WS_URL: z.string().url().refine((value) => { const protocol = new URL(value).protocol; return protocol === 'ws:' || protocol === 'wss:' }, 'NAPCAT_WS_URL 必须使用 ws 或 wss 协议'),
  NAPCAT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  BOT_OWNER_QQ: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ALLOWED_GROUP_IDS: z.string().default(''),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_SYSTEM_PROMPT: z.string().min(1),
  LLM_HISTORY_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  ONEBOT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000)
})

export type AppConfig = Readonly<z.infer<typeof envSchema>> & { readonly allowedGroupIds: ReadonlySet<string> }

/** 启动期集中校验环境变量，避免服务在运行中因缺少配置失败。 */
export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(input)
  return Object.freeze({
    ...parsed,
    allowedGroupIds: new Set(parsed.ALLOWED_GROUP_IDS.split(',').map((id) => id.trim()).filter(Boolean))
  })
}
