# QQ Chatbot NapCat OneBot MVP

基于 NapCatQQ OneBot 11 正向 WebSocket 的 TypeScript QQ 聊天机器人。业务服务不包含 NapCat 安装和 QQ 登录；请先在 NapCat 中启用正向 WebSocket。

## 功能

- 私聊 AI、白名单群内 `@机器人` AI；群白名单为空时完全不回复群消息。
- `/ping`、`/help`、`/clear`，群命令同样必须 `@机器人`。
- PostgreSQL 会话持久化，OpenAI Responses API（`store: false`），OneBot 鉴权、重连、echo 关联与超时。
- 单进程限流、五分钟消息去重、按会话串行、健康检查与优雅退出。
- GitHub Actions 自动发布 `linux/amd64` 和 `linux/arm64` 的 GHCR 镜像，服务器无需克隆源码或现场构建。

## 工作原理

```text
QQ 私聊或群聊消息
  -> NapCatQQ 登录的机器人 QQ 账号
  -> OneBot 11 正向 WebSocket
  -> 本项目进行权限、限流、指令和会话处理
  -> PostgreSQL 保存会话，OpenAI 生成回答
  -> OneBot send_private_msg/send_group_msg
  -> NapCatQQ 将回答发送到 QQ
```

本项目不包含 NapCatQQ，也不会直接登录 QQ。NapCatQQ 负责登录 QQ 和收发消息，本项目作为 WebSocket 客户端连接 NapCatQQ，并处理机器人业务。

## 部署步骤

第一次在 Linux 服务器上部署时，请优先阅读 [Linux 服务器 Docker 部署指南](docs/deployment.md)。该文档包含 Docker 安装、NapCatQQ 容器部署、QQ 扫码登录、OneBot WebSocket 配置、机器人启动、加群验证和故障排查的完整步骤。

### 1. 准备运行环境

- Node.js 24 或更高版本。
- pnpm 10。
- PostgreSQL 16。
- 可用的 OpenAI API Key，或者兼容 OpenAI Responses API 的服务。
- NapCatQQ 和一个用于登录 NapCatQQ 的 QQ 账号。

建议为机器人准备单独的 QQ 账号，不要使用日常主账号。QQ 账号和密码不需要写入本项目的 `.env`；登录操作应在 NapCatQQ 中完成。使用个人 QQ 账号运行非官方机器人可能触发平台风控，请自行评估使用风险。

### 2. 安装并配置 NapCatQQ

