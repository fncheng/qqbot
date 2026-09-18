# QQ 聊天机器人方案计划书

> 技术路线：NapCatQQ + OneBot 11 + TypeScript + Node.js + PostgreSQL  
> 适用场景：个人 QQ 机器人、群聊机器人、AI 对话机器人、群管理机器人、Agent 实验项目  
> 文档版本：V1.0  
> 日期：2026-09-17

---

## 1. 项目背景

计划开发一个基于普通 QQ 账号运行的聊天机器人。

机器人通过 NapCatQQ 接入 QQ 客户端能力，并通过 OneBot 11 协议向业务服务暴露消息事件和 API。业务服务使用 TypeScript + Node.js 开发，在此基础上实现：

- QQ 私聊消息处理
- QQ 群聊消息处理
- 指令系统
- AI 对话
- Agent Tool 调用
- 上下文记忆
- 用户与群配置
- 消息记录
- 权限控制
- 群管理能力
- 后续多平台扩展

本项目第一阶段重点不是构建复杂的机器人框架，而是搭建一个结构清晰、可扩展的 QQ Bot 基础平台。

---

## 2. 技术选型

### 2.1 核心技术栈

| 模块 | 技术方案 |
|---|---|
| QQ 接入 | NapCatQQ |
| 通信协议 | OneBot 11 |
| 运行时 | Node.js 24 |
| 开发语言 | TypeScript |
| 包管理 | pnpm |
| Web 框架 | Fastify |
| QQ SDK | node-napcat-ts 或其他兼容 OneBot 11 的 TypeScript SDK |
| 数据库 | PostgreSQL 16+ |
| ORM | Drizzle ORM |
| 缓存 | Redis |
| AI SDK | OpenAI SDK |
| 日志 | pino |
| 配置管理 | dotenv / zod |
| 单元测试 | Vitest |
| 部署 | Docker Compose |

---

## 3. 为什么选择 NapCatQQ + OneBot 11

NapCatQQ 可以让普通 QQ 账号以机器人的形式运行，并通过 OneBot 11 向外部程序提供统一接口。

整体调用链：

```text
QQ / NTQQ
    ↓
NapCatQQ
    ↓
OneBot 11
    ↓
WebSocket
    ↓
TypeScript Bot Server
```

相比直接在业务代码中处理 QQ 协议，使用 NapCatQQ 可以把 QQ 客户端协议层和机器人业务层分离。

业务程序只需要关心：

```text
收到什么消息
    ↓
消息属于什么场景
    ↓
需要执行什么逻辑
    ↓
返回什么内容
```

而无需关心 QQ 客户端底层实现。

---

## 4. 风险说明

NapCatQQ 和 OneBot 11 并非 QQ 官方开放平台 API。

因此需要明确以下风险：

- QQ 客户端升级可能导致兼容性问题
- NapCatQQ 版本升级可能改变部分行为
- 普通 QQ 账号存在风控风险
- 高频发送消息可能导致账号限制
- 自动加好友、批量群发等行为风险较高
- 不建议直接用于关键商业系统

项目设计时应将 QQ 接入层隔离，避免业务逻辑强依赖 NapCatQQ。

推荐架构：

```text
QQ Gateway
    ↓
Bot Core
    ↓
Agent Core
```

未来如果迁移到 QQ 官方 Bot API，只需要替换 Gateway。

---

# 5. 系统总体架构

```text
                         ┌──────────────────┐
                         │       QQ         │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    NapCatQQ      │
                         └────────┬─────────┘
                                  │
                            OneBot 11
                                  │
                            WebSocket
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │       QQ Gateway        │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │      Message Router     │
                    └───────────┬─────────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
        Command Handler     Chat Handler     Event Handler
               │                │                │
               └────────────┬───┴───────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │    Bot Core     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Agent Core    │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
               ▼             ▼             ▼
             LLM           Tools         Memory
               │             │             │
               └─────────────┼─────────────┘
                             │
               ┌─────────────┴─────────────┐
               ▼                           ▼
          PostgreSQL                     Redis
```

---

# 6. 项目目录设计

