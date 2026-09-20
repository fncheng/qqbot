# Linux 服务器 Docker 部署指南

本文面向第一次部署 QQ 机器人的使用者，从一台新 Linux 服务器开始，完整部署以下三个组件：

```text
QQ 用户和群聊
      |
      v
NapCatQQ 容器：登录机器人 QQ，负责接收和发送 QQ 消息
      |
      | OneBot 11 正向 WebSocket，ws://napcat:3001
      v
qq-bot 容器：处理指令、会话、限流并调用 OpenAI
      |
      v
PostgreSQL 容器：保存用户、群、会话和消息记录
```

## 1. 先理解需要安装什么

### 1.1 推荐方案

在同一台 Ubuntu 服务器上只安装：

- curl，用于下载部署包。
- Docker Engine，用于运行容器。
- Docker Compose Plugin，用于管理多个容器。

以下软件不需要安装到服务器宿主机：

- 不需要单独安装 Node.js 或 pnpm，`qq-bot` 镜像中已经包含运行环境。
- 不需要单独安装 PostgreSQL，Compose 会启动 PostgreSQL 容器。
- 不需要安装桌面版 QQ，NapCatQQ Docker 镜像包含服务器运行所需环境。
- 不需要克隆项目源码或在服务器构建业务镜像，Compose 会从 GHCR 拉取镜像。
- 不需要把 QQ 密码写入项目，机器人账号通过 NapCatQQ WebUI 扫码登录。

需要提前准备：

- 一个建议专门用于机器人的普通 QQ 账号。
- 一个 OpenAI API Key，或者兼容 OpenAI Responses API 的服务。
- 一个需要使用机器人的 QQ 群，并有权限将机器人账号邀请入群。

NapCatQQ 和 OneBot 11 不是 QQ 官方开放平台。使用普通 QQ 账号进行自动化可能触发账号风控，建议使用独立账号并控制调用频率。

### 1.2 方案对比

| 方案                                       | 复杂度 | 维护性 | 网络暴露             | 实施成本 | 适用场景                         |
| ------------------------------------------ | ------ | ------ | -------------------- | -------- | -------------------------------- |
| 同机三个独立容器                           | 低     | 高     | 最少                 | 低       | 首次部署、个人服务器，本文推荐   |
| NapCatQQ 安装在宿主机，其他组件使用 Docker | 中     | 中     | 较少                 | 中       | 已有可用的宿主机 NapCatQQ        |
| NapCatQQ 和业务服务部署在不同服务器        | 高     | 中     | 需要跨主机 WebSocket | 高       | 需要账号层与业务层隔离的大型部署 |

本文采用第一种方案。三个组件处于同一个 Docker 网络中，但仍然是三个独立容器，可以分别更新和重启。

## 2. 服务器要求与假设

本文命令以 Ubuntu 22.04 或 Ubuntu 24.04、具有 `sudo` 权限的用户为例。NapCat Docker 镜像支持 `amd64` 和 `arm64`。

建议配置：

- 至少 2 核 CPU。
- 至少 4 GB 内存。
- 至少 20 GB 可用磁盘。
- 可以正常访问 Docker 镜像仓库、QQ 登录服务和所配置的 OpenAI API。

防火墙只需要允许 SSH 端口，通常是 TCP `22`。服务器 Compose 配置会将管理端口绑定到 `127.0.0.1`：

- `6099`：NapCatQQ WebUI，仅通过 SSH 隧道访问。
- `3000`：机器人健康检查，仅服务器本机访问。
- `3001`：OneBot WebSocket，只在 Docker 内部网络使用，不映射到宿主机。
- `5432`：PostgreSQL，只在 Docker 内部网络使用，不映射到宿主机。

## 3. 安装 Docker Engine 和 Docker Compose

如果服务器已经可以正常执行 `docker version` 和 `docker compose version`，可以跳到第 4 节。

### 3.1 添加 Docker 官方软件源

登录服务器后执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

添加 Docker Apt 软件源：

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

安装 Docker：

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3.2 验证 Docker

```bash
sudo systemctl status docker --no-pager
sudo docker version
sudo docker compose version
```

后续命令统一使用 `sudo docker`。如果需要免 `sudo` 使用 Docker，可以按照 Docker 官方文档将用户加入 `docker` 组，但需要注意：`docker` 组实际上具有接近 root 的权限。

## 4. 从 GitHub Release 获取部署文件

业务镜像发布在：

```text
ghcr.io/fncheng/qqbot
```

GitHub Actions **只会在推送 `v*` Git 标签时**自动发布镜像：