参考 [NapCatQQ 官方安装文档](https://napneko.github.io/guide/install) 安装并启动 NapCatQQ，然后在 WebUI 中使用机器人 QQ 账号扫码登录。

登录成功后，进入 NapCatQQ WebUI 的“网络配置”，新建并启用一个 **WebSocket 服务端**：

- 连接类型：WebSocket 服务端，即 OneBot 11 正向 WebSocket。
- 监听地址：同一台机器部署时建议使用 `127.0.0.1`；跨容器或跨主机连接时根据网络环境设置。
- 端口：例如 `3001`。
- 消息上报格式：`array`，即消息段数组。
- Token：生产环境必须设置为足够强的随机字符串。
- 上报自身消息：关闭。

NapCatQQ 的 Token 必须与本项目的 `NAPCAT_TOKEN` 完全一致。不要将未配置 Token 的 WebSocket 端口暴露到公网。

NapCat 必须使用消息段数组上报消息。项目只会在消息包含目标为当前 `self_id` 的 `at` 消息段时认定群成员真正 `@机器人`，字符串消息无法可靠完成该判断。

### 3. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

至少检查并填写以下配置：

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/qq_bot
NAPCAT_WS_URL=ws://127.0.0.1:3001
NAPCAT_TOKEN=与NapCatQQ中配置的Token一致
BOT_OWNER_QQ=机器人所有者的QQ号
ALLOWED_GROUP_IDS=允许使用机器人的QQ群号
OPENAI_API_KEY=你的OpenAIAPIKey
OPENAI_MODEL=gpt-4.1-mini
```

配置说明：

- `NAPCAT_WS_URL`：NapCatQQ WebSocket 服务端地址。
- `NAPCAT_TOKEN`：NapCatQQ WebSocket 鉴权 Token。NapCatQQ 未设置 Token 时可以留空，但不建议用于生产环境。
- `BOT_OWNER_QQ`：机器人所有者的个人 QQ 号，可以留空。它不是登录 NapCatQQ 的机器人 QQ 号。
- `ALLOWED_GROUP_IDS`：允许机器人回复的 QQ 群号，多个群号使用英文逗号分隔，例如 `123456,789012`。留空时机器人不会回复任何群消息。
- `OPENAI_BASE_URL`：使用兼容服务时填写对应 API 地址，直接使用 OpenAI 时可以留空。
- `OPENAI_SYSTEM_PROMPT`：机器人的系统提示词。

机器人 QQ 号不需要单独写入配置。项目会从 OneBot 消息事件的 `self_id` 自动识别当前机器人账号。

### 4. 本地部署

安装依赖：

```bash
pnpm install
```

创建 PostgreSQL 数据库后，执行初始化迁移：

```bash
psql "$DATABASE_URL" -f drizzle/0000_initial.sql
```

如果 `DATABASE_URL` 只写在 `.env` 中，没有导出为 Shell 环境变量，也可以直接向 `psql` 传入实际连接地址。

启动机器人：

```bash
pnpm start
```

开发时可以使用文件监听模式：

```bash
pnpm dev
```

### 5. Docker Compose 部署

项目提供两种 Compose 配置：

- `docker-compose.yml`：只启动机器人业务服务和 PostgreSQL，适用于已经在宿主机或其他服务器运行 NapCatQQ 的环境。
- `docker-compose.server.yml`：从 `ghcr.io/fncheng/qqbot` 拉取业务镜像，并启动 NapCatQQ、机器人业务服务和 PostgreSQL，推荐用于新 Linux 服务器。

首次部署整套服务时，不需要克隆项目源码。按照 [Linux 服务器 Docker 部署指南](docs/deployment.md) 下载 GitHub Release 部署包，配置服务器环境变量后启动：

```bash
cp .env.server.example .env
docker compose -f docker-compose.server.yml up -d
```

生产环境应将 `.env` 中的 `QQ_BOT_IMAGE` 固定为发布版本，例如 `ghcr.io/fncheng/qqbot:v0.1.0`，避免长期跟随 `latest`。

如果只需要启动机器人业务服务和 PostgreSQL，确保 `.env` 已正确填写，然后运行：

```bash
docker compose up -d
```

PostgreSQL 首次创建命名卷时会自动执行 `drizzle/0000_initial.sql`；如果数据库命名卷已经存在，需要人工执行迁移。

基础 `docker-compose.yml` 中的机器人容器会连接 `postgres:5432`。如果 NapCatQQ 在 Docker 宿主机运行，应配置：

```dotenv
NAPCAT_WS_URL=ws://host.docker.internal:3001
```

`docker-compose.yml` 已提供 Linux 所需的 `host-gateway` 映射。服务器专用 `docker-compose.server.yml` 会通过 Compose 服务名连接 `ws://napcat:3001`，不向公网暴露 OneBot WebSocket 端口。

### 6. 检查服务状态

健康检查接口：

```text
GET /health/live
GET /health/ready
```

- `/health/live` 用于确认 HTTP 进程存活。
- `/health/ready` 仅在 HTTP 服务、PostgreSQL 和 OneBot WebSocket 都可用时返回 HTTP 200。

默认地址为：

```text
http://127.0.0.1:3000/health/live
http://127.0.0.1:3000/health/ready
```

## 使用步骤

### 1. 将机器人加入 QQ 群

NapCatQQ 登录的是一个普通 QQ 账号，因此需要像邀请普通群成员一样，将该机器人 QQ 账号邀请到目标群聊。如果群聊限制成员邀请，需要由群主或管理员完成邀请或审批。

然后将该群的 QQ 群号加入 `.env`：

```dotenv
ALLOWED_GROUP_IDS=123456789
```

修改 `.env` 后需要重启机器人服务才能重新加载配置。

### 2. 在群聊中使用

群聊消息必须 `@机器人`，否则项目会静默忽略。可以先测试内置指令：

```text
@机器人 /ping
```

预期回复：

```text
pong
```

开始 AI 对话：

```text
@机器人 请介绍一下你自己
```

每个群成员在每个群中拥有独立的会话上下文，不会与其他群成员共用对话历史。

### 3. 在私聊中使用

直接给机器人 QQ 账号发送消息即可，不需要配置群白名单，也不需要 `@机器人`。

### 4. 内置指令

| 指令     | 作用                               |
| -------- | ---------------------------------- |
| `/ping`  | 检查机器人是否能够正常回复         |
| `/help`  | 显示当前可用指令                   |
| `/clear` | 清除当前私聊或当前群成员的对话历史 |

群聊中使用指令时同样必须 `@机器人`，例如：

```text
@机器人 /clear
```

## 常见问题

### 私聊可以回复，但群聊没有反应

依次检查：

1. 机器人 QQ 账号是否已经进入目标群。
2. 目标群号是否存在于 `ALLOWED_GROUP_IDS`。
3. 群消息是否真正 `@` 了机器人，而不是只输入机器人昵称。
4. NapCatQQ 的消息上报格式是否为 `array`。
5. 修改 `.env` 后是否重启了机器人服务。

### `/health/live` 正常，但 `/health/ready` 返回非 200

说明 HTTP 服务已经启动，但 PostgreSQL 或 NapCatQQ WebSocket 尚未就绪。检查 `DATABASE_URL`、`NAPCAT_WS_URL`、`NAPCAT_TOKEN` 以及 NapCatQQ WebSocket 服务端是否已经启用。

### Docker 中无法连接宿主机上的 NapCatQQ

确认 `NAPCAT_WS_URL` 使用 `ws://host.docker.internal:<端口>`，并确认 NapCatQQ 的监听地址允许来自 Docker 网络的连接。跨容器或跨主机访问时必须设置 Token，并通过防火墙限制访问来源。

自动测试不能替代 NapCatQQ、QQ、PostgreSQL 和 OpenAI 的真实集成验证。
