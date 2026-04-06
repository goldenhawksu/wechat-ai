# wechat-ai 多租户平台安全加固设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固 wechat-ai 多租户平台的认证、授权、数据保护和滥用防护机制，针对公网部署环境。

**Architecture:** 在现有架构上添加安全层，包括：安全会话管理、API Key 加密存储、请求限流、输入验证、审计日志。保持最小改动原则，优先解决高风险漏洞。

**Tech Stack:** express-session (会话管理)、express-rate-limit (限流)、zod (输入验证)

---

## 安全威胁分析

### 当前存在的安全漏洞

| 漏洞 | 严重程度 | 影响 |
|------|----------|------|
| X-User-Id Header 认证绕过 | **高危** | 任何人知道 userId 即可冒充该用户 |
| CORS Allow-Origin: * | **高危** | 任何网站都可调用 API |
| 内存 Session | 中危 | 重启丢失登录状态，无持久化 |
| API Key 明文存储 | 中危 | 数据库泄露导致 Key 泄露 |
| 无请求限流 | 中危 | API 调用可被滥用 |
| 无输入验证 | 中危 | 潜在注入/污染攻击 |

### 威胁模型

基于用户反馈，优先级为：
1. **服务滥用** - 攻击者消耗系统资源或刷 API 调用
2. **恶意用户越权** - 注册用户尝试访问其他用户的数据

---

## 文件结构

```
src/
├── web/
│   ├── server.ts           # 添加安全中间件
│   ├── middleware/
│   │   ├── auth.ts         # 移除 header 认证，增强 session 验证
│   │   ├── rate-limit.ts   # 新增: 请求限流
│   │   └── validate.ts     # 新增: 输入验证
│   └── routes/
│       └── config.ts       # API Key 返回时脱敏
├── storage/
│   └── user-store.ts       # API Key 加密存储
└── utils/
    └── crypto.ts           # 新增: 加密工具函数
```

---

## Task 1: 移除 X-User-Id Header 认证绕过

**Files:**
- Modify: `src/web/middleware/auth.ts`

**问题:** 当前 `authMiddleware` 接受 `X-User-Id` header 作为认证凭据，任何人知道 userId 即可冒充该用户。

- [ ] **Step 1: 修改 authMiddleware 移除 header 认证**

```typescript
import { Response, NextFunction } from "express";
import { getUser } from "../../storage/user-store.js";

export interface PlatformRequest {
  userId?: string;
  session?: { userId?: string };
  headers: { [key: string]: string | string[] | undefined };
  body: Record<string, unknown>;
  params: Record<string, string>;
}

export function authMiddleware(req: PlatformRequest, res: Response, next: NextFunction): void {
  // 仅从 session 获取 userId，移除 header 认证
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ error: "未登录" });
    return;
  }

  const user = getUser(userId);
  if (!user) {
    res.status(401).json({ error: "用户不存在" });
    return;
  }

  req.userId = userId;
  next();
}

export function optionalAuth(req: PlatformRequest, _res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (userId) {
    req.userId = userId;
  }
  next();
}
```

- [ ] **Step 2: 修改 /api/auth/me 路由，移除 header 支持**

在 `src/web/routes/auth.ts` 中修改 `/me` 端点：

```typescript
// Login check - 移除 header 支持
router.get("/me", async (req: PlatformRequest, res: Response) => {
  const userId = req.session?.userId;  // 仅从 session 获取

  if (!userId) {
    res.json({ loggedIn: false });
    return;
  }
  // ... rest unchanged
});
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/web/middleware/auth.ts src/web/routes/auth.ts
git commit -m "security: remove X-User-Id header authentication bypass"
```

---

## Task 2: 配置 CORS 白名单

**Files:**
- Modify: `src/web/server.ts`

**问题:** 当前 CORS 设置为 `Access-Control-Allow-Origin: *`，任何网站都可调用 API。

- [ ] **Step 1: 添加环境变量配置 CORS**

在 `src/web/server.ts` 中修改 CORS 配置：