```text
qq-agent-bot/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   └── index.ts
│   │
│   ├── gateway/
│   │   └── qq/
│   │       ├── client.ts
│   │       ├── events.ts
│   │       ├── sender.ts
│   │       ├── mapper.ts
│   │       └── types.ts
│   │
│   ├── bot/
│   │   ├── router.ts
│   │   ├── context.ts
│   │   ├── middleware.ts
│   │   └── handlers/
│   │       ├── command.ts
│   │       ├── private-message.ts
│   │       └── group-message.ts
│   │
│   ├── commands/
│   │   ├── registry.ts
│   │   ├── help.ts
│   │   ├── ping.ts
│   │   └── clear.ts
│   │
│   ├── agent/
│   │   ├── agent.ts
│   │   ├── context.ts
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   └── time.ts
│   │   └── memory/
│   │       ├── memory.ts
│   │       └── repository.ts
│   │
│   ├── llm/
│   │   ├── client.ts
│   │   ├── provider.ts
│   │   └── types.ts
│   │
│   ├── database/
│   │   ├── client.ts
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── groups.ts
│   │   │   ├── conversations.ts
│   │   │   └── messages.ts
│   │   └── repositories/
│   │
│   ├── cache/
│   │   └── redis.ts
│   │
│   ├── services/
│   │   ├── conversation.ts
│   │   └── permission.ts
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   └── id.ts
│   │
│   └── index.ts
│
├── tests/
│
├── scripts/
│
├── docs/
│   ├── architecture.md
│   ├── onebot.md
│   └── deployment.md
│
├── drizzle/
│
├── docker-compose.yml
├── Dockerfile
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── README.md
```

---

# 7. 核心模块设计

## 7.1 QQ Gateway

职责：

- 连接 NapCatQQ
- 监听 OneBot 事件
- 调用 OneBot API
- 将 OneBot 消息转换为内部统一消息模型
- 与业务层解耦

内部统一消息模型建议：

```ts
export type ChatType = 'private' | 'group'

export interface BotMessage {
  id: string
  chatType: ChatType

  userId: string
  groupId?: string

  text: string

  rawMessage: unknown

  timestamp: number
}
```

业务层不直接依赖 OneBot 原始事件。

例如：

```text
OneBot GroupMessageEvent
          ↓
        mapper
          ↓
      BotMessage
          ↓
      Bot Core
```

这样未来接入其他平台时可以直接复用 Bot Core。

---

# 8. Message Router

Message Router 负责判断消息应该进入哪个业务流程。

```text
Message
   ↓
Middleware
   ↓
Router
   ↓
┌─────────────┐
│ Command     │
├─────────────┤
│ AI Chat     │
├─────────────┤
│ Group Event │
└─────────────┘
```

典型逻辑：

```text
/private message

"你好"
     ↓
AI Chat


"/ping"
     ↓
Command Handler


"group @bot 你好"
     ↓
AI Chat
```

---

# 9. Middleware 设计

Middleware 用于处理横切逻辑。

建议支持：

```text
Message
   ↓
loggingMiddleware
   ↓
blacklistMiddleware
   ↓
permissionMiddleware
   ↓
rateLimitMiddleware
   ↓
commandMiddleware
   ↓
AI Handler
```

第一阶段实现：

- logging
- permission
- rate limit
- command detection

---

# 10. 指令系统

建议所有机器人控制命令统一使用：

```text
/
```

例如：

```text
/help
/ping
/clear
/model
/status
```

命令接口：

```ts
export interface CommandContext {
  userId: string
  groupId?: string
  args: string[]
}

export interface BotCommand {
  name: string
  description: string

  execute(context: CommandContext): Promise<string>
}
```

后续可通过 registry 自动注册。

---

# 11. AI 对话模块

第一阶段只实现普通 Chat Completion。

流程：

```text
QQ Message
    ↓
Conversation Service
    ↓
读取历史消息
    ↓
构造 Prompt
    ↓
LLM
    ↓
保存 Assistant Message
    ↓
发送 QQ
```

Prompt：

```text
System Prompt

Conversation History

User Message
```

---

# 12. Agent 设计

第二阶段开始支持 Agent。

Agent Core：

```text
User Message
     ↓
Agent
     ↓
LLM
     ↓
Tool Call
     ↓
Tool
     ↓
Tool Result
     ↓
LLM
     ↓
Final Answer
```

