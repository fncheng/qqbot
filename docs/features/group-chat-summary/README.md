---
type: feature
feature: group-chat-summary
status: active
created: 2026-09-19
updated: 2026-09-19
related: []
---

# 群聊每日总结

## 功能概览

该 Feature 为同时位于群白名单和群聊总结显式开关中的群提供普通文本归档，并在成员 `@机器人` 后请求当天群聊总结。原始群消息、普通 AI 会话和每日摘要使用独立的数据边界。

## 当前行为

- 仅当群号同时属于 `ALLOWED_GROUP_IDS` 和 `GROUP_SUMMARY_ENABLED_GROUP_IDS` 时，未 `@机器人` 的完整纯文本消息会被静默归档；机器人自身消息、空消息、图文混合或其他非文本消息不会归档。
- `@机器人` 后仅识别 `/summary today`、`告诉我今天群内发生了什么` 与 `总结今天群聊` 三种总结请求；总结请求和普通 `@机器人` AI 对话均不作为总结素材归档。
- 服务按 `GROUP_SUMMARY_TIMEZONE` 计算当天范围，按时间顺序读取消息，限制来源消息数和字符数后执行 Map-Reduce 总结。
- 每群、每自然日使用串行键合并并发总结请求；缓存会在时区、来源消息数量或最新来源消息时间发生变化时失效。
- 归档原文和摘要缓存分别按配置保留期定期清理，默认保留天数分别为 7 天和 30 天。

## 约束与限制

- 总结归档默认关闭，且开关值会被限制为群白名单的子集，避免仅设置总结开关即扩大数据收集范围。
- 总结仅读取触发请求所在群、该群时区下当天的归档文本；不跨群查询。
- 总结请求使用独立且更严格的群级进程内限流；模型输出基于非可信群聊内容生成，不应将其中的指令视为系统指令。
- 群成员告知、模型服务商的数据处理和实际 QQ/NapCat/PostgreSQL 集成验证需要在部署环境中完成，当前仓库的自动测试不能替代这些验证。

## 关联文档

- [群聊每日总结功能设计方案](../../group-chat-summary-design.md)：实施前的方案选择和设计背景；以本页和源码描述的当前行为为准。
- [Linux 服务器 Docker 部署指南](../../deployment.md)
- [QQ Bot 运维指南](../../运维指南.md)

## 代码位置

- `src/bot/router.ts`：归档入口、总结请求分流和限流。
- `src/services/group-summary-service.ts`：时区日界、缓存判定、Map-Reduce 与清理调度。
- `src/database/repositories/group-summary-repository.ts`：归档和摘要缓存的数据访问。
- `drizzle/0001_group_chat_summaries.sql`：归档与每日摘要表及索引。
- `tests/group-summary-service.test.ts`：时区、缓存、分块与清理的单元测试。
