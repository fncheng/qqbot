import { z } from 'zod'

export const oneBotSegmentSchema = z.object({ type: z.string(), data: z.record(z.string(), z.unknown()).default({}) })
export const oneBotMessageEventSchema = z.object({
  post_type: z.literal('message'),
  message_type: z.enum(['private', 'group']),
  message_id: z.union([z.string(), z.number()]),
  self_id: z.union([z.string(), z.number()]),
  user_id: z.union([z.string(), z.number()]),
  group_id: z.union([z.string(), z.number()]).optional(),
  time: z.number().int().nonnegative(),
  raw_message: z.string().optional(),
  message: z.array(oneBotSegmentSchema).or(z.string())
})
export type OneBotMessageEvent = z.infer<typeof oneBotMessageEventSchema>

/** OneBot API 响应必须有完整状态字段，避免误将普通事件当作调用成功。 */
export const oneBotApiResponseSchema = z.object({
  status: z.enum(['ok', 'failed']),
  retcode: z.number().int(),
  echo: z.string(),
  data: z.unknown().optional()
})
export type OneBotApiResponse = z.infer<typeof oneBotApiResponseSchema>
export interface OneBotRequest { readonly action: string; readonly params: Record<string, unknown>; readonly echo: string }
