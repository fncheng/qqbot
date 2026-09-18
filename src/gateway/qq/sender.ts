import type { MessageGateway, OutboundTextMessage } from '../../types/message.js'
import type { OneBotClient } from './client.js'

/** 将平台无关文本发送请求映射为最小 OneBot API。 */
export function createQqSender(client: OneBotClient): MessageGateway {
  return { async sendText(message: OutboundTextMessage) {
    const response = message.chatType === 'private'
      ? await client.call('send_private_msg', { user_id: message.userId, message: [{ type: 'text', data: { text: message.text } }] })
      : await client.call('send_group_msg', { group_id: message.groupId, message: [{ type: 'text', data: { text: message.text } }] })
    if (response.status !== 'ok' || response.retcode !== 0) throw new Error(`OneBot 发送失败: ${response.retcode}`)
  } }
}
