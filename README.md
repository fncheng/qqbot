# QQ Chatbot NapCat OneBot MVP

基于 NapCatQQ OneBot 11 正向 WebSocket 的 TypeScript QQ 聊天机器人。业务服务不包含 NapCat 安装和 QQ 登录；请先在 NapCat 中启用正向 WebSocket。

## 功能

- 私聊 AI、白名单群内 `@机器人` AI；群白名单为空时完全不回复群消息。
- `/ping`、`/help`、`/clear`，群命令同样必须 `@机器人`。
- PostgreSQL 会话持久化，OpenAI Responses API（`store: false`），OneBot 鉴权、重连、echo 关联与超时。
- 单进程限流、五分钟消息去重、按会话串行、健康检查与优雅退出。

## 启动

1. 本地运行时复制 `.env.example` 为 `.env`，使用本地 PostgreSQL 的 `DATABASE_URL`（例如 `127.0.0.1:5432`），填写 `OPENAI_API_KEY`、`NAPCAT_WS_URL`。`ALLOWED_GROUP_IDS` 以英文逗号分隔。
2. 对 PostgreSQL 执行 `drizzle/0000_initial.sql`。Compose 首次初始化命名卷时会自动执行该迁移；已有数据库请人工执行。
3. 安装依赖后运行 `pnpm start`。健康检查位于 `/health/live` 和 `/health/ready`。

`/health/ready` 仅在 HTTP 服务、PostgreSQL 和 OneBot WebSocket 都可用时返回 200。自动测试不替代 NapCat、QQ、PostgreSQL、OpenAI 的真实集成验证。

## Docker Compose

Compose 中机器人容器的 `DATABASE_URL` 固定连接 Compose 服务 `postgres:5432`，不使用本地 `.env` 中的 `127.0.0.1`。若 NapCat 在宿主机运行，请将容器内 `NAPCAT_WS_URL` 配置为 `ws://host.docker.internal:<端口>`；Compose 已添加 Linux 所需的 `host-gateway` 映射。

NapCat 必须启用 OneBot 11 正向 WebSocket，并将消息上报格式配置为**消息段数组**。只有数组中的 `at` 段且其 `qq` 等于 `self_id` 才会触发群聊机器人；字符串 `message` 无法可靠识别 `@机器人`。
