export interface ParsedCommand { readonly name: string; readonly args: readonly string[] }
export interface CommandContext { readonly conversationId: string; readonly userId: string; readonly groupId?: string }
export interface BotCommand { readonly name: string; readonly description: string; execute(context: CommandContext): Promise<string> }

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const [name, ...args] = trimmed.slice(1).split(/\s+/)
  if (!name) return null
  return { name: name.toLowerCase(), args }
}

export class CommandRegistry {
  #commands = new Map<string, BotCommand>()
  constructor(commands: readonly BotCommand[]) { for (const command of commands) this.#commands.set(command.name, command) }
  get(name: string): BotCommand | undefined { return this.#commands.get(name) }
  help(): string { return [...this.#commands.values()].map((command) => `/${command.name} - ${command.description}`).join('\n') }
}