- 例如推送 `v1.2.3` 会发布 `v1.2.3`、`1.2.3`、`1.2`、`latest` 和 `sha-<提交摘要>` 镜像标签。
- 同一次工作流会创建同名 GitHub Release，并上传版本对应的部署压缩包。
- 仅推送 `master` 不会构建镜像、不更新 GHCR Package，也不会创建 GitHub Release。

生产环境应使用不可变的版本标签或镜像 digest，不要长期跟随 `latest`。项目维护者可以这样发布版本：

```bash
git tag v0.1.0
git push origin v0.1.0
```

等待仓库的 `Publish GHCR image` 工作流成功后，GitHub Release 中会出现 `qqbot-deploy-v0.1.0.tar.gz`。

### 4.1 下载版本化部署包

在服务器上执行，将版本号替换成实际发布版本：

```bash
sudo mkdir -p /opt/qqbot
sudo chown "$USER":"$USER" /opt/qqbot
cd /opt/qqbot

VERSION=v0.1.0
curl -fL -o "qqbot-deploy-${VERSION}.tar.gz" \
  "https://github.com/fncheng/qqbot/releases/download/${VERSION}/qqbot-deploy-${VERSION}.tar.gz"
tar -xzf "qqbot-deploy-${VERSION}.tar.gz"
```

部署包只包含运行服务器所需文件，不包含源码：

```bash
ls docker-compose.server.yml .env.server.example docs/deployment.md
```

### 4.2 GHCR 镜像权限

GHCR 包第一次发布时通常是私有的。进入 GitHub 仓库的 Packages 页面，将 `qqbot` 容器包设为 Public 后，服务器可以匿名拉取。

如果保持私有，需要创建至少具有 `read:packages` 权限的 Personal Access Token（classic），然后在服务器登录：

```bash
export CR_PAT=<具有read:packages权限的Token>
echo "$CR_PAT" | sudo docker login ghcr.io -u fncheng --password-stdin
unset CR_PAT
```

不要把 GHCR Token 写入 `.env` 或 Compose 文件。

## 5. 创建服务器环境变量

复制服务器模板并限制访问权限：

```bash
cp .env.server.example .env
chmod 600 .env
```

获取当前服务器用户的 UID 和 GID：

```bash
id -u
id -g
```

编辑 `.env`：

```bash
nano .env
```

必须修改以下字段：

```dotenv
QQ_BOT_IMAGE=ghcr.io/fncheng/qqbot:v0.1.0
POSTGRES_PASSWORD=替换为仅包含字母和数字的强密码
NAPCAT_UID=上一步id-u输出的数字
NAPCAT_GID=上一步id-g输出的数字
NAPCAT_TOKEN=替换为强随机Token
BOT_OWNER_QQ=你自己的QQ号
ALLOWED_GROUP_IDS=允许使用机器人的QQ群号
OPENAI_API_KEY=替换为真实OpenAIAPIKey
```

可以在服务器上生成 PostgreSQL 密码和 NapCat Token：

```bash
openssl rand -hex 24
openssl rand -hex 32
```

分别将两次输出填入 `POSTGRES_PASSWORD` 和 `NAPCAT_TOKEN`。不要在值两侧添加引号或空格。

从版本化 GitHub Release 解压的 `.env.server.example` 已经指向对应版本镜像；仍应核对 `QQ_BOT_IMAGE` 与下载的发布版本一致。

配置含义：

- `QQ_BOT_IMAGE`：业务镜像完整地址。生产环境填写与部署包一致的版本，例如 `ghcr.io/fncheng/qqbot:v0.1.0`。
- `POSTGRES_PASSWORD`：PostgreSQL 数据库密码，仅供容器内部连接使用。
- `NAPCAT_TOKEN`：本项目连接 NapCatQQ WebSocket 时使用的鉴权 Token，稍后还要在 NapCatQQ WebUI 中填写同一个值。
- `BOT_OWNER_QQ`：机器人所有者的个人 QQ 号，可以留空。它不是机器人 QQ 号，当前版本也没有额外的所有者管理指令。
- `ALLOWED_GROUP_IDS`：允许机器人回复的 QQ 群号。多个群号使用英文逗号分隔，例如 `123456789,987654321`。留空时机器人不会回复任何群消息。
- `OPENAI_BASE_URL`：直接使用 OpenAI 时留空；使用兼容服务时填写完整 API 基础地址。

机器人 QQ 号和 QQ 密码不写入 `.env`。机器人 QQ 号将在 NapCatQQ WebUI 中扫码登录，项目会从 OneBot 事件的 `self_id` 自动识别它。

