# wechat-ai 多租户平台安全加固实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固 wechat-ai 多租户平台的认证、授权、数据保护和滥用防护机制，针对公网部署环境。

**Architecture:** 在现有架构上添加安全层，包括：安全会话管理、API Key 加密存储、请求限流、输入验证、审计日志。保持最小改动原则，优先解决高风险漏洞。
**Tech Stack:** express-session (会话管理)、 express-rate-limit (限流)、 zod (输入验证)

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

### 弁胁模型

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
**优先级:** P0 - 预阻冒最严重的认证绕过漏洞
**依赖:** 无
**测试:** 修改后发送 `X-User-Id` header 应返回 401

**估计时间:** 10分钟

**详细程度:** 简单修改
**复杂度:** 低

- [ ] **Step 1: Write测试用例**
- Create: `tests/web/middleware/auth.test.ts`

```typescript
import { describe, it, from "node:test";
import { authMiddleware } from "../../../src/web/middleware/auth.js";
import type { PlatformRequest } from "../../../src/web/middleware/auth.js";
import { Response } from "express";

describe("authMiddleware", () => {
  it("should reject requests with X-User-Id header but no session", () => {
    const req: Partial<PlatformRequest> = {
      headers: { "x-user-id": "test-user-123" },
      session: undefined,
    };
    const res = { status: jest.fn().mockReturn(this), json: jest.fn() } as unknown as Response;
    const next = jest.fn();

    authMiddleware(req as PlatformRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should accept requests with valid session userId", () => {
    const req: Partial<PlatformRequest> = {
      headers: {},
      session: { userId: "valid-user-456" },
    };
    const res = { status: jest.fn().mockReturn(this), json: jest.fn() } as unknown as Response;
    const next = jest.fn();

    authMiddleware(req as PlatformRequest, res as Response, next);
    expect(req.userId).toBe("valid-user-456");
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --experimental-vm-modules --test tests/web/middleware/auth.test.ts`
Expected: FAIL - authMiddleware rejects X-User-Id

Expected: 1 passing, 2 failing

- [ ] **Step 3: 修改 authMiddleware 移除 header 认证**

修改 `src/web/middleware/auth.ts`:

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

- [ ] **Step 4: 运行测试验证通过**

Run: `node --experimental-vm-modules --test tests/web/middleware/auth.test.ts`
Expected: PASS (2 tests)
- [ ] **Step 5: 修改 /api/auth/me 路由，移除 header 支持**

修改 `src/web/routes/auth.ts` 中 `/me` 端点:

- 将 `const userId = (req.headers["x-user-id"] || req.session?.userId)` 改为 `const userId = req.session?.userId`
- [ ] **Step 6: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: No errors
- [ ] **Step 7: Commit**

```bash
git add src/web/middleware/auth.ts src/web/routes/auth.ts tests/web/middleware/auth.test.ts
git commit -m "security: remove X-User-Id header authentication bypass"
```
---

## Task 2: 配置 CORS 白名单

**Files:**
- Modify: `src/web/server.ts`

**问题:** 当前 CORS 设置为 `Access-Control-Allow-Origin: *`，任何网站都可调用 API。
**优先级:** P0 - 与 Task 1 并行
**依赖:** 无
**测试:** 只有白名单域名能访问 API
**估计时间:** 15分钟
**详细程度:** 中等复杂度
**复杂度:** 低
**风险评估:** 如需暴露公网，必须配置环境变量
- [ ] **Step 1: 添加环境变量配置 CORS**

修改 `src/web/server.ts`:
- 添加环境变量 `CORS_ORIGINS`
- 从环境变量解析白名单，设置默认行为空数组（只允许同源)
- 使用 middleware 飣 Whit名单中的 origin
- 处理 preflight 请求
- 对非白名单 origin 返回 403

- 将 CORS 配置与移动到文件开头，方便阅读

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: No errors
- [ ] **Step 3: 添加 CORS_ORIGINS 到 README 文档**
- 在 README.md 添加环境变量说明
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

**问题:** 无请求限流，API 调用可被滥用。
**优先级:** P0 - 服务滥用防护
**依赖:** express-rate-limit
**测试:** 超过限流限制返回 429
**估计时间:** 20分钟
**详细程度:** 中等复杂度
**复杂度:** 中
**风险评估:** 鷻加依赖、 齽要配置环境变量
- [ ] **Step 1: 安装 express-rate-limit**

