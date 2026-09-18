import { sql } from 'drizzle-orm'
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['OWNER', 'ADMIN', 'USER', 'BLOCKED'])
export const userStatus = pgEnum('user_status', ['ACTIVE', 'BLOCKED'])
export const messageRole = pgEnum('message_role', ['system', 'user', 'assistant', 'tool'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  qqUserId: varchar('qq_user_id', { length: 32 }).notNull(),
  nickname: varchar('nickname', { length: 100 }),
  status: userStatus('status').notNull().default('ACTIVE'),
  role: userRole('role').notNull().default('USER'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('users_qq_user_id_unique').on(table.qqUserId)])

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  qqGroupId: varchar('qq_group_id', { length: 32 }).notNull(),
  name: varchar('name', { length: 255 }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('groups_qq_group_id_unique').on(table.qqGroupId)])

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationKey: varchar('conversation_key', { length: 128 }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('conversations_key_unique').on(table.conversationKey), index('conversations_user_idx').on(table.userId), index('conversations_group_idx').on(table.groupId)])

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'restrict' }),
  role: messageRole('role').notNull(),
  content: text('content').notNull(),
  platform: varchar('platform', { length: 16 }),
  externalMessageId: varchar('external_message_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index('messages_conversation_created_idx').on(table.conversationId, table.createdAt, table.id),
  uniqueIndex('messages_external_id_unique').on(table.platform, table.externalMessageId).where(sql`${table.externalMessageId} is not null`),
  check('messages_external_identity_pair', sql`(${table.platform} is null and ${table.externalMessageId} is null) or (${table.platform} is not null and ${table.externalMessageId} is not null)`)
])
