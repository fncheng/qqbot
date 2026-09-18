import { describe, expect, it } from 'vitest'
import { parseCommand } from '../src/commands/registry.js'

describe('指令解析', () => {
  it('解析大小写和参数', () => expect(parseCommand(' /PING one two ')).toEqual({ name: 'ping', args: ['one', 'two'] }))
  it('非指令返回 null', () => expect(parseCommand('你好')).toBeNull())
})
