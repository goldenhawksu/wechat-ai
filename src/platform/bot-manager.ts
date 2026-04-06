import { createLogger } from "../logger.js";
import { WeixinChannel } from "../channels/weixin.js";
import { getUserConfig, createDefaultUserConfig } from "../storage/user-store.js";
import { getAgentPool } from "./agent-pool.js";
import type { InboundMessage } from "../types.js";
import QRCode from "qrcode";

const log = createLogger("bot-manager");

interface RunningBot {
  userId: string;
  channel: WeixinChannel;
  lastActivity: number;
  cleanupTimer: ReturnType<typeof setTimeout>;
  loginComplete: boolean; // true once login() finishes (QR scanned or account loaded)
}

const MAX_BOTS = 10;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class BotManager {
  private bots = new Map<string, RunningBot>(); // userId → RunningBot

  /**
   * Start a bot for a user. Creates a WeixinChannel and begins login.
   * Returns immediately — user should poll getBotStatus() for QR and status.
   */
  async startBot(userId: string): Promise<{ status: string; message: string }> {
    // Already running?
    const existing = this.bots.get(userId);
    if (existing) {
      const qr = existing.channel.pendingQR;
      if (qr && qr.status !== "expired") {
        return { status: "pending", message: "等待扫码" };
      }
      if (!qr) {
        return { status: "online", message: "Bot 已在线" };
      }
      // QR expired — stop old bot and create a fresh one
      log.info(`QR expired for user ${userId.slice(0, 8)}..., restarting`);
      await this.stopBot(userId);
    }

    // Check capacity
    if (this.bots.size >= MAX_BOTS) {
      return { status: "capacity", message: `已达到最大 Bot 数量 (${MAX_BOTS})，请稍后再试` };
    }

    // Ensure user has a config
    if (!getUserConfig(userId)) {
      createDefaultUserConfig(userId);
    }

    // Create WeixinChannel with instanceId = userId
    const channel = new WeixinChannel({
      type: "weixin",
      enabled: true,
      instanceId: userId,
    });

    // Set up idle cleanup timer
    const cleanupTimer = setInterval(() => {
      const bot = this.bots.get(userId);
      if (bot && Date.now() - bot.lastActivity > IDLE_TIMEOUT_MS) {
        log.info(`Bot idle timeout for user: ${userId.slice(0, 8)}...`);
        this.stopBot(userId);
      }
    }, 60_000);

    this.bots.set(userId, {
      userId,
      channel,
      lastActivity: Date.now(),
      cleanupTimer,
      loginComplete: false,
    });

    // Start the channel in background.
    // start() will call login() which generates QR, then polls until confirmed,
    // then runs the message loop. All of this is async and non-blocking for us.
    channel.start((msg: InboundMessage) => {
      this.handleMessage(userId, msg);
    }).then(() => {
      const bot = this.bots.get(userId);
      if (bot && bot.channel === channel) {
        bot.loginComplete = true;
      }
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Bot error for user ${userId.slice(0, 8)}...: ${msg}`);
      // Mark QR as expired so UI shows restart button
      if (channel.pendingQR && channel.pendingQR.status !== "expired") {
        channel.pendingQR.status = "expired";
      }
    });

    return { status: "starting", message: "Bot 启动中，正在生成二维码..." };
  }

  /**
   * Get bot status for a user
   */
  async getBotStatus(userId: string): Promise<{
    running: boolean;
    status: "offline" | "starting" | "pending" | "scanned" | "online" | "expired" | "error";
    qrUrl?: string;
    qrImage?: string;
    message: string;
  }> {
    const bot = this.bots.get(userId);
    if (!bot) {
      return { running: false, status: "offline", message: "Bot 未启动" };
    }

    const qr = bot.channel.pendingQR;
    if (qr) {
      let qrImage: string | undefined;
      if (qr.url && qr.status === "pending") {
        try {
          qrImage = await QRCode.toDataURL(qr.url, {
            width: 250,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch (err) {
          log.warn(`Failed to generate QR image: ${err}`);
        }
      }
      return {
        running: true,
        status: qr.status as "pending" | "scanned" | "expired",
        qrUrl: qr.url,
        qrImage,
        message: qr.status === "pending"
          ? "等待扫码"
          : qr.status === "scanned"
            ? "已扫码，等待确认..."
            : qr.status === "expired"
              ? "二维码已过期，请重新启动"
              : "状态更新中",
      };
    }

    // No pendingQR — check if login completed (bot online) or still starting
    if (bot.loginComplete) {
      return { running: true, status: "online", message: "Bot 在线" };
    }
    return { running: true, status: "starting", message: "正在启动..." };
  }

  /**
   * Stop a user's bot
   */
  async stopBot(userId: string): Promise<void> {
    const bot = this.bots.get(userId);
    if (!bot) return;

    clearInterval(bot.cleanupTimer);
    await bot.channel.stop();
    this.bots.delete(userId);
    log.info(`Stopped bot for user: ${userId.slice(0, 8)}...`);
  }

  /**
   * Get number of running bots
   */
  getRunningCount(): number {
    return this.bots.size;
  }

  /**
   * Get all running bot user IDs with their online status
   */
  getRunningBots(): Array<{ userId: string; online: boolean }> {
    return [...this.bots.entries()].map(([userId, bot]) => ({
      userId,
      online: !bot.channel.pendingQR,
    }));
  }

  /**
   * Update activity timestamp for a user's bot
   */
  touchActivity(userId: string): void {
    const bot = this.bots.get(userId);
    if (bot) {
      bot.lastActivity = Date.now();
    }
  }

  /**
   * Stop all bots
   */
  async stopAll(): Promise<void> {
    for (const [userId, bot] of this.bots) {
      clearInterval(bot.cleanupTimer);
      try {
        await bot.channel.stop();
      } catch (err) {
        log.error(`Error stopping bot for ${userId.slice(0, 8)}...: ${err}`);
      }
    }
    this.bots.clear();
    log.info("All bots stopped");
  }

  /**
   * Handle incoming message from a user's bot
   */
  private async handleMessage(userId: string, msg: InboundMessage): Promise<void> {
    this.touchActivity(userId);

    const config = getUserConfig(userId);
    if (!config) {
      log.warn(`No config for user ${userId.slice(0, 8)}...`);
      return;
    }

    try {
      const agentPool = getAgentPool();
      const response = await agentPool.query(
        userId,
        config,
        msg.text,
        `session_${userId}`,
        { systemPrompt: config.systemPrompt },
      );

      // Send response through the user's channel
      const bot = this.bots.get(userId);
      if (bot) {
        await bot.channel.send({
          targetId: msg.senderId,
          text: response,
          replyToken: msg.replyToken,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Error processing message for ${userId.slice(0, 8)}...: ${errMsg}`);
    }
  }
}

// Singleton
let manager: BotManager | null = null;

export function getBotManager(): BotManager {
  if (!manager) {
    manager = new BotManager();
  }
  return manager;
}
