---
type: feature
feature: chat-interaction
status: active
created: 2026-09-19
updated: 2026-09-19
related: []
---

# 聊天交互

## 功能概览

该 Feature 将 NapCatQQ 通过 OneBot 11 正向 WebSocket 上报的 QQ 消息转换为统一消息模型，并完成权限判断、命令处理、会话持久化和 OpenAI-compatible Chat Completions 回复。

## 当前行为

- 私聊文本直接进入处理；群聊仅在群号属于 `ALLOWED_GROUP_IDS` 且消息段中确实 `@` 当前机器人账号时处理。
- 私聊按 `private:<userId>` 隔离会话，群聊按 `group:<groupId>:<userId>` 隔离会话；`/clear` 只清除当前会话历史。
- 内置 `/ping`、`/help` 和 `/clear`；未知斜杠命令返回可用命令帮助。
- 普通 AI 对话会先持久化用户消息，再请求模型；模型回答持久化后再通过 OneBot 发送。相同外部消息和短时间重推会被去重。
- 私聊或群内 `@机器人` 时可以引用一条 QQ 消息：被引用文本会加入当前会话上下文；被引用图片会在模型支持 Vision 时作为 `image_url` 加入本次请求。旧消息或已撤回消息无法回查时会明确提示用户。
- 路由对单个会话串行处理并执行进程内限流；回复总长度最多为 6000 个字符，按最多 1500 个字符分段发送。

## 约束与限制

- 本项目不负责安装 NapCatQQ 或登录机器人 QQ 账号；NapCatQQ 必须以消息段数组上报，才能可靠识别群内 `@机器人`。
- 白名单为空时，所有群消息均不触发该 Feature；用户或群在数据库中被标记为禁用时同样静默处理。
- 会话、去重和限流的运行时状态位于单个进程内；其跨进程行为不在当前实现保证范围内。
- 引用内容按 OneBot `get_msg` 即时回查，受 NapCat 消息缓存和图片 URL 时效影响；只解析一层引用，图片 URL 不写入数据库。
- 图片识别能力取决于 `OPENAI_MODEL` 及对应服务商是否支持 Chat Completions `image_url` 多模态输入。

## 关联文档

- [MVP 架构](../../architecture.md)
- [Linux 服务器 Docker 部署指南](../../deployment.md)
- [QQ Bot 排障指南](../../排障指南.md)

## 代码位置

- `src/gateway/qq/mapper.ts`：OneBot 事件到统一消息模型的映射与 `@` 移除。
- `src/gateway/qq/quoted-message-resolver.ts`：通过 `get_msg` 读取并校验被引用消息。
- `src/bot/router.ts`：固定路由顺序、会话隔离、命令和 AI 对话处理。
- `src/commands/builtin.ts`：内置命令。
- `src/database/repositories/conversation-repository.ts`：用户、群、会话与消息持久化。
- `src/llm/openai-compatible-provider.ts`：OpenAI-compatible Chat Completions 适配。

## 设计文档

- [QQ 引用消息上下文技术设计](quoted-message-context-design.md)
