import { createBuiltinCommands } from './commands/builtin.js'
import { CommandRegistry } from './commands/registry.js'
import { loadConfig } from './config/env.js'
import { createDatabase } from './database/client.js'
import { createConversationRepository } from './database/repositories/conversation-repository.js'
import { OneBotClient } from './gateway/qq/client.js'
import { mapOneBotMessage } from './gateway/qq/mapper.js'
import { createQqSender } from './gateway/qq/sender.js'
import { createHttpServer } from './http/server.js'
import { createOpenAiProvider } from './llm/openai-provider.js'
import { BotRouter } from './bot/router.js'
import { createLogger, safeError } from './utils/logger.js'

const config = loadConfig()
const logger = createLogger()
const database = createDatabase(config.DATABASE_URL)
const repository = createConversationRepository(database.db)
const oneBot = new OneBotClient({
  url: config.NAPCAT_WS_URL, ...(config.NAPCAT_TOKEN === undefined ? {} : { token: config.NAPCAT_TOKEN }), timeoutMs: config.ONEBOT_REQUEST_TIMEOUT_MS, logger,
  onEvent: (event) => {
    const message = mapOneBotMessage(event)
    if (message) void router.handle(message).catch((error: unknown) => logger.error({ error: safeError(error), messageId: message.id }, '消息事件处理失败'))
  }
})
const gateway = createQqSender(oneBot)
const commands = new CommandRegistry(createBuiltinCommands(repository))
const llm = createOpenAiProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL, config.OPENAI_BASE_URL)
const router = new BotRouter({ config, repository, llm, gateway, commands, logger })
const http = createHttpServer(database, oneBot)

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, '开始优雅退出')
  oneBot.pauseEvents()
  await http.close()
  const deadline = Date.now() + config.SHUTDOWN_TIMEOUT_MS
  while (router.processingCount > 0 && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 50))
  oneBot.close()
  await database.close()
  logger.info('服务已退出')
}

process.on('SIGINT', () => { void shutdown('SIGINT').then(() => process.exit(0)).catch((error: unknown) => { logger.error({ error: safeError(error) }, '退出失败'); process.exit(1) }) })
process.on('SIGTERM', () => { void shutdown('SIGTERM').then(() => process.exit(0)).catch((error: unknown) => { logger.error({ error: safeError(error) }, '退出失败'); process.exit(1) }) })

try {
  await http.listen({ host: config.HOST, port: config.PORT })
  oneBot.connect()
  logger.info({ port: config.PORT }, 'HTTP 健康检查服务已启动')
} catch (error: unknown) {
  logger.fatal({ error: safeError(error) }, '服务启动失败')
  oneBot.close()
  if (http.server.listening) await http.close()
  await database.close()
  process.exitCode = 1
}
