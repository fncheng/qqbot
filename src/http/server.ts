import Fastify, { type FastifyInstance } from 'fastify'
import type { DatabaseConnection } from '../database/client.js'
import type { OneBotClient } from '../gateway/qq/client.js'

export function createHttpServer(database: DatabaseConnection, oneBot: OneBotClient): FastifyInstance {
  const app = Fastify({ logger: false })
  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (_request, reply) => {
    try {
      await database.ping()
      if (!oneBot.connected) return reply.code(503).send({ status: 'not_ready' })
      return { status: 'ready' }
    } catch { return reply.code(503).send({ status: 'not_ready' }) }
  })
  return app
}
