import { describe, expect, it, vi } from 'vitest'
import { createQqQuotedMessageResolver } from '../src/gateway/qq/quoted-message-resolver.js'
import type { BotMessage } from '../src/types/message.js'

const source: BotMessage = {
  id: 'current', platform: 'qq', selfId: 'bot', chatType: 'group', userId: 'user', groupId: '100',
  text: '请评论', segments: [{ type: 'reply', messageId: 'original' }], mentionsBot: true, timestamp: 1
}

describe('QQ 引用消息读取', () => {
  it('通过 get_msg 提取发送者、文本和远程图片', async () => {
    const call = vi.fn().mockResolvedValue({
      status: 'ok', retcode: 0, echo: 'echo',
      data: {
        message_type: 'group', group_id: 100,
        sender: { user_id: 7, nickname: '成员' },
        message: [
          { type: 'text', data: { text: '原始文本' } },
          { type: 'image', data: { file: 'a.jpg', url: 'https://example.com/a.jpg', summary: '截图' } }
        ]
      }
    })
    const resolver = createQqQuotedMessageResolver({ call })

    await expect(resolver.resolve(source, 'original')).resolves.toEqual({
      messageId: 'original', senderId: '7', senderDisplayName: '成员',
      text: '原始文本[图片：截图]', images: [{ url: 'https://example.com/a.jpg', summary: '截图' }]
    })
    expect(call).toHaveBeenCalledWith('get_msg', { message_id: 'original' })
  })

  it('拒绝来自其他群的引用结果', async () => {
    const call = vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, echo: 'echo', data: { message_type: 'group', group_id: 200, message: '越界内容' } })
    const resolver = createQqQuotedMessageResolver({ call })
    await expect(resolver.resolve(source, 'original')).resolves.toBeNull()
  })
})