建议 Tool 接口：

```ts
export interface AgentTool<TInput, TOutput> {
  name: string
  description: string

  execute(input: TInput): Promise<TOutput>
}
```

第一批 Tool 可以实现：

```text
get_current_time
search_memory
get_user_info
get_group_info
```

后续再增加：

```text
web_search
weather
calendar
database_query
```

---

# 13. Conversation 设计

Conversation 表示一次 AI 对话上下文。

建议按照：

```text
QQ User
    ↓
Conversation
    ↓
Messages
```

群聊则：

```text
Group
  +
User
  ↓
Conversation
```

Conversation Key：

```text
private:{userId}

group:{groupId}:{userId}
```

也可以后续支持群共享上下文：

```text
group:{groupId}
```

---

# 14. 数据库设计

第一阶段建议创建以下核心表：

```text
users
groups
conversations
messages
```

---

## 14.1 users

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    qq_user_id VARCHAR(32) NOT NULL UNIQUE,

    nickname VARCHAR(100),

    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 14.2 groups

```sql
CREATE TABLE groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    qq_group_id VARCHAR(32) NOT NULL UNIQUE,

    name VARCHAR(255),

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 14.3 conversations

```sql
CREATE TABLE conversations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    conversation_key VARCHAR(128) NOT NULL UNIQUE,

    user_id BIGINT,

    group_id BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 14.4 messages

```sql
CREATE TABLE messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    conversation_id BIGINT NOT NULL,

    role VARCHAR(16) NOT NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

role：

```text
system
user
assistant
tool
```

---

# 15. Redis 使用场景

Redis 第一阶段不是必须。

当项目增加以下能力后再引入：

- Rate Limit
- 会话缓存
- 分布式锁
- 短期上下文
- Message Queue
- Tool 执行状态

例如：

```text
rate_limit:{qqUserId}

conversation:{conversationId}

message_lock:{messageId}
```

---

# 16. 群聊处理策略

群聊不能所有消息都直接发送给 LLM。

否则可能产生：

- API 成本过高
- 回复过多
- 触发 QQ 风控
- 群聊体验变差

建议仅在以下情况触发机器人：

```text
@机器人
```

或者：

```text
/bot xxx
```

或者特定关键词。

例如：

```text
群消息
   ↓
是否 @机器人？
   │
   ├── 否 → ignore
   │
   └── 是
       ↓
     AI Chat
```

---

# 17. 消息限流

必须实现 Rate Limit。

建议：

```text
私聊：

每用户
5 messages / 10 seconds


群聊：

每群
10 messages / 10 seconds
```

同时限制机器人主动发送速度。

避免：

```text
循环回复

机器人 A → 机器人 B
机器人 B → 机器人 A
```

---

# 18. 消息去重

OneBot 事件存在重复处理的可能性。

建议使用：

```text
message_id
```

进行去重。

例如 Redis：

```text
message:{messageId}
```

TTL：

```text
5 minutes
```

---

# 19. 权限系统

建议定义角色：

```text
OWNER

ADMIN

USER

BLOCKED
```

权限示例：

| 功能 | OWNER | ADMIN | USER |
|---|---|---|---|
| AI Chat | ✓ | ✓ | ✓ |
| /clear | ✓ | ✓ | ✓ |
| /model | ✓ | ✓ | ✗ |
| /reload | ✓ | ✗ | ✗ |
| Bot Config | ✓ | ✗ | ✗ |

---

# 20. 日志系统

日志推荐使用：

```text
pino
```

至少记录：

```text
timestamp

message_id

user_id

group_id

message_type

handler

duration

error
```

禁止记录：

```text
LLM API Key

NapCat Token

数据库密码

用户隐私字段
```

---

# 21. 异常处理

整个消息处理流程必须存在全局异常处理。

```text
Message
   ↓
Handler
   ↓
try
   ↓
Agent
   ↓
catch
   ↓
Logger
```

用户收到：

```text
处理消息时出现错误，请稍后再试。
```

详细错误只写服务端日志。

---

# 22. LLM Provider 抽象

不要直接在业务代码中调用 OpenAI SDK。

建议定义 Provider：

```ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
}

