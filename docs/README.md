---
type: index
status: active
created: 2026-09-19
updated: 2026-09-19
related: []
---

# QQ Chatbot NapCat OneBot 项目文档

本目录保存经过仓库代码、配置和既有文档核实的长期知识。功能当前行为以 Feature 入口和源码为准；部署、运维和排障文档保留其既有稳定路径。

## 功能索引

| Feature | 状态 | 说明 |
| --- | --- | --- |
| [chat-interaction](features/chat-interaction/README.md) | active | 私聊与白名单群内 `@机器人` 的命令、会话和 AI 回复处理。 |
| [group-chat-summary](features/group-chat-summary/README.md) | active | 已显式启用群的文本归档、当日 Map-Reduce 总结与缓存。 |

## 既有项目文档

- [MVP 架构](architecture.md)：消息处理主链路和核心模块边界。
- [群聊每日总结功能设计方案](group-chat-summary-design.md)：总结功能的方案选择与设计背景；其中“当前实现与缺口”描述的是实施前状态，当前行为请读取对应 Feature 入口。
- [Linux 服务器 Docker 部署指南](deployment.md)：NapCatQQ、业务服务和 PostgreSQL 的服务器部署。
- [QQ Bot 运维指南](运维指南.md)：运行状态、日志、更新、备份和高风险操作约束。
- [QQ Bot 排障指南](排障指南.md)：部署、连接、配置和迁移的常见故障处理。

## 目录与规范

- `features/`：按长期业务能力组织的当前上下文；每个 Feature 以其 `README.md` 为入口。
- `_templates/`：新增受管理文档时使用的模板。
- 根目录中的部署、架构、运维和排障文档保持既有路径；普通初始化不移动或重命名它们。

Feature 目录使用 lowercase kebab-case。受管理的 Feature、需求、设计、原型、Bug、Investigation 与 ADR 文档使用 YAML frontmatter；Feature 文档使用 `feature`，独立记录使用稳定的 `id`。跨文档关系通过 `related` 字段维护。

| 文档类型 | 可用状态 |
| --- | --- |
| Feature / requirements / design / prototype | `active`, `stable`, `deprecated`, `superseded` |
| Bug | `confirmed`, `fixed`, `deprecated`, `superseded` |
| Investigation | `proposed`, `in-progress`, `completed`, `deprecated`, `superseded` |
| 决策 | `proposed`, `accepted`, `deprecated`, `superseded` |

## 使用方式

1. 从相关 Feature 的 `README.md` 了解已验证的当前行为。
2. 按任务需要读取关联的设计、部署、运维或排障资料。
3. 通过 `related` 追踪跨 Feature 或独立记录。
4. 仅在任务需要沉淀长期事实、约束或决策时维护文档；不记录临时调试过程、未验证猜测或 Git 流水账。
5. 新增受管理文档后，检查 frontmatter、相对链接和本索引。