## 6. 首次启动 NapCatQQ 和 PostgreSQL

先只启动 NapCatQQ 和 PostgreSQL：

```bash
sudo docker compose -f docker-compose.server.yml up -d napcat postgres
```

查看状态和 NapCatQQ 日志：

```bash
sudo docker compose -f docker-compose.server.yml ps
sudo docker compose -f docker-compose.server.yml logs --tail=200 napcat
```

日志中会显示 NapCatQQ WebUI 地址和首次登录 Token。这里的 WebUI Token 只用于登录 NapCatQQ 管理页面，不是 `.env` 中的 `NAPCAT_TOKEN`。

| Token          | 用途                   | 从哪里获得或设置                                 |
| -------------- | ---------------------- | ------------------------------------------------ |
| WebUI Token    | 登录 NapCatQQ 管理页面 | NapCatQQ 首次启动日志                            |
| `NAPCAT_TOKEN` | 保护 OneBot WebSocket  | 由你生成，同时填写到 `.env` 和 NapCatQQ 网络配置 |

## 7. 通过 SSH 隧道打开 NapCatQQ WebUI

`6099` 端口只监听服务器本机，不能直接通过公网 IP 打开。请在自己的电脑上另开一个终端，执行：

```bash
ssh -L 6099:127.0.0.1:6099 <服务器用户名>@<服务器公网IP>
```

保持这个 SSH 连接不要关闭，然后在自己电脑的浏览器访问：

```text
http://127.0.0.1:6099/webui
```

使用第 6 节日志中的 WebUI Token 登录。首次登录后，按照界面要求修改 WebUI 密码。

## 8. 在 NapCatQQ 中登录机器人 QQ

进入 WebUI 后：

1. 打开“QQ 登录”。
2. 选择二维码登录。
3. 使用手机 QQ 扫描二维码。
4. 在手机 QQ 上确认登录。
5. 等待 WebUI 显示机器人账号已经在线。

建议使用专门的机器人 QQ 小号。不要把 QQ 密码写入 `.env`、Compose 文件或聊天记录。

`napcat_qq_data`、`napcat_config` 等 Docker 命名卷会保存登录状态和配置。正常重启容器通常不需要重新扫码；QQ 登录令牌失效或平台要求验证时仍需重新登录。

## 9. 配置 OneBot 11 WebSocket 服务端

仍然在 NapCatQQ WebUI 中操作：

1. 打开“网络配置”。
2. 点击“新建”。
3. 类型选择“WebSocket 服务端”。
4. 名称填写 `qqbot`。
5. 主机或监听地址填写 `0.0.0.0`。
6. 端口填写 `3001`。
7. 消息上报格式选择 `array`。
8. “上报自身消息”关闭。
9. Token 填写 `.env` 中的 `NAPCAT_TOKEN`，两边必须完全一致。
10. 勾选“保存时启用”，保存配置。

这里必须选择 **WebSocket 服务端**，不能选择 WebSocket 客户端。本项目是 WebSocket 客户端，会通过 Docker 内部地址 `ws://napcat:3001` 主动连接 NapCatQQ。

监听地址必须是 `0.0.0.0`。如果填写 `127.0.0.1`，只有 NapCatQQ 容器自己能访问，`qq-bot` 容器无法连接。

消息格式必须是 `array`。本项目依靠 OneBot 消息段中的 `at` 段判断群成员是否真正 `@机器人`。

保存后查看 NapCatQQ 日志，确认 WebSocket 服务已经在 `0.0.0.0:3001` 启动：

```bash
sudo docker compose -f docker-compose.server.yml logs --tail=100 napcat
```

## 10. 拉取并启动机器人业务服务

服务器不构建业务镜像。先从 GHCR 拉取 `.env` 中 `QQ_BOT_IMAGE` 指定的镜像：

```bash
sudo docker compose -f docker-compose.server.yml pull qq-bot migration-files
sudo docker compose -f docker-compose.server.yml up -d qq-bot
```

查看三个容器和机器人日志：

```bash
sudo docker compose -f docker-compose.server.yml ps
sudo docker compose -f docker-compose.server.yml logs --tail=200 qq-bot
```

正常情况下应能看到类似信息：

```text
HTTP 健康检查服务已启动
OneBot WebSocket 已连接
```

检查健康状态：

```bash
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/health/ready
```

预期结果：

- `/health/live` 返回 HTTP 200，表示业务进程已经启动。
- `/health/ready` 返回 HTTP 200，表示 PostgreSQL 和 NapCatQQ WebSocket 都已连接。
- `/health/ready` 返回 HTTP 503，表示 PostgreSQL 或 NapCatQQ 至少有一个尚未就绪。

