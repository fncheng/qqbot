# QQ Chatbot NapCat OneBot MVP

基于 NapCatQQ OneBot 11 正向 WebSocket 的 TypeScript QQ 聊天机器人。业务服务不包含 NapCat 安装和 QQ 登录；请先在 NapCat 中启用正向 WebSocket。

## 功能

- 私聊 AI、白名单群内 `@机器人` AI；群白名单为空时完全不回复群消息。
- 可为白名单子集显式启用群聊每日总结：仅归档未 `@机器人` 的普通文本，按 `Asia/Shanghai` 当日 Map-Reduce 总结并缓存。
- `/ping`、`/help`、`/clear`，群命令同样必须 `@机器人`。
- PostgreSQL 会话持久化，OpenAI-compatible Chat Completions，OneBot 鉴权、重连、echo 关联与超时。
- 单进程限流、五分钟消息去重、按会话串行、健康检查与优雅退出。
- GitHub Actions 自动发布 `linux/amd64` 和 `linux/arm64` 的 GHCR 镜像，服务器无需克隆源码或现场构建。

## 工作原理

```text
QQ 私聊或群聊消息
  -> NapCatQQ 登录的机器人 QQ 账号
  -> OneBot 11 正向 WebSocket
  -> 本项目进行权限、限流、指令和会话处理
  -> PostgreSQL 保存会话，配置的模型服务商生成回答
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
- 可用的模型服务商 API Key，以及兼容 OpenAI Chat Completions 的服务。
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
GROUP_SUMMARY_ENABLED_GROUP_IDS=已同意归档并启用每日总结的QQ群号
OPENAI_API_KEY=模型服务商APIKey
OPENAI_BASE_URL=模型服务商的OpenAI兼容API基础地址
OPENAI_MODEL=gpt-4.1-mini
```

配置说明：

- `NAPCAT_WS_URL`：NapCatQQ WebSocket 服务端地址。
- `NAPCAT_TOKEN`：NapCatQQ WebSocket 鉴权 Token。NapCatQQ 未设置 Token 时可以留空，但不建议用于生产环境。
- `BOT_OWNER_QQ`：机器人所有者的个人 QQ 号，可以留空。它不是登录 NapCatQQ 的机器人 QQ 号。
- `ALLOWED_GROUP_IDS`：允许机器人回复的 QQ 群号，多个群号使用英文逗号分隔，例如 `123456,789012`。留空时机器人不会回复任何群消息。
- `GROUP_SUMMARY_ENABLED_GROUP_IDS`：已显式同意文本归档和每日总结的群号，必须是 `ALLOWED_GROUP_IDS` 的子集。多个群号使用英文逗号分隔；留空时默认关闭归档。
- `GROUP_SUMMARY_TIMEZONE`：每日总结的自然日时区，默认 `Asia/Shanghai`。`GROUP_SUMMARY_RETENTION_DAYS` 默认 `7`，原始文本到期后会由每小时运行的清理任务删除；可通过 `GROUP_SUMMARY_CLEANUP_INTERVAL_MS` 调整周期。
- `OPENAI_API_KEY`：变量名为兼容历史配置而保留；接入 DeepSeek 或阿里云百炼时填写对应服务商的 API Key，不是 OpenAI API Key。
- `OPENAI_BASE_URL`：服务商的 OpenAI-compatible API 基础地址；直接使用 OpenAI 时可以留空。
- `OPENAI_MODEL`：服务商提供的模型名称，必须与 `OPENAI_BASE_URL` 对应。
- `OPENAI_SYSTEM_PROMPT`：机器人的系统提示词。

DeepSeek 配置示例：

```dotenv
OPENAI_API_KEY=你的DeepSeekAPIKey
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-flash
```

阿里云百炼通义千问配置示例：

```dotenv
OPENAI_API_KEY=你的百炼APIKey
OPENAI_BASE_URL=https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen3.8-flash
```

阿里云百炼的 API Key、业务空间和接口地址具有地域对应关系，应按实际开通地域替换示例中的北京地址。

机器人 QQ 号不需要单独写入配置。项目会从 OneBot 消息事件的 `self_id` 自动识别当前机器人账号。

### 4. 本地部署

安装依赖：

```bash
pnpm install
```

创建 PostgreSQL 数据库后，执行初始化迁移：

```bash
psql "$DATABASE_URL" -f drizzle/0000_initial.sql
psql "$DATABASE_URL" -f drizzle/0001_group_chat_summaries.sql
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

PostgreSQL 首次创建命名卷时会按文件名字典顺序自动执行 `drizzle/` 中全部 `.sql` 迁移。既有数据库命名卷不会自动重复执行新迁移；升级后需要按顺序人工执行新增文件，例如 `drizzle/0001_group_chat_summaries.sql`。

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

如已为该群设置 `GROUP_SUMMARY_ENABLED_GROUP_IDS`，未 `@机器人` 的普通文本会被静默保存，用于本群每日总结；图片、文件、语音、空文本以及所有 `@机器人` 交互均不会归档。启用前应在群内告知成员文本保存期限与模型服务商的数据处理范围。

群成员可发送以下任一明确请求获取本群当天总结：

```text
@机器人 /summary today
@机器人 告诉我今天群内发生了什么
@机器人 总结今天群聊
```

总结只读取当前群、按 `GROUP_SUMMARY_TIMEZONE` 计算的当天归档文本。当天没有新消息时会复用缓存；消息量超过配置上限时，回复会明确说明实际覆盖范围。

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