export interface ChatResponse {
  content: string
}

export interface LLMProvider {
  chat(request: ChatRequest): Promise<ChatResponse>
}
```

实现：

```text
OpenAIProvider

DeepSeekProvider

ClaudeProvider
```

业务层只依赖：

```text
LLMProvider
```

---

# 23. 配置管理

`.env`

示例：

```bash
NODE_ENV=development

NAPCAT_WS_URL=ws://127.0.0.1:3001
NAPCAT_TOKEN=

DATABASE_URL=postgresql://postgres:password@localhost:5432/qq_bot

REDIS_URL=redis://localhost:6379

OPENAI_API_KEY=

BOT_OWNER_QQ=
```

禁止提交：

```text
.env
```

只提交：

```text
.env.example
```

---

# 24. Docker Compose

建议部署组件：

```text
docker-compose
│
├── qq-bot
│
├── postgres
│
└── redis
```

NapCatQQ 可以根据实际环境选择：

```text
宿主机运行

或

独立 Docker
```

机器人业务程序不要与 NapCat 强绑定在同一容器。

---

# 25. 开发阶段规划

---

## Phase 0：项目初始化

目标：

建立基本 TypeScript 服务。

任务：

- 初始化 pnpm
- TypeScript
- ESLint
- Prettier
- Vitest
- dotenv
- zod
- pino

验收：

```bash
pnpm dev
```

能够正常启动服务。

---

## Phase 1：NapCatQQ 接入

目标：

成功连接 QQ。

任务：

- 安装 NapCatQQ
- QQ 登录
- 开启 OneBot WebSocket
- TypeScript 连接 NapCat
- 接收私聊消息
- 接收群消息
- 发送消息

验收：

```text
QQ：

/ping
```

机器人返回：

```text
pong
```

---

## Phase 2：Bot Core

目标：

建立机器人基础框架。

实现：

```text
Gateway

Message Router

Middleware

Command
```

增加：

```text
/help

/ping
```

验收：

不同消息可以进入不同 Handler。

---

## Phase 3：PostgreSQL

目标：

实现用户与消息持久化。

增加：

```text
users

groups

conversations

messages
```

实现：

```text
UserRepository

ConversationRepository

MessageRepository
```

---

## Phase 4：AI Chat

目标：

机器人支持 LLM 对话。

实现：

```text
QQ
 ↓
Message Router
 ↓
Conversation
 ↓
LLM
 ↓
QQ
```

支持：

```text
/clear
```

清除上下文。

---

## Phase 5：群聊机器人

实现：

```text
@机器人 问题
```

才触发 AI。

增加：

```text
群白名单

群配置

用户黑名单
```

---

## Phase 6：Agent

增加 Tool Calling。

实现：

```text
Agent

Tools

Tool Registry
```

第一批工具：

```text
get_current_time

get_user_info

search_memory
```

---

## Phase 7：Memory

增加：

```text
短期记忆

长期记忆
```

短期：

```text
Conversation Messages
```

长期：

```text
User Memory
```

---

## Phase 8：Redis

加入：

```text
Rate Limit

Message Deduplication

Conversation Cache
```

---

## Phase 9：管理后台

后续可以增加：

```text
Vue 3
TypeScript
Element Plus
```

管理：

```text
用户

群

Conversation

Messages

模型

Prompt

Tools

黑名单

Token 使用量
```

---

# 26. 安全要求

必须避免：

```text
LLM 直接执行 Shell

LLM 任意执行 SQL

LLM 任意读取服务器文件

LLM 任意调用管理员 API
```

所有 Agent Tool 都必须：

```text
显式注册

参数校验

权限校验

日志记录
```

例如：

```text
Agent
  ↓
delete_group_member
  ↓
Permission Check
  ↓
OWNER only
```

---

# 27. 防 Prompt Injection

群成员可能发送：

```text
忽略之前所有指令
```

Agent 不应因此获得系统权限。

必须区分：

```text
System Instruction

User Message

Tool Permission
```

Tool 权限不能由 Prompt 控制。

---

# 28. 测试策略

使用：

```text
Vitest
```

第一阶段重点测试：

```text
Message Router

