import { describe, expect, it } from 'vitest'
import { mapOneBotMessage, removeBotMention } from '../src/gateway/qq/mapper.js'

describe('OneBot 消息映射', () => {
  it('按 at 段目标识别机器人，而非显示文本', () => {
    const message = mapOneBotMessage({ post_type: 'message', message_type: 'group', message_id: 1, self_id: 99, user_id: 7, group_id: 8, time: 1, message: [{ type: 'at', data: { qq: '99' } }, { type: 'text', data: { text: ' 你好' } }, { type: 'image', data: {} }] })
    expect(message).toMatchObject({ id: '1', chatType: 'group', userId: '7', groupId: '8', text: ' 你好', mentionsBot: true })
    expect(removeBotMention(message!).text).toBe('你好')
  })
  it('拒绝没有 group_id 的群事件', () => expect(mapOneBotMessage({ post_type: 'message', message_type: 'group', message_id: 1, self_id: 2, user_id: 3, time: 1, message: [] })).toBeNull())
})
