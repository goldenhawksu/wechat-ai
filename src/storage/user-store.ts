import { randomUUID } from "node:crypto";
import { getDatabase } from "./database.js";
import type { PlatformUser, UserConfig, UserSession, InviteCode } from "../types.js";
import { createLogger } from "../logger.js";

const log = createLogger("user-store");

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============ User Operations ============

export function createUser(inviteCode: string): PlatformUser {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO users (id, invite_code, created_at, last_active_at, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  stmt.run(id, inviteCode, now, now, now + SESSION_DURATION_MS);

  log.info(`Created user: ${id}`);
  return getUser(id)!;
}

export function getUser(id: string): PlatformUser | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  const row = stmt.get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    wechatId: row.wechat_id as string | undefined,
    name: row.name as string | undefined,
    inviteCode: row.invite_code as string,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
    expiresAt: row.expires_at as number,
    isActive: row.is_active === 1,
  };
}

export function getUserByInviteCode(inviteCode: string): PlatformUser | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE invite_code = ?");
  const row = stmt.get(inviteCode) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    wechatId: row.wechat_id as string | undefined,
    name: row.name as string | undefined,
    inviteCode: row.invite_code as string,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
    expiresAt: row.expires_at as number,
    isActive: row.is_active === 1,
  };
}

export function getUserByWechatId(wechatId: string): PlatformUser | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE wechat_id = ?");
  const row = stmt.get(wechatId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    wechatId: row.wechat_id as string | undefined,
    name: row.name as string | undefined,
    inviteCode: row.invite_code as string,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
    expiresAt: row.expires_at as number,
    isActive: row.is_active === 1,
  };
}

export function linkWechatAccount(userId: string, wechatId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("UPDATE users SET wechat_id = ?, last_active_at = ? WHERE id = ?");
  const result = stmt.run(wechatId, Date.now(), userId);
  return result.changes > 0;
}

export function updateUserActivity(userId: string): void {
  const db = getDatabase();
  const stmt = db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?");
  stmt.run(Date.now(), userId);
}

export function isUserExpired(userId: string): boolean {
  const user = getUser(userId);
  if (!user) return true;
  return Date.now() > user.expiresAt;
}

export function extendUserSession(userId: string): void {
  const db = getDatabase();
  const newExpiresAt = Date.now() + SESSION_DURATION_MS;
  const stmt = db.prepare("UPDATE users SET expires_at = ?, is_active = 1 WHERE id = ?");
  stmt.run(newExpiresAt, userId);
  log.info(`Extended session for user: ${userId}`);
}

export function getExpiredUsers(): PlatformUser[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE expires_at < ? AND is_active = 1");
  const rows = stmt.all(Date.now()) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    wechatId: row.wechat_id as string | undefined,
    name: row.name as string | undefined,
    inviteCode: row.invite_code as string,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
    expiresAt: row.expires_at as number,
    isActive: row.is_active === 1,
  }));
}

export function listUsers(): PlatformUser[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
  const rows = stmt.all() as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    wechatId: row.wechat_id as string | undefined,
    name: row.name as string | undefined,
    inviteCode: row.invite_code as string,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
    expiresAt: row.expires_at as number,
    isActive: row.is_active === 1,
  }));
}

// ============ User Config Operations ============

export function getUserConfig(userId: string): UserConfig | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM user_configs WHERE user_id = ?");
  const row = stmt.get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    userId: row.user_id as string,
    defaultProvider: row.default_provider as string,
    providers: JSON.parse(row.providers as string),
    skills: row.skills ? JSON.parse(row.skills as string) : undefined,
    mcpServers: row.mcp_servers ? JSON.parse(row.mcp_servers as string) : undefined,
    systemPrompt: row.system_prompt as string | undefined,
    updatedAt: row.updated_at as number,
  };
}

export function saveUserConfig(config: UserConfig): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_configs
    (user_id, default_provider, providers, skills, mcp_servers, system_prompt, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    config.userId,
    config.defaultProvider,
    JSON.stringify(config.providers),
    config.skills ? JSON.stringify(config.skills) : null,
    config.mcpServers ? JSON.stringify(config.mcpServers) : null,
    config.systemPrompt || null,
    Date.now()
  );

  log.info(`Saved config for user: ${config.userId}`);
}

export function createDefaultUserConfig(userId: string, defaultProvider: string = "qwen"): UserConfig {
  const config: UserConfig = {
    userId,
    defaultProvider,
    providers: {},
    updatedAt: Date.now(),
  };
  saveUserConfig(config);
  return config;
}

// ============ User Session Operations ============

export function getUserSession(userId: string): UserSession | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM user_sessions WHERE user_id = ?");
  const row = stmt.get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    userId: row.user_id as string,
    conversationContext: row.conversation_context ? new Map(Object.entries(JSON.parse(row.conversation_context as string))) : new Map(),
    lastContextToken: row.last_context_token as string | undefined,
    lastActiveAt: row.last_active_at as number,
  };
}

export function saveUserSession(session: UserSession): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_sessions (user_id, conversation_context, last_context_token, last_active_at)
    VALUES (?, ?, ?, ?)
  `);

  const contextObj = Object.fromEntries(session.conversationContext);

  stmt.run(
    session.userId,
    Object.keys(contextObj).length > 0 ? JSON.stringify(contextObj) : null,
    session.lastContextToken || null,
    Date.now()
  );
}

// ============ Invite Code Operations ============

export function createInviteCode(createdBy: string, maxUses: number = 0): InviteCode {
  const db = getDatabase();
  const code = generateInviteCode();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO invite_codes (code, created_by, created_at, max_uses, use_count, is_active)
    VALUES (?, ?, ?, ?, 0, 1)
  `);

  stmt.run(code, createdBy, now, maxUses);

  log.info(`Created invite code: ${code}`);
  return getInviteCode(code)!;
}

export function getInviteCode(code: string): InviteCode | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM invite_codes WHERE code = ?");
  const row = stmt.get(code) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    code: row.code as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    maxUses: row.max_uses as number,
    useCount: row.use_count as number,
    isActive: row.is_active === 1,
    expiresAt: row.expires_at as number | undefined,
  };
}

export function useInviteCode(code: string): boolean {
  const db = getDatabase();
  const invite = getInviteCode(code);

  if (!invite || !invite.isActive) return false;
  if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) return false;
  if (invite.expiresAt && Date.now() > invite.expiresAt) return false;

  const stmt = db.prepare("UPDATE invite_codes SET use_count = use_count + 1 WHERE code = ?");
  stmt.run(code);

  return true;
}

export function revokeInviteCode(code: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("UPDATE invite_codes SET is_active = 0 WHERE code = ?");
  const result = stmt.run(code);
  return result.changes > 0;
}

export function listInviteCodes(activeOnly: boolean = false): InviteCode[] {
  const db = getDatabase();
  const stmt = activeOnly
    ? db.prepare("SELECT * FROM invite_codes WHERE is_active = 1")
    : db.prepare("SELECT * FROM invite_codes ORDER BY created_at DESC");
  const rows = stmt.all() as Record<string, unknown>[];

  return rows.map(row => ({
    code: row.code as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    maxUses: row.max_uses as number,
    useCount: row.use_count as number,
    isActive: row.is_active === 1,
    expiresAt: row.expires_at as number | undefined,
  }));
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
