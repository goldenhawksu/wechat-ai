# Per-User Bot Instance + JWT Auth Design

**Date:** 2026-04-06
**Status:** Draft

## Overview

Transform the platform from a single shared bot to per-user independent bot instances. Each registered user gets their own WeChat Bot that runs independently with their own configuration.

### User Flow

```
1. Admin creates invite codes via admin.html
2. User visits login.html → enters invite code → registers → receives JWT
3. User sees Dashboard → clicks "启动我的 Bot" → system creates WeixinChannel
4. Dashboard shows QR code → user scans with WeChat → Bot goes online
5. User configures API Key → Bot uses user's own AI provider
6. User's WeChat friends chat with their personal Bot
```

### Key Decisions

- **Auth:** JWT tokens (stateless, stored in localStorage)
- **Max concurrent bots:** 10
- **Idle timeout:** 30 minutes auto-stop
- **Bot storage:** Per-user account files in `~/.wai/accounts/`

---

## 1. JWT Authentication

### Replace header-based auth with JWT

**Registration flow:**
- `POST /api/auth/register` → validates invite code → creates user → returns JWT
- JWT payload: `{ userId, exp }`, signed with `WAI_JWT_SECRET` env var (default: random 32-byte hex)
- JWT expiry: 7 days (matching session duration)

**Request auth:**
- Client sends `Authorization: Bearer <token>` header
- `authMiddleware` verifies JWT, extracts userId, validates user exists
- No more `X-User-Id` header or `req.session` hack

**Files to modify:**
- `src/web/middleware/auth.ts` — JWT verification, remove header-based auth
- `src/web/routes/auth.ts` — issue JWT on register, remove header fallbacks
- `src/web/server.ts` — remove session middleware (X-User-Id → session), add JWT parsing
- `web-ui/login.html` — store JWT instead of userId
- `web-ui/dashboard.html` — send JWT in Authorization header
- `web-ui/admin.html` — admin auth stays as X-Admin-Secret (separate concern)

**New dependency:** `jsonwebtoken` (or use Node.js `crypto` for HS256 JWT)

### JWT Implementation (using Node.js crypto, no external deps)

```typescript
// src/web/middleware/jwt.ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const JWT_SECRET = process.env.WAI_JWT_SECRET || randomBytes(32).toString("hex");
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export function signToken(userId: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ userId, exp: Date.now() + JWT_EXPIRY_MS }));
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && Date.now() > data.exp) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}
```

---

## 2. BotManager

### Per-user bot instance manager

**Responsibilities:**
- Create/destroy WeixinChannel instances per user
- Track running instances (max 10)
- Auto-cleanup idle instances (30 min timeout)
- Route messages to correct user's agent

**New file:** `src/platform/bot-manager.ts`

```typescript
interface RunningBot {
  userId: string;
  channel: WeixinChannel;
  gateway: Gateway;
  lastActivity: number;
  cleanupTimer: NodeJS.Timeout;
}

class BotManager {
  private bots = new Map<string, RunningBot>(); // userId → RunningBot
  private readonly MAX_BOTS = 10;
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  async startBot(userId: string): Promise<{ qrUrl: string; status: string }>
  async stopBot(userId: string): Promise<void>
  async getBotQR(userId: string): Promise<{ status: string; url?: string } | null>
  getBotStatus(userId: string): { running: boolean; status: string; accountId?: string }
  getRunningCount(): number
  stopAll(): Promise<void>
}
```

**Bot lifecycle:**
1. User clicks "启动" → `BotManager.startBot(userId)`
2. Creates WeixinChannel with `instanceId = userId`
3. Calls `channel.login()` → generates QR
4. Returns QR URL to dashboard
5. Dashboard polls `GET /api/bot/status` → returns QR + scan status
6. On scan confirmed → channel goes online → starts message loop
7. On idle timeout → auto-stop and cleanup
8. User can manually stop via `POST /api/bot/stop`

**Message routing:**
- Each WeixinChannel has its own `onMessage` callback
- The callback routes through the user's own Gateway + AgentPool
- No need for global SessionManager routing — each instance is self-contained

---

## 3. Web API Changes

### New Bot Routes (`src/web/routes/bot.ts`)

All routes require JWT auth:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/bot/start` | Start user's bot instance, returns QR |
| GET | `/api/bot/status` | Get bot status (offline/qr_pending/qr_scanned/online) |
| POST | `/api/bot/stop` | Stop user's bot instance |

### Modified Auth Routes

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/auth/register` | Returns JWT instead of userId |
| GET | `/api/auth/me` | Reads from JWT, removes header fallback |
| POST | `/api/auth/logout` | Client-side only (clear JWT from localStorage) |

### Remove

- Session middleware (X-User-Id → req.session)
- `X-User-Id` header from CORS allowed headers
- `rate-limit.ts` (unwired, missing dependency — clean up)

---

## 4. Web UI Changes

### login.html
- Store JWT token instead of userId
- Same flow: enter invite code → register → redirect to dashboard

### dashboard.html
- Send JWT in `Authorization: Bearer <token>` header
- New "Bot 管理" section:
  - "启动我的 Bot" button → calls `POST /api/bot/start`
  - Shows QR code while pending
  - Shows bot status (offline/scanning/online)
  - "停止 Bot" button when running
- Keep existing API config section

### admin.html
- Remove global QR tab (no longer needed — each user has their own QR)
- Add "Bot 实例" tab showing all running bot instances
- Keep invite code and user management tabs

---

## 5. Bug Fixes (included in this change)

| Issue | Fix |
|-------|-----|
| Session is header-based | Replace with JWT |
| `optionalAuth` reads X-User-Id | Remove header reading, use JWT |
| `/api/auth/me` reads header | Use JWT only |
| Missing `express-rate-limit` | Remove the file (was never wired) |
| Rate limiters not applied | Remove (clean up unused code) |
| No WeChat-Web binding | BotManager handles per-user QR |
| Test syntax error in validate.test.ts | Fix string concatenation `.` → `+` |

---

## 6. File Changes Summary

### New Files
- `src/web/middleware/jwt.ts` — JWT sign/verify utilities
- `src/platform/bot-manager.ts` — Per-user bot instance manager
- `src/web/routes/bot.ts` — Bot management API routes

### Modified Files
- `src/web/server.ts` — Remove session middleware, add bot routes, remove X-User-Id from CORS
- `src/web/middleware/auth.ts` — JWT-based authMiddleware, remove header reading
- `src/web/routes/auth.ts` — Issue JWT on register, verify on /me
- `src/channels/weixin.ts` — Support instanceId for per-user account files
- `web-ui/login.html` — Store JWT
- `web-ui/dashboard.html` — Bot management UI, JWT auth
- `web-ui/admin.html` — Remove global QR, add instance monitoring
- `src/storage/user-store.ts` — Add `getActiveBotCount()` helper
- `src/types.ts` — Add BotStatus type

### Removed Files
- `src/web/middleware/rate-limit.ts` — Unused, missing dependency

### Test Files
- `tests/security/validate.test.ts` — Fix syntax error
- New: `tests/platform/bot-manager.test.ts`
- New: `tests/web/jwt.test.ts`
