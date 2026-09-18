# 部署说明

服务使用 Node.js 24 和 PostgreSQL 16。NapCatQQ 应在宿主机或独立容器运行，机器人通过 `NAPCAT_WS_URL` 主动连接其正向 WebSocket。本地运行时 `DATABASE_URL` 通常使用 `127.0.0.1:5432`；Compose 中服务间必须使用 `postgres:5432`，由 `docker-compose.yml` 覆盖该变量。NapCat 位于宿主机时，容器内地址使用 `host.docker.internal`，Compose 已提供 Linux `host-gateway` 映射。

NapCat OneBot 必须将消息上报为消息段数组，而非单个字符串，才能通过 `at` 段目标和 `self_id` 稳定判断群聊是否真正提及机器人。

不要提交 `.env`。`NAPCAT_TOKEN`、`OPENAI_API_KEY`、`DATABASE_URL` 不应出现在日志或部署平台的公开输出中。生产环境请将 PostgreSQL 密码改为安全值，并将 `ALLOWED_GROUP_IDS` 显式设为可信群号。