## 11. 将机器人账号加入 QQ 群

NapCatQQ 登录的是普通 QQ 账号，因此加群方式与普通成员相同：

1. 在 QQ 中搜索机器人 QQ 号并添加好友，或者直接由群管理员邀请。
2. 将机器人 QQ 账号邀请到目标群。
3. 如果群聊要求审批，由群主或管理员通过申请。
4. 确认目标群号已经填写到 `.env` 的 `ALLOWED_GROUP_IDS`。

如果部署后才修改 `ALLOWED_GROUP_IDS`，需要重新创建业务容器以载入新环境变量：

```bash
sudo docker compose -f docker-compose.server.yml up -d --force-recreate qq-bot
```

## 12. 验证机器人

### 12.1 群聊测试

在允许的群中发送：

```text
@机器人 /ping
```

预期回复：

```text
pong
```

然后测试 AI 对话：

```text
@机器人 请介绍一下你自己
```

群聊消息必须真正选择 QQ 的 `@机器人`，只输入机器人昵称不会触发回复。

### 12.2 私聊测试

直接给机器人 QQ 账号发送：

```text
/ping
```

私聊不需要配置群白名单，也不需要 `@机器人`。

### 12.3 内置指令

| 指令     | 作用                       |
| -------- | -------------------------- |
| `/ping`  | 检查机器人是否能够正常回复 |
| `/help`  | 查看可用指令               |
| `/clear` | 清除当前会话历史           |

## 13. 日常运维命令

以下命令都在项目目录 `/opt/qqbot` 中执行。

查看容器状态：

```bash
sudo docker compose -f docker-compose.server.yml ps
```

持续查看日志：

```bash
sudo docker compose -f docker-compose.server.yml logs -f qq-bot
sudo docker compose -f docker-compose.server.yml logs -f napcat
sudo docker compose -f docker-compose.server.yml logs -f postgres
```

重启单个服务：

```bash
sudo docker compose -f docker-compose.server.yml restart qq-bot
sudo docker compose -f docker-compose.server.yml restart napcat
```

停止服务但保留数据：

```bash
sudo docker compose -f docker-compose.server.yml down
```

重新启动：

```bash
sudo docker compose -f docker-compose.server.yml up -d
```

### 修改一般机器人配置

运行中的容器不会自动重新读取 `.env`。修改实际生效的 `.env` 后，必须重新创建 `qq-bot` 容器；仅执行 `restart qq-bot` 不会加载新的环境变量。`.env.server.example` 只是模板，修改它不会影响已部署服务。

适用于 `ALLOWED_GROUP_IDS`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_SYSTEM_PROMPT`、`LLM_HISTORY_LIMIT` 等一般机器人配置：

```bash
sudo docker compose -f docker-compose.server.yml up -d --force-recreate qq-bot
sudo docker compose -f docker-compose.server.yml ps
sudo docker compose -f docker-compose.server.yml logs --tail=200 qq-bot
curl -i http://127.0.0.1:3000/health/ready
```

预期 `/health/ready` 返回 HTTP 200，且 `qq-bot` 日志显示 OneBot WebSocket 已连接。

修改 `NAPCAT_TOKEN` 时，还必须在 NapCatQQ WebUI 的对应 WebSocket 服务端配置中填写完全相同的 Token，再重新创建 `qq-bot` 容器。

`POSTGRES_PASSWORD`、`POSTGRES_USER` 和 `POSTGRES_DB` 不属于一般配置。已有 PostgreSQL 数据卷不会因修改 `.env` 自动更新数据库账号、密码或数据库名；应先完成数据库侧迁移，再重新创建 `qq-bot`。不要通过删除 PostgreSQL 数据卷来应用这些修改。

### 更新 `qq-bot` 镜像

先将 `.env` 中的 `QQ_BOT_IMAGE` 改为目标版本，再拉取镜像并重新创建业务容器：

```bash
nano .env
sudo docker compose -f docker-compose.server.yml pull qq-bot migration-files
sudo docker compose -f docker-compose.server.yml up -d qq-bot
sudo docker compose -f docker-compose.server.yml ps
sudo docker compose -f docker-compose.server.yml logs --tail=200 qq-bot
curl -i http://127.0.0.1:3000/health/ready
```

`migration-files` 与 `qq-bot` 必须使用同一个镜像版本。确认 `/health/ready` 返回 HTTP 200 后，再进行 QQ 私聊或群聊的 `/ping` 验证。

如果使用新的 GitHub Release 部署包，先备份当前 `.env`，解压新部署包覆盖 Compose 和文档，再恢复 `.env` 并更新 `QQ_BOT_IMAGE`。不要用发布包中的模板覆盖包含真实密钥的 `.env`。

不要执行 `docker compose down -v`。参数 `-v` 会删除 PostgreSQL、NapCatQQ 登录状态和配置对应的命名卷。

## 14. 常见问题排查

### 14.1 NapCatQQ WebUI 无法打开

检查 NapCatQQ 状态和日志：

```bash
sudo docker compose -f docker-compose.server.yml ps napcat
sudo docker compose -f docker-compose.server.yml logs --tail=200 napcat
```

确认自己电脑上的 SSH 隧道仍然保持连接，并访问的是 `http://127.0.0.1:6099/webui`，不是服务器公网 IP。