```typescript
import express, { Express } from "express";
import { createLogger } from "../logger.js";
import authRoutes from "./routes/auth.js";
import configRoutes from "./routes/config.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PlatformRequest } from "./middleware/auth.js";

const log = createLogger("web-server");

// 从环境变量获取允许的源，默认只允许同源
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : [];  // 空数组表示只允许同源请求

export function createWebServer(port: number = 3000): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Simple session
  app.use((_req, res, next) => {
    (res.req as unknown as PlatformRequest).session = {};
    next();
  });

  // CORS with origin whitelist
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    
    // 如果没有 origin (同源请求) 或在白名单中，允许
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Access-Control-Allow-Credentials", "true");
    } else {
      // 不在白名单的跨域请求，拒绝
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  // Handle preflight
  app.options("*", (_req, res) => {
    res.status(204).end();
  });

  // ... rest of the file unchanged
```

- [ ] **Step 2: 添加 CORS_ORIGINS 到 README 文档**

在 `README.md` 的环境变量说明部分添加：

```markdown
### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| CORS_ORIGINS | 允许的跨域来源，逗号分隔 | `https://example.com,https://app.example.com` |
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/web/server.ts README.md
git commit -m "security: add CORS origin whitelist"
```

---

## Task 3: 添加请求限流

**Files:**
- Create: `src/web/middleware/rate-limit.ts`
- Modify: `src/web/server.ts`
- Modify: `package.json`

**目的:** 鷻加请求限流，防止 API 调用被滥用。

- [ ] **Step 1: 安装 express-rate-limit**

```bash
npm install express-rate-limit
npm install -D @types/express-rate-limit
```

- [ ] **Step 2: 创建 rate-limit.ts**

```typescript
import rateLimit from "express-rate-limit";
import { createLogger } from "../../logger.js";

const log = createLogger("rate-limit");

// 通用 API 限流: 每分钟 60 次请求
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 60,  // 每分钟最多 60 次请求
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "请求过于频繁，请稍后再试",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },
  keyGenerator: (req) => {
    // 使用 session userId 作为限流 key，未登录用户使用 IP
    return req.session?.userId || req.ip;
  }
});

