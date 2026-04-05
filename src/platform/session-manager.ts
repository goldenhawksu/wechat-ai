import { createLogger } from "../logger.js";
import {
  getUser,
  getUserByWechatId,
  linkWechatAccount,
  updateUserActivity,
  isUserExpired,
  extendUserSession,
  getUserSession,
  saveUserSession,
  getUserConfig,
  createDefaultUserConfig,
  saveUserConfig,
  useInviteCode,
  createUser,
} from "../storage/user-store.js";
import { getAgentPool } from "./agent-pool.js";
import type { UserConfig } from "../types.js";

const log = createLogger("session-manager");

export class SessionManager {
  /**
   * Handle incoming WeChat message - route to correct user's agent
   */
  async handleIncomingMessage(
    wechatSenderId: string,
    messageText: string,
    contextToken?: string
  ): Promise<{ response: string; userId: string } | null> {
    // Find user by WeChat ID
    let user = getUserByWechatId(wechatSenderId);

    if (!user) {
      // User not registered - they need to register via web first
      log.warn(`Unregistered user attempted message: ${wechatSenderId}`);
      return {
        response: "请先访问管理页面注册并绑定微信。",
        userId: "",
      };
    }

    // Check if session expired
    if (isUserExpired(user.id)) {
      log.info(`User session expired: ${user.id}`);
      // Session expired - user needs to re-scan QR code to extend
      return {
        response: "您的会话已过期（7天未活动）。请访问管理页面重新扫码激活。",
        userId: user.id,
      };
    }

    // Update activity
    updateUserActivity(user.id);

    // Get user config
    let config = getUserConfig(user.id);
    if (!config) {
      config = createDefaultUserConfig(user.id);
    }

    // Get or create session
    let session = getUserSession(user.id);
    if (!session) {
      session = {
        userId: user.id,
        conversationContext: new Map(),
        lastActiveAt: Date.now(),
      };
    }

    // Update context token
    if (contextToken) {
      session.lastContextToken = contextToken;
      saveUserSession(session);
    }

    // Query agent
    const agentPool = getAgentPool();
    const response = await agentPool.query(
      user.id,
      config,
      messageText,
      `session_${user.id}`,
      {
        systemPrompt: config.systemPrompt,
      }
    );

    return { response, userId: user.id };
  }

  /**
   * Register new user with invite code
   */
  async registerUser(inviteCode: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    if (!useInviteCode(inviteCode)) {
      return { success: false, error: "无效或已过期的邀请码" };
    }

    const user = createUser(inviteCode);
    createDefaultUserConfig(user.id);

    log.info(`Registered new user: ${user.id}`);
    return { success: true, userId: user.id };
  }

  /**
   * Link WeChat account to user (called when user scans QR)
   */
  async linkWechat(userId: string, wechatId: string): Promise<boolean> {
    // Check if WeChat ID already linked
    const existingUser = getUserByWechatId(wechatId);
    if (existingUser && existingUser.id !== userId) {
      log.warn(`WeChat ID already linked to different user: ${wechatId}`);
      return false;
    }

    // Check if user exists and is expired (recovery scenario)
    const user = getUser(userId);
    if (!user) {
      return false;
    }

    // Link and extend session
    linkWechatAccount(userId, wechatId);

    if (isUserExpired(userId)) {
      extendUserSession(userId);
      log.info(`Recovered expired session for user: ${userId}`);
    }

    return true;
  }

  /**
   * Get user's pending QR scan status
   */
  getUserStatus(userId: string): {
    exists: boolean;
    isLinked: boolean;
    isExpired: boolean;
    expiresAt?: number;
  } {
    const user = getUser(userId);

    if (!user) {
      return { exists: false, isLinked: false, isExpired: true };
    }

    return {
      exists: true,
      isLinked: !!user.wechatId,
      isExpired: isUserExpired(userId),
      expiresAt: user.expiresAt,
    };
  }

  /**
   * Get user configuration
   */
  getUserConfig(userId: string): UserConfig | null {
    return getUserConfig(userId);
  }

  /**
   * Update user configuration
   */
  updateUserConfig(userId: string, updates: Partial<UserConfig>): boolean {
    const existing = getUserConfig(userId);
    if (!existing) return false;

    const updated: UserConfig = {
      ...existing,
      ...updates,
      userId,
      updatedAt: Date.now(),
    };

    saveUserConfig(updated);
    return true;
  }
}

// Singleton
let manager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!manager) {
    manager = new SessionManager();
  }
  return manager;
}