Command Parser

Permission

Rate Limit

Conversation

Agent Tool
```

QQ Gateway 使用 Mock Event 测试。

例如：

```text
Mock OneBot Event
       ↓
Message Mapper
       ↓
BotMessage
       ↓
Handler
```

避免测试必须依赖真实 QQ。

---

# 29. 开发原则

整个项目遵循以下原则。

### 1. QQ 只是 Gateway

核心业务不能直接依赖 NapCat。

```text
NapCat
   ↓
Gateway
   ↓
Bot Core
```

---

### 2. Agent 不关心 QQ

Agent 只处理：

```text
input

context

tools
```

而不是：

```text
QQ MessageEvent
```

---

### 3. 所有外部服务必须抽象

例如：

```text
LLMProvider

MessageGateway

UserRepository

MemoryRepository
```

避免业务代码与具体实现强耦合。

---

### 4. 第一阶段保持简单

不要一开始实现：

```text
RAG

Vector DB

Multi Agent

复杂 Workflow

Event Bus

Microservice
```

优先完成：

```text
QQ → Bot → LLM → QQ
```

---

# 30. MVP 最终目标

第一版 MVP 达到：

```text
QQ 用户
   ↓
发送消息
   ↓
NapCatQQ
   ↓
OneBot 11
   ↓
TypeScript Bot
   ↓
Conversation
   ↓
LLM
   ↓
生成回复
   ↓
QQ
```

同时支持：

```text
/ping

/help

/clear

私聊 AI

群聊 @AI

Conversation History

PostgreSQL
```

完成这些功能后，再开始 Agent Tool 扩展。

---

# 31. 推荐开发顺序

推荐严格按照以下顺序开发：

```text
1. TypeScript 项目初始化

2. NapCatQQ

3. OneBot WebSocket

4. 接收 QQ 消息

5. 发送 QQ 消息

6. Message Router

7. Command System

8. PostgreSQL

9. Conversation

10. LLM Chat

11. 群聊 @Bot

12. Permission

13. Rate Limit

14. Redis

15. Agent

16. Tools

17. Memory

18. 管理后台
```

不要在 QQ 消息收发尚未稳定之前直接进入 Agent 开发。

---

# 32. 最终架构演进

第一阶段：

```text
QQ
 ↓
NapCat
 ↓
Bot
 ↓
LLM
```

第二阶段：

```text
QQ
 ↓
NapCat
 ↓
Bot
 ↓
Agent
 ↓
LLM + Tools
```

第三阶段：

```text
QQ ─────────┐
Telegram ───┤
Discord ────┼── Gateway
Web ────────┤
Feishu ─────┘
              ↓
           Bot Core
              ↓
           Agent Core
              ↓
        LLM / Tools / Memory
```

最终 QQ 只是整个 Agent 系统的一个消息入口。

---

# 33. 项目目标总结

本项目不只是实现一个 QQ 自动回复机器人。

真正目标是搭建：

```text
Multi-Channel Agent Platform
```

QQ 作为第一个 Channel。

通过这个项目可以完整学习：

```text
TypeScript Backend

WebSocket

Event Driven

PostgreSQL

Redis

LLM

Agent

Tool Calling

Memory

Docker

Linux Deployment
```

同时项目本身具备实际使用价值。

---

# 34. 第一阶段里程碑

MVP 完成标准：

- [ ] NapCatQQ 正常运行
- [ ] QQ 账号正常登录
- [ ] OneBot WebSocket 正常连接
- [ ] TypeScript 服务能够接收 QQ 消息
- [ ] TypeScript 服务能够发送 QQ 消息
- [ ] `/ping` 指令可用
- [ ] `/help` 指令可用
- [ ] PostgreSQL 正常连接
- [ ] 用户数据正常保存
- [ ] Conversation 正常创建
- [ ] Message 正常保存
- [ ] LLM 可以正常调用
- [ ] 私聊 AI 正常
- [ ] 群聊 @机器人正常
- [ ] `/clear` 可以清除上下文
- [ ] 基础 Rate Limit 生效
- [ ] 错误日志完整
- [ ] Docker Compose 可以启动项目

完成以上内容后，即可进入 Agent Tool 开发阶段。