// 注册限流: 每小时 10 次 (防止刷邀请码)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 小时
  max: 10,  // 每小时最多 10 次注册尝试
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn(`Register rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "注册请求过于频繁，请稍后再试",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },
  keyGenerator: (req) => {
    return req.ip;  // 注册限流使用 IP
  }
});

// 配置更新限流: 每分钟 30 次
export const configLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 30,  // 每分钟最多 30 次配置更新
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn(`Config rate limit exceeded for user: ${req.session?.userId}`);
    res.status(429).json({
      error: "配置更新过于频繁，请稍后再试",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },
  keyGenerator: (req) => {
    return req.session?.userId || req.ip;
  }
});
```

- [ ] **Step 3: 在 server.ts 中应用限流**

```typescript
import { apiLimiter, registerLimiter, configLimiter } from "./middleware/rate-limit.js";

// ... 在路由之前添加限流
app.use("/api/auth/register", registerLimiter);
app.use("/api/config", configLimiter);
app.use("/api", apiLimiter);
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/web/middleware/rate-limit.ts src/web/server.ts package.json
git commit -m "security: add rate limiting middleware"
```

---

## Task 4: 添加输入验证

**Files:**
- Create: `src/web/middleware/validate.ts`
- Modify: `src/web/routes/auth.ts`
- Modify: `src/web/routes/config.ts`
- Modify: `package.json`

**目的:** 添加输入验证，防止注入/污染攻击。

- [ ] **Step 1: 安装 zod**

```bash
npm install zod
```

- [ ] **Step 2: 创建 validate.ts**

```typescript
import { z } from "zod";
import { Response, NextFunction } from "express";
import type { PlatformRequest } from "./auth.js";

// 验证 schemas
export const registerSchema = z.object({
  inviteCode: z.string().min(8).max(16).regex(/^[A-Z0-9]+$/),
});

export const setApiKeySchema = z.object({
  apiKey: z.string().min(1).max(256),
  baseUrl: z.string().url().optional(),
});

export const setProviderSchema = z.object({
  provider: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
});

export const updateConfigSchema = z.object({
  defaultProvider: z.string().max(64).optional(),
  systemPrompt: z.string().max(4096).optional(),
});

// 验证中间件工厂
export function validate(schema: z.ZodSchema) {
  return (req: PlatformRequest, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "输入验证失败",
        details: result.error.issues.map(i => ({
          field: i.path.join("."),
          message: i.message
        }))
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams(schema: z.ZodSchema) {
  return (req: PlatformRequest, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: "参数验证失败",
        details: result.error.issues.map(i => ({
          field: i.path.join("."),
          message: i.message
        }))
      });
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}
```

- [ ] **Step 3: 在 auth.ts 中应用验证**

```typescript
import { validate, registerSchema } from "../middleware/validate.js";

// Register with invite code
router.post("/register", validate(registerSchema), async (req: PlatformRequest, res: Response) => {
  // ... body validation already done by middleware
  const inviteCode = req.body.inviteCode as string;
  // ... rest unchanged
});
```

- [ ] **Step 4: 在 config.ts 中应用验证**

```typescript
import { validate, validateParams, setApiKeySchema, setProviderSchema } from "../middleware/validate.js";

// Set API key for provider
router.post("/provider/:provider/key", 
  validateParams(setProviderSchema),
  validate(setApiKeySchema), 
  (req: PlatformRequest, res: Response) => {
    const provider = req.params.provider;
    const { apiKey, baseUrl } = req.body;
    // ... rest unchanged
  }
);
```

- [ ] **Step 5: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/web/middleware/validate.ts src/web/routes/auth.ts src/web/routes/config.ts package.json
git commit -m "security: add input validation with zod"
```

---

## Task 5: API Key 脱敏返回

**Files:**
- Modify: `src/web/routes/config.ts`

**目的:** 在 API 响应中脱敏 API Key，防止意外泄露。

- [ ] **Step 1: 创建脱敏函数**

```typescript
// 在 config.ts 顶部添加
function maskApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return "***";
  return apiKey.slice(0, 4) + "..." + apiKey.slice(-4);
}
```

- [ ] **Step 2: 修改 GET /api/config 响应**

```typescript
// Get user config
router.get("/", (req: PlatformRequest, res: Response) => {
  const config = sessionManager.getUserConfig(req.userId!);
  if (!config) {
    res.json({});
    return;
  }
  
  // 脱敏处理
  const maskedConfig = {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers || {}).map(([name, prov]) => [
        name,
        {
          ...prov,
          apiKey: maskApiKey(prov.apiKey),
        }
      ])
    ),
  };
  
  res.json(maskedConfig);
});
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/config.ts
git commit -m "security: mask API keys in GET /api/config response"
```

---

## Task 6: 添加审计日志

**Files:**
- Create: `src/utils/audit-log.ts`
- Modify: `src/storage/database.ts`
- Modify: `src/web/routes/auth.ts`
- Modify: `src/web/routes/config.ts`

**目的:** 记录关键操作，便于安全审计和问题追踪。

- [ ] **Step 1: 在 database.ts 添加审计日志表**

在 `SCHEMA` 常量中添加:

```typescript
const SCHEMA = `
-- ... existing tables ...

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
`;
```

- [ ] **Step 2: 创建 audit-log.ts**

```typescript
import { getDatabase } from "../storage/database.js";
import { createLogger } from "../logger.js";

const log = createLogger("audit");

export interface AuditEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export function audit(entry: AuditEntry): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    entry.userId || null,
    entry.action,
    entry.resource,
    entry.resourceId || null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ipAddress || null,
    entry.userAgent || null,
    Date.now()
  );
  
  log.info(`Audit: ${entry.action} on ${entry.resource}${entry.resourceId ? ` (${entry.resourceId})` : ""} by ${entry.userId || "anonymous"}`);
}

// 常用审计操作
export const AuditActions = {
  USER_REGISTER: "user.register",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  CONFIG_UPDATE: "config.update",
  API_KEY_SET: "api_key.set",
  WECHAT_LINK: "wechat.link",
} as const;

