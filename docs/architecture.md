# MVP 架构

`NapCatQQ -> OneBotClient -> mapper -> BotRouter -> PostgreSQL/LLM -> sender -> NapCatQQ`。

`BotRouter` 仅处理内部 `BotMessage`，不导入 OneBot 或 OpenAI 类型。其固定顺序为：自发与空消息过滤、去重、群白名单、限流、群 `@` 校验、按会话串行、指令或 AI。

LLM 用户消息先落库，再请求 OpenAI；成功回答先落库，再发送 QQ。`/clear` 只删除当前 Conversation 的消息。