Run: `npm install express-rate-limit`
npm install -D @types/express-rate-limit`
Expected: 成功安装
- [ ] **Step 2: 创建 rate-limit.ts**
- 创建 `src/web/middleware/rate-limit.ts`
- 定义三种限流器:
  - apiLimiter: 通用 API 限流 (60次/分钟)
  - registerLimiter: 注册限流 (10次/小时)
  - configLimiter: 配置更新限流 (30次/分钟)
- 使用 userId (已登录) 或 IP (未登录) 作为限流 key
- [ ] **Step 3: 在 server.ts 中应用限流**
- 在路由之前添加限流 middleware
- 导入限流器
- 应用到对应路由
- [ ] **Step 4: 运行类型检查**
Run: `npx tsc --noEmit`
Expected: No errors
- [ ] **Step 5: Commit**

```bash
git add src/web/middleware/rate-limit.ts src/web/server.ts package.json package-lock.json
git commit -m "security: add rate limiting middleware"
```
---

## Task 4: 添加输入验证

**Files:**
- Create: `src/web/middleware/validate.ts`
- Modify: `src/web/routes/auth.ts`
- Modify: `src/web/routes/config.ts`
- Modify: `package.json`

**问题:** 无输入验证，潜在注入/污染攻击。
**优先级:** P1 - 数据完整性
**依赖:** zod
**测试:** 无效输入返回 400 锏有效输入通过
**估计时间:** 20分钟
**详细程度:** 中等复杂度
**复杂度:** 中
**风险评估:** 添加依赖， 增加包大小
- [ ] **Step 1: 安装 zod**

Run: `npm install zod`
Expected: 成成功安装
- [ ] **Step 2: 创建 validate.ts**
- 创建 `src/web/middleware/validate.ts`
- 定义验证 schemas
- 定义验证中间件工厂函数
- 支持请求体验证和参数验证
- [ ] **Step 3: 在 auth.ts 中应用验证**
- 在 /register 路由添加 validate middleware
- [ ] **Step 4: 在 config.ts 中应用验证**
- 在 /provider/:provider/key 路由添加参数和请求体验证
- [ ] **Step 5: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: No errors
- [ ] **Step 6: Commit**

```bash
git add src/web/middleware/validate.ts src/web/routes/auth.ts src/web/routes/config.ts package.json package-lock.json
git commit -m "security: add input validation with zod"
```
---

## Task 5: API Key 脱敏返回

**Files:**
- Modify: `src/web/routes/config.ts`

**问题:** GET /api/config 返回完整 API Key，可能泄露
**优先级:** P1 - 数据保护
**依赖:** 无
**测试:** API Key 显示为 `sk-xxx...xxx` 格式
**估计时间:** 10分钟
**详细程度:** 简单
**复杂度:** 低
**风险评估:** 低风险
- [ ] **Step 1: 创建脱敏函数**

在 `config.ts` 顶部添加:
- 创建 maskApiKey 函数
- 保留前4个和后4个字符
- [ ] **Step 2: 修改 GET /api/config 响应**
- 获取用户配置
- 对 providers 中的 apiKey 进行脱敏
- 返回脱敏后的配置
- [ ] **Step 3: 运行类型检查**
Run: `npx tsc --noEmit`
Expected: No errors
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

**问题:** 无审计日志，无法追踪安全事件
**优先级:** P2 - 安全监控
**依赖:** database.ts (表结构)
**测试:** 关键操作被记录到数据库
**估计时间:** 20分钟
**详细程度:** 中等复杂度
**复杂度:** 中
**风险评估:** 需要数据库 migration
- [ ] **Step 1: 在 database.ts 添加审计日志表**

在 SCHEMA 常量中添加:
- audit_log 表定义
- 相关索引
- [ ] **Step 2: 创建 audit-log.ts**
- 创建 `src/utils/audit-log.ts`
- 定义 AuditEntry 接口
- 实现 audit 函数
- 定义常用审计操作常量
- [ ] **Step 3: 在 auth.ts 中添加审计**
- 注册成功后记录审计日志
- 登出时记录审计日志
- [ ] **Step 4: 在 config.ts 中添加审计**
- 设置 API Key 后记录审计日志
- [ ] **Step 5: 运行类型检查**
Run: `npx tsc --noEmit`
Expected: No errors
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

**问题:** 缺少 IP 支持，无法进行审计和限流
**优先级:** P2 - 支持审计和限流
**依赖:** 无
**测试:** req.ip 可正确设置
**估计时间:** 10分钟
**详细程度:** 简单
**复杂度:** 低
**风险评估:** 低风险
- [ ] **Step 1: 更新 PlatformRequest 接口**

在 `src/web/middleware/auth.ts` 中添加 `ip?: string` 属性
- [ ] **Step 2: 在 server.ts 中添加 trust proxy 设置**

在 `createWebServer` 函数开头添加
- 设置 `app.set("trust proxy", 1)`
- 信任反向代理传递的 X-Forwarded-For header
- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: No errors
- [ ] **Step 4: Commit**

```bash
git add src/web/middleware/auth.ts src/web/server.ts
git commit -m "security: add IP support for audit and rate limiting"
```
---

## Task 8: 编写安全测试

**Files:**
- Create: `tests/security/auth-bypass.test.ts`
- Create: `tests/security/rate-limit.test.ts`
- Create: `tests/security/input-validation.test.ts`

**问题:** 无自动化安全测试
**优先级:** P3 - 验证
**依赖:** Tasks 1-7 完成
**测试:** 所有安全测试通过
**估计时间:** 20分钟
**详细程度:** 中等复杂度
**复杂度:** 中
**风险评估:** 低风险
- [ ] **Step 1: 创建 auth-bypass 测试**
- 测试 X-User-Id header 无法绑过认证
- 测试只有 session 扢能通过认证
- [ ] **Step 2: 创建 rate-limit 测试**
- 测试超过限流限制返回 429
- 测试不同用户独立限流
- [ ] **Step 3: 创建 input-validation 测试**
- 测试无效邀请码被拒绝
- 测试无效 API Key 格式被拒绝
- [ ] **Step 4: 运行所有测试**

Run: `npm test`
Expected: All tests pass
- [ ] **Step 5: Commit**

```bash
git add tests/security/
git commit -m "test: add security tests for auth bypass, rate limiting, input validation"
```