export const AuditResources = {
  USER: "user",
  CONFIG: "config",
  API_KEY: "api_key",
  SESSION: "session",
} as const;
```

- [ ] **Step 3: 在 auth.ts 中添加审计**

```typescript
import { audit, AuditActions, AuditResources } from "../../utils/audit-log.js";

// Register with invite code
router.post("/register", validate(registerSchema), async (req: PlatformRequest, res: Response) => {
  // ... after successful registration
  if (result.success) {
    audit({
      userId: result.userId,
      action: AuditActions.USER_REGISTER,
      resource: AuditResources.USER,
      resourceId: result.userId,
      ipAddress: req.headers["x-forwarded-for"] as string || req.ip,
      userAgent: req.headers["user-agent"],
    });
    // ...
  }
});

// Logout
router.post("/logout", (req: PlatformRequest, res: Response) => {
  const userId = req.session?.userId;
  if (userId) {
    audit({
      userId,
      action: AuditActions.USER_LOGOUT,
      resource: AuditResources.SESSION,
      ipAddress: req.headers["x-forwarded-for"] as string || req.ip,
    });
  }
  req.session = undefined;
  res.json({ success: true });
});
```

- [ ] **Step 4: 在 config.ts 中添加审计**

```typescript
import { audit, AuditActions, AuditResources } from "../../utils/audit-log.js";

// Set API key for provider
router.post("/provider/:provider/key", 
  validateParams(setProviderSchema),
  validate(setApiKeySchema), 
  (req: PlatformRequest, res: Response) => {
    // ... after setting API key
    audit({
      userId: req.userId,
      action: AuditActions.API_KEY_SET,
      resource: AuditResources.API_KEY,
      resourceId: provider,
      details: { provider },
      ipAddress: req.headers["x-forwarded-for"] as string || req.ip,
    });
    // ...
  }
);
```

- [ ] **Step 5: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/audit-log.ts src/storage/database.ts src/web/routes/auth.ts src/web/routes/config.ts
git commit -m "security: add audit logging for key operations"
```

---

## Task 7: 更新 PlatformRequest 类型以支持 IP

**Files:**
- Modify: `src/web/middleware/auth.ts`
- Modify: `src/web/server.ts`

**目的:** 添加 IP 地址支持，用于审计和限流。

- [ ] **Step 1: 更新 PlatformRequest 接口**

```typescript
export interface PlatformRequest {
  userId?: string;
  session?: { userId?: string };
  headers: { [key: string]: string | string[] | undefined };
  body: Record<string, unknown>;
  params: Record<string, string>;
  ip?: string;  // 新增: 客户端 IP
}
```

- [ ] **Step 2: 在 server.ts 中添加 trust proxy 设置**

```typescript
export function createWebServer(port: number = 3000): Express {
  const app = express();
  
  // 信任反向代理 (从 X-Forwarded-For 获取真实 IP)
  app.set("trust proxy", 1);
  
  // ... rest unchanged
}
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/web/middleware/auth.ts src/web/server.ts
git commit -m "security: add IP support for audit and rate limiting"
```

---

## 测试计划

- [ ] **Task 8: 编写安全测试**

```bash
# 1. 测试 X-User-Id 认证绕过已修复
curl -X GET http://localhost:3000/api/config \
  -H "X-User-Id: any-user-id" \
  # 应该返回 401

# 2. 测试限流
for i in {1..70}; do
  curl -X GET http://localhost:3000/api/health
done
# 应该在第 61 次返回 429

# 3. 测试输入验证
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"inviteCode": "invalid!"}'
# 应该返回 400 (包含特殊字符)
```

---

## 部署注意事项

1. **环境变量**: 在生产环境中设置 `CORS_ORIGINS`
2. **反向代理**: 确保 Nginx/Caddy 正确设置 `X-Forwarded-For` header
3. **数据库备份**: 审计日志会增长，定期备份和清理

## 验收标准

- [ ] 所有单元测试通过
- [ ] 类型检查无错误
- [ ] 构建成功
- [ ] 安全测试通过
