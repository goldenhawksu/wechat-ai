# wechat-ai

多渠道 AI 机器人 — 一条命令连接微信、Discord、WhatsApp 与任意 AI 模型。

基于微信官方 iLink Bot API 构建，合规、稳定、不怕封号。同时支持 Discord Bot 和 WhatsApp 渠道。

<p align="center">
  <img src="docs/screenshot.png" width="800" alt="wechat-ai screenshot" />
</p>

## 特性

- **多渠道支持** — 微信、Discord、WhatsApp 三合一，统一管理
- **一条命令启动** — `npx wechat-ai`，扫码即用，零配置门槛
- **8+ 内置模型** — Claude、GPT、Gemini、Qwen、DeepSeek、MiniMax、GLM，一键切换
- **300+ 第三方模型** — 通过 OpenRouter 接入，`/model vendor/model` 随时切换
- **微信官方协议** — 基于 iLink Bot API（`ilinkai.weixin.qq.com`），非逆向、非第三方
- **全模型 Agent 能力** — 不只是聊天，所有模型均支持搜索网页、读写文件、执行代码（由 [claw-agent-sdk](https://github.com/anxiong2025/claw-agent-sdk) 驱动）
- **Web 管理面板** — 多租户平台模式，邀请码注册、JWT 认证、Web 端二维码绑定微信
- **语音收发** — 语音消息自动转文字 (Whisper ASR)，支持语音回复 (TTS)
- **图片生成** — `/画 <描述>` 直接在微信里生图
- **图片理解** — 发图片自动切换到视觉模型分析
- **MCP 工具扩展** — 通过 [Model Context Protocol](https://modelcontextprotocol.io) 接入任意外部工具
- **Function Calling** — 所有模型均支持工具调用
- **中间件系统** — Koa 风格洋葱模型，方便二次开发
- **Skills 人设系统** — 预设翻译官、程序员、写手等角色，一键切换
- **Webhook API** — HTTP 接口主动推送消息，方便集成外部系统
- **后台运行** — Daemon 模式，支持开机自启
- **可编程 API** — 同时作为 npm 库导出，支持嵌入你自己的项目

## 快速开始

### 1. 安装

```bash
npm i -g wechat-ai
```

### 2. 设置 API Key（任选一个模型）

```bash
# macOS / Linux
wechat-ai set qwen sk-xxx        # 通义千问
wechat-ai set deepseek sk-xxx    # DeepSeek
wechat-ai set gemini AIza-xxx    # Gemini

# Windows（Key 需要加引号，避免特殊字符被 cmd 解析）
wechat-ai set qwen "sk-xxx"
wechat-ai set deepseek "sk-xxx"
```

### 3. 启动

```bash
wechat-ai                        # 首次启动会弹出微信扫码
```

扫码登录后，给微信机器人发消息即可开始对话。

## 其他安装方式

```bash
# 免安装体验
npx wechat-ai

# 从源码运行
git clone https://github.com/anxiong2025/wechat-ai.git
cd wechat-ai && npm install && npm run build && node dist/cli.js
```

## 命令

```bash
wechat-ai                        # 启动（首次自动弹出二维码）
wechat-ai set <模型> <key>        # 保存 API Key
wechat-ai use <模型>              # 设置默认模型
wechat-ai config                 # 查看配置（Key 已脱敏）
wechat-ai logout                 # 退出所有渠道登录
wechat-ai logout <渠道>           # 退出指定渠道（weixin / whatsapp）
wechat-ai start                  # 后台运行（daemon 模式）
wechat-ai stop                   # 停止后台进程
wechat-ai logs                   # 查看后台日志
wechat-ai update                 # 更新到最新版
```

## 支持模型

| 模型 | 默认版本 | 设置 Key | 获取 Key |
|------|---------|---------|---------|
| 通义千问 (Qwen) | qwen-plus | `wechat-ai set qwen <key>` | [申请](https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key) |
| DeepSeek | deepseek-chat | `wechat-ai set deepseek <key>` | [申请](https://platform.deepseek.com/api_keys) |
| Claude | claude-opus-4-6 (Agent) | `wechat-ai set claude <key>` | [申请](https://console.anthropic.com/settings/keys) |
| GPT | gpt-4o | `wechat-ai set gpt <key>` | [申请](https://platform.openai.com/api-keys) |
| Gemini | gemini-2.0-flash | `wechat-ai set gemini <key>` | [申请](https://aistudio.google.com/apikey) |
| MiniMax | MiniMax-Text-01 | `wechat-ai set minimax <key>` | [申请](https://platform.minimaxi.com/user-center/basic-information/interface-key) |
| 智谱 (GLM) | glm-4-plus | `wechat-ai set glm <key>` | [申请](https://open.bigmodel.cn/usercenter/apikeys) |
| Kimi (Moonshot) | moonshot-v1-8k | `wechat-ai set kimi <key>` | [申请](https://platform.moonshot.cn/console/api-keys) |
| OpenRouter | 300+ 第三方模型 | `wechat-ai set openrouter <key>` | [申请](https://openrouter.ai/settings/keys) |

支持任何 OpenAI 兼容 API，编辑 `~/.wai/config.json` 即可添加。

所有模型均通过 [claw-agent-sdk](https://github.com/anxiong2025/claw-agent-sdk) 获得 Agent 能力，支持搜索网页、读写文件、执行代码。Claude 另外通过 [Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) 接入，提供最强质量。

### 第三方模型 (OpenRouter)

配置一个 [OpenRouter](https://openrouter.ai) Key 即可使用 300+ 模型，无需逐个申请：

```bash
wechat-ai set openrouter sk-or-xxx
```

在微信中通过 `/model vendor/model` 切换：

```
/model google/gemini-2.5-pro         Google Gemini
/model anthropic/claude-sonnet-4     Anthropic Claude
/model meta-llama/llama-4-maverick   Meta Llama
```

更多模型见 [OpenRouter Models](https://openrouter.ai/models)。

### 微信内指令

```
/model                               查看当前模型
/model qwen                          切换内置模型
/model google/gemini-2.5-pro         切换第三方模型
/cc /qwen /deepseek /gpt             快捷切换
@指南                                 查看快捷指南
/help                                显示全部指令
/ping                                检查状态
```

### Agent 能力（所有模型）

v0.4.0 起，所有模型均具备 Agent 能力：搜索网页、查天气资讯、读写文件、执行命令。由 [claw-agent-sdk](https://github.com/anxiong2025/claw-agent-sdk) 驱动，无需额外配置。

详见 [完整使用指南](docs/guide.md#agent-能力)。

## 高级配置

配置文件位于 `~/.wai/config.json`，以下为可选的高级功能。

### Discord 渠道

在 `~/.wai/config.json` 中启用并填入 Bot Token：

```json
{
  "channels": {
    "discord": {
      "type": "discord",
      "enabled": true,
      "token": "your-bot-token"
    }
  }
}
```

Bot Token 在 [Discord Developer Portal](https://discord.com/developers/applications) 创建应用后获取。需开启 **Message Content Intent**。

### WhatsApp 渠道

在 `~/.wai/config.json` 中启用：

```json
{
  "channels": {
    "whatsapp": {
      "type": "whatsapp",
      "enabled": true
    }
  }
}
```

首次启动会弹出二维码，用 WhatsApp 扫码绑定。如需重新绑定：`wechat-ai logout whatsapp`。

### Webhook（HTTP 消息推送）

启用后可通过 HTTP API 主动向微信用户发送消息：

```json
{
  "webhook": {
    "enabled": true,
    "port": 4800,
    "secret": "your-secret"
  }
}
```

```bash
curl -X POST http://localhost:4800 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{"targetId": "wxid_xxx", "text": "Hello from API"}'
```

### 语音消息 (ASR / TTS)

```json
{
  "asr": {
    "provider": "whisper",
    "apiKey": "sk-xxx"
  },
  "tts": {
    "provider": "openai",
    "apiKey": "sk-xxx",
    "voice": "alloy"
  }
}
```

- **ASR**：收到语音消息自动转文字，支持 Whisper
- **TTS**：AI 回复自动合成语音，支持 OpenAI / Gemini

### MCP 工具

通过 [MCP](https://modelcontextprotocol.io) 协议接入外部工具，所有模型均可调用：

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "@weather/mcp-server"]
    },
    "remote-api": {
      "transport": "streamable-http",
      "url": "https://api.example.com/mcp"
    }
  }
}
```

支持 `stdio`、`sse`、`streamable-http` 三种传输方式。

### Skills 人设

预设不同 AI 角色，在微信中通过 `/skill` 切换：

```json
{
  "skills": {
    "translator": {
      "description": "英汉翻译",
      "systemPrompt": "你是一个专业翻译，用户发中文你翻英文，发英文你翻中文。"
    },
    "coder": {
      "description": "编程助手",
      "systemPrompt": "你是一个资深程序员，用简洁的代码和清晰的解释回答问题。",
      "provider": "claude"
    }
  }
}
```

## 架构

```
微信用户 / Discord / WhatsApp
  │
  ▼
渠道适配层
  ├── 微信 (iLink Bot API — 官方协议)
  ├── Discord (discord.js Bot)
  └── WhatsApp (Baileys)
  │
  ▼
wechat-ai 网关
  ├── 统一登录管理（多渠道扫码/Token）
  ├── 会话管理（per-user 独立上下文）
  ├── 消息聚合（防抖合并连续消息）
  ├── 中间件链（Koa 风格洋葱模型）
  ├── MCP 工具管理
  ├── ASR / TTS 语音处理
  └── 模型路由
        │
        ├── Claude Agent SDK（Claude 专属，最强质量）
        └── claw-agent-sdk（Qwen, DeepSeek, GPT, Gemini, OpenRouter 300+）
              └── 内置工具: 搜索, 文件读写, 命令执行, 网页抓取
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript (ESM) |
| 运行时 | Node.js 22+ |
| 微信协议 | iLink Bot API（官方） |
| Discord | discord.js |
| WhatsApp | Baileys (Multi-Device) |
| AI 接入 | Claude Agent SDK + [claw-agent-sdk](https://github.com/anxiong2025/claw-agent-sdk) |
| 工具扩展 | Model Context Protocol (MCP) |
| 构建 | tsup |

## 项目结构

```
src/
├── cli.ts                    命令行入口
├── gateway.ts                消息网关 & 会话管理 & Webhook 服务
├── config.ts                 配置管理 (~/.wai/config.json)
├── types.ts                  核心接口定义
├── mcp.ts                    MCP 客户端管理
├── asr.ts                    语音转文字 (Whisper)
├── tts.ts                    文字转语音 (OpenAI / Gemini)
├── channels/
│   ├── weixin.ts             微信 iLink 协议实现
│   ├── discord.ts            Discord Bot 渠道
│   └── whatsapp.ts           WhatsApp 渠道 (Baileys)
└── providers/
    ├── claude-agent.ts       Claude Agent SDK 接入
    ├── claw-agent.ts         claw-agent-sdk 接入（全模型 Agent）
    └── openai-compatible.ts  通用 OpenAI 兼容 API（兼容旧版）
```

## 作为库使用

wechat-ai 同时导出为 npm 库，可嵌入你自己的项目：

```bash
npm install wechat-ai
```

```typescript
import { Gateway } from "wechat-ai";

const gw = new Gateway(config);
gw.use(async (ctx, next) => {
  console.log(`收到消息: ${ctx.message.text}`);
  await next();
});
await gw.start();
```

## 计划

- [x] 微信 iLink 官方协议
- [x] 多模型切换 (`/model`)
- [x] 输入状态提示（正在输入...）
- [x] 8 个内置模型 + OpenRouter 300+
- [x] npm 发布 (CLI + Library)
- [x] 中间件系统
- [x] MCP 客户端 & 全模型 Function Calling
- [x] 后台运行 (daemon 模式)
- [x] Webhook HTTP API
- [x] Skills 人设系统
- [x] 语音消息 (ASR / TTS)
- [x] 图片理解（自动切换视觉模型）
- [x] 图片生成 (`/画`)
- [x] 全模型 Agent 能力 (claw-agent-sdk)
- [x] Web 管理面板 (多租户 SaaS 平台)
- [x] Discord 渠道
- [x] WhatsApp 渠道
- [x] Web 端微信二维码绑定
- [x] JWT 认证 & 邀请码登录续期
- [ ] Telegram 渠道
- [ ] 群聊支持

## 多租户平台模式 (v0.5.0+)

wechat-ai 支持多租户 SaaS 模式，可作为平台服务多个用户，每个用户拥有独立的 Bot 实例和 AI 配置。

### 平台架构

```
平台管理员
    │
    ├── 生成邀请码（指定可用次数）
    │
用户访问 Web 控制台
    │
    ├── 输入邀请码注册 / 登录（JWT 认证）
    │
    ├── 配置个人 API Key & 模型
    │
    ├── 启动 Bot → 生成二维码 → 微信扫码绑定
    │
用户在微信中与专属 Agent 对话
```

### 快速开始

#### 1. 启动平台

```bash
wechat-ai --web --port 3000
```

平台将启动:
- **Web 管理界面**: http://localhost:3000
- **微信 Bot 服务**: 自动启动全局 Bot
- **管理 API**: 认证、配置、Bot 管理

#### 2. 生成邀请码

```bash
wechat-ai invite create 5        # 创建5个邀请码（每个限1次使用）
wechat-ai invite create 3 10     # 创建3个邀请码（每个限10次使用，支持多次续期）
```

#### 3. 用户注册

用户访问 http://your-server:3000/login.html，输入邀请码注册。系统自动签发 JWT Token（有效期 7 天）。

#### 4. 启动 Bot & 微信绑定

1. 用户在控制台点击「启动 Bot」
2. 系统生成专属二维码（服务端渲染，无需外部依赖）
3. 用户用微信扫描二维码完成绑定
4. 绑定后即可在微信中与 Bot 对话

#### 5. 配置 AI 模型

用户在控制台选择模型并配置自己的 API Key（支持通义千问、DeepSeek、Claude、GPT、Gemini、自定义）。

### 会话管理

- **有效期**: 7 天（JWT Token 过期时间）
- **续期方式**: 会话未过期时重新登录不扣除邀请码次数；过期后续期扣除一次
- **邀请码复用**: 邀请码绑定用户，同一邀请码可多次登录续期（直到 maxUses 用完）
- **状态恢复**: 重新登录后，之前的配置和会话上下文将被保留

### Web 控制台功能

| 功能 | 说明 |
|------|------|
| 邀请码登录 | 首次注册或已有用户重新登录 |
| Bot 管理 | 启动 / 停止专属 Bot，实时查看状态 |
| 二维码绑定 | 服务端生成 QR，微信扫码绑定 |
| API 配置 | 选择模型、设置 API Key |
| 会话续期 | Token 过期前重新登录免扣次数 |

### 管理命令

```bash
# 邀请码管理
wechat-ai invite create [数量] [最大次数]  # 创建邀请码
wechat-ai invite list                     # 列出邀请码
wechat-ai invite revoke <码>              # 禁用邀请码

# 用户管理
wechat-ai user list                       # 列出用户
wechat-ai user info <id>                  # 查看用户信息
```

### API 端点

#### 认证（公开）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 邀请码注册 / 登录（返回 JWT） |
| `/api/auth/me` | GET | 查看当前登录状态 |
| `/api/auth/logout` | POST | 退出登录 |

#### 用户配置（需 JWT）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取用户配置 |
| `/api/config` | PUT | 更新用户配置 |
| `/api/config/provider/:name/key` | POST | 设置 AI 提供商 API Key |
| `/api/config/default-provider` | POST | 设置默认 AI 提供商 |

#### Bot 管理（需 JWT）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/bot/start` | POST | 启动用户专属 Bot（生成 QR） |
| `/api/bot/status` | GET | 查询 Bot 状态（含 QR 二维码 data URL） |
| `/api/bot/stop` | POST | 停止用户 Bot |

#### 管理员（需 Admin Secret）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/admin/invites` | GET | 列出所有邀请码 |
| `/api/admin/invite` | POST | 创建邀请码 |
| `/api/admin/invite/:code` | DELETE | 禁用邀请码 |
| `/api/admin/users` | GET | 列出所有用户 |
| `/api/admin/user/:id` | GET | 查看用户详情 |

#### 系统

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |

### 技术细节

- **认证**: JWT (HMAC-SHA256)，无服务端状态，Token 有效期 7 天
- **Bot 隔离**: 每用户独立 WeixinChannel 实例，文件按 `instanceId` 隔离
- **QR 生成**: 服务端通过 `qrcode` npm 包生成 data URL，前端直接渲染 `<img>`
- **Bot 容量**: 最大 10 个并发 Bot 实例，30 分钟无活动自动回收
- **QR 有效期**: 微信 iLink API 生成，约 2 分钟过期，支持一键重新生成

## 协议

MIT
