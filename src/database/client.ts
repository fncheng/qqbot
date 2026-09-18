import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

export type Database = PostgresJsDatabase<typeof schema>

export interface DatabaseConnection { readonly db: Database; close(): Promise<void>; ping(): Promise<void> }

export function createDatabase(url: string): DatabaseConnection {
  const client = postgres(url, { max: 10 })
  return { db: drizzle(client, { schema }), close: () => client.end(), ping: async () => { await client`select 1` } }
}