### 14.2 `qq-bot` 日志反复显示 WebSocket 重连

依次检查：

1. NapCatQQ 中创建的是“WebSocket 服务端”。
2. 监听地址是 `0.0.0.0`。
3. 端口是 `3001`。
4. WebSocket 配置已经启用。
5. NapCatQQ 中的 Token 与 `.env` 的 `NAPCAT_TOKEN` 完全一致。
6. `docker-compose.server.yml` 中使用的是 `ws://napcat:3001`。

### 14.3 `/health/live` 返回 200，但 `/health/ready` 返回 503

查看业务、NapCatQQ 和 PostgreSQL 日志：

```bash
sudo docker compose -f docker-compose.server.yml logs --tail=200 qq-bot napcat postgres
```

常见原因是 NapCatQQ 尚未登录、WebSocket 服务未启用、Token 不一致，或者 PostgreSQL 首次初始化尚未完成。

### 14.4 私聊正常，但群聊没有回复

依次检查：

1. 机器人 QQ 是否已经进入目标群。
2. `.env` 的 `ALLOWED_GROUP_IDS` 是否包含正确群号。
3. 修改 `.env` 后是否重新创建了 `qq-bot` 容器。
4. 群消息是否真正 `@` 机器人。
5. NapCatQQ 的消息上报格式是否为 `array`。

### 14.5 PostgreSQL 初始化迁移没有执行

业务镜像内包含 `/app/drizzle/0000_initial.sql`。`migration-files` 一次性容器会先把它复制到 `postgres_init` 命名卷，PostgreSQL 第一次创建数据卷时再自动执行。

检查初始化文件容器：

```bash
sudo docker compose -f docker-compose.server.yml ps -a migration-files
sudo docker compose -f docker-compose.server.yml logs migration-files
```

`migration-files` 正常状态是退出码 `0`。如果它失败，PostgreSQL 不会启动。

初始化 SQL 只会在 PostgreSQL 数据卷第一次创建时执行。已有数据库不得通过删除数据卷来强制重跑迁移，应人工检查数据库状态并执行所需迁移。

进入 PostgreSQL 容器：

```bash
sudo docker compose -f docker-compose.server.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

如果当前 Shell 没有加载 `.env` 中的变量，可以将命令中的变量替换成实际数据库用户名和数据库名。

## 15. 安全检查清单

- 使用独立机器人 QQ 账号，不使用日常主账号。
- `.env` 权限设置为 `600`，且不得提交到 Git。
- NapCatQQ WebSocket 必须设置强 Token。
- 不向公网开放 `3001`、`5432`。
- NapCatQQ WebUI `6099` 仅绑定 `127.0.0.1`，通过 SSH 隧道访问。
- 定期备份 PostgreSQL 数据和 NapCatQQ 配置。
- 更新前先查看 NapCatQQ 与本项目变更说明，并在维护窗口操作。
- 生产环境的 `QQ_BOT_IMAGE` 使用版本标签或 digest，不长期使用 `latest`。
- 不使用 `docker compose down -v`，除非明确准备删除全部持久化数据。

## 16. 官方参考资料

- [Docker Engine Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose Plugin 安装文档](https://docs.docker.com/compose/install/linux/)
- [GitHub Container Registry 使用文档](https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Actions 发布 Docker 镜像](https://docs.github.com/actions/tutorials/publish-packages/publish-docker-images)
- [NapCatQQ 安装文档](https://napneko.github.io/guide/install)
- [NapCatQQ WebUI 和 OneBot 网络配置](https://napneko.github.io/config/basic)
- [NapCat Docker 仓库说明](https://github.com/NapNeko/NapCat-Docker)
