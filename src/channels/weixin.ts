import { createLogger } from "../logger.js";
import { getAccountsDir, ensureDir } from "../config.js";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import type { Channel, InboundMessage, OutboundMessage, ChannelConfig } from "../types.js";

const log = createLogger("weixin");

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "1.0.0";
const API_TIMEOUT_MS = 15_000;

// ── Message constants (from openclaw-weixin protocol) ──
const MessageType = { USER: 1, BOT: 2 } as const;
const MessageState = { NEW: 0, GENERATING: 1, FINISH: 2 } as const;
const MessageItemType = { TEXT: 1, IMAGE: 2, VOICE: 3, FILE: 4, VIDEO: 5 } as const;

// ── Types ──

interface WeixinAccount {
  accountId: string;
  token: string;
  baseUrl: string;
  userId?: string;
}

interface WeixinMessageItem {
  type: number;
  text_item?: { text: string };
  image_item?: unknown;
  voice_item?: unknown;
  file_item?: unknown;
  video_item?: unknown;
}

interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  context_token?: string;
  item_list?: WeixinMessageItem[];
  create_time_ms?: number;
}

interface GetUpdatesResponse {
  ret?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
}

// ── Weixin Channel ──

export class WeixinChannel implements Channel {
  readonly name = "weixin";

  private account: WeixinAccount | null = null;
  private syncBuf = "";
  private running = false;
  private abortController: AbortController | null = null;
  private config: ChannelConfig;
  // Cache typing_ticket per user
  private typingTickets = new Map<string, string>();

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  // ── Auth ──

  async login(): Promise<void> {
    const baseUrl = (this.config.baseUrl as string) || DEFAULT_BASE_URL;
    log.info("获取二维码中...");

    const qrRes = await this.api(baseUrl, "ilink/bot/get_bot_qrcode?bot_type=3", null, {
      method: "GET",
      timeout: 10_000,
    });

    if (qrRes.ret !== 0) {
      throw new Error(`获取二维码失败: ${qrRes.errmsg || qrRes.ret}`);
    }

    const qrUrl: string = qrRes.qrcode_img_content || qrRes.data?.qrcode_img_content;
    const qrCode: string = qrRes.qrcode || qrRes.data?.qrcode;

    if (!qrUrl || !qrCode) {
      throw new Error(`二维码响应缺少字段: ${JSON.stringify(qrRes)}`);
    }

    log.info("请用微信扫描二维码:");
    console.log();
    try {
      const qrTerminal = await import("qrcode-terminal");
      (qrTerminal.default || qrTerminal).generate(qrUrl, { small: true });
    } catch {
      console.log(`  ${qrUrl}`);
    }
    console.log();

    log.info("等待扫码...");

    let attempts = 0;
    while (attempts < 60) {
      const statusRes = await this.api(
        baseUrl,
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrCode)}`,
        null,
        { method: "GET", timeout: 40_000 },
      );

      const status = statusRes.data?.status || statusRes.status;

      if (status === "confirmed") {
        const data = statusRes.data || statusRes;
        const accountId: string = data.ilink_bot_id || data.bot_id;
        const token: string = data.bot_token || data.token;

        if (!accountId || !token) {
          throw new Error("登录成功但缺少凭证");
        }

        this.account = {
          accountId,
          token,
          baseUrl: data.baseurl || baseUrl,
          userId: data.ilink_user_id,
        };

        await this.saveAccount();
        log.info(`登录成功！账号: ${accountId.slice(0, 8)}...`);
        return;
      }

      if (status === "scaned") {
        log.info("已扫码，等待确认...");
      }

      if (status === "expired") {
        log.warn("二维码已过期");
        throw new Error("二维码已过期");
      }

      attempts++;
      await sleep(500);
    }

    throw new Error("登录超时");
  }

  // ── Message loop ──

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    if (!this.account) {
      await this.loadAccount();
    }
    if (!this.account) {
      log.info("未找到账号，开始登录...");
      await this.login();
    }

    await this.loadSyncBuf();
    this.running = true;
    log.info(`消息监听已启动 (${this.account!.accountId.slice(0, 8)}...)`);

    while (this.running) {
      try {
        this.abortController = new AbortController();
        const res = await this.getUpdates();

        if (res.ret === -14) {
          log.warn("会话过期，重新登录...");
          this.account = null;
          await this.login();
          continue;
        }

        if (res.ret && res.ret !== 0) {
          log.warn(`拉取消息失败: ${res.errmsg || JSON.stringify(res)}`);
          await sleep(5000);
          continue;
        }

        if (res.get_updates_buf) {
          this.syncBuf = res.get_updates_buf;
          await this.saveSyncBuf();
        }

        if (res.msgs && res.msgs.length > 0) {
          for (const msg of res.msgs) {
            const text = this.extractText(msg);
            if (!text || !msg.from_user_id) continue;

            log.info(`收到消息 [${msg.from_user_id.slice(0, 8)}...]: ${text.slice(0, 50)}`);
            onMessage({
              id: String(msg.message_id || msg.seq || Date.now()),
              channel: "weixin",
              senderId: msg.from_user_id,
              text,
              replyToken: msg.context_token,
              timestamp: msg.create_time_ms || Date.now(),
            });
          }
        }
      } catch (err) {
        if (!this.running) break;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("aborted") || message.includes("AbortError")) continue;
        log.error(`轮询出错: ${message}`);
        await sleep(3000);
      }
    }
  }

  // ── Send typing indicator ──

  async sendTyping(userId: string, contextToken?: string): Promise<void> {
    if (!this.account) return;

    try {
      // Get typing_ticket if not cached
      let ticket = this.typingTickets.get(userId);
      if (!ticket) {
        const configRes = await this.api(this.account.baseUrl, "ilink/bot/getconfig", {
          ilink_user_id: userId,
          context_token: contextToken,
          base_info: { channel_version: CHANNEL_VERSION },
        }, { timeout: 10_000 });

        ticket = configRes.typing_ticket;
        if (ticket) {
          this.typingTickets.set(userId, ticket);
        }
      }

      if (!ticket) return;

      await this.api(this.account.baseUrl, "ilink/bot/sendtyping", {
        ilink_user_id: userId,
        typing_ticket: ticket,
        status: 1,
        base_info: { channel_version: CHANNEL_VERSION },
      }, { timeout: 10_000 });

      log.debug(`已发送输入状态给 ${userId.slice(0, 8)}...`);
    } catch {
      // typing 失败不影响主流程
    }
  }

  // ── Send message ──

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.account) throw new Error("未登录");

    const chunks = this.chunkText(msg.text, 4000);

    for (const chunk of chunks) {
      const body = {
        msg: {
          from_user_id: "",
          to_user_id: msg.targetId,
          client_id: generateClientId(),
          message_type: MessageType.BOT,
          message_state: MessageState.FINISH,
          context_token: msg.replyToken || undefined,
          item_list: [{ type: MessageItemType.TEXT, text_item: { text: chunk } }],
        },
        base_info: { channel_version: CHANNEL_VERSION },
      };

      const res = await this.api(
        this.account.baseUrl,
        "ilink/bot/sendmessage",
        body,
        { timeout: API_TIMEOUT_MS },
      );

      // sendMessage 成功返回 {} (空对象)，有错误时返回 ret + errmsg
      if (res.ret && res.ret !== 0) {
        log.error(`发送失败: ${res.errmsg || JSON.stringify(res)}`);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
    log.info("已停止");
  }

  // ── Internal ──

  private async getUpdates(): Promise<GetUpdatesResponse> {
    if (!this.account) throw new Error("未登录");

    return this.api(this.account.baseUrl, "ilink/bot/getupdates", {
      get_updates_buf: this.syncBuf,
      base_info: { channel_version: CHANNEL_VERSION },
    }, { timeout: 50_000 });
  }

  private extractText(msg: WeixinMessage): string | null {
    if (!msg.item_list?.length) return null;
    for (const item of msg.item_list) {
      if (item.type === 1 && item.text_item?.text) {
        return item.text_item.text;
      }
    }
    return null;
  }

  private chunkText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      let breakAt = remaining.lastIndexOf("\n", maxLen);
      if (breakAt <= 0) breakAt = maxLen;
      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt);
    }
    return chunks;
  }

  private async api(
    baseUrl: string,
    path: string,
    body: unknown,
    opts: { method?: string; timeout?: number } = {},
  ): Promise<any> {
    const url = `${baseUrl.replace(/\/$/, "")}/${path}`;
    const method = opts.method || "POST";
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.account?.token) {
      headers["AuthorizationType"] = "ilink_bot_token";
      headers["Authorization"] = `Bearer ${this.account.token}`;
      headers["X-WECHAT-UIN"] = randomUin();
      if (bodyStr) {
        headers["Content-Length"] = String(Buffer.byteLength(bodyStr, "utf-8"));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || API_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: controller.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Persistence ──

  private accountFile(): string {
    return join(getAccountsDir(), "weixin.json");
  }

  private syncFile(): string {
    return join(getAccountsDir(), "weixin-sync.json");
  }

  private async saveAccount(): Promise<void> {
    await ensureDir(getAccountsDir());
    await writeFile(this.accountFile(), JSON.stringify(this.account, null, 2));
  }

  private async loadAccount(): Promise<void> {
    const path = this.accountFile();
    if (!existsSync(path)) return;
    try {
      const raw = await readFile(path, "utf-8");
      this.account = JSON.parse(raw);
      log.info(`已加载账号: ${this.account!.accountId.slice(0, 8)}...`);
    } catch {
      log.warn("加载账号失败");
    }
  }

  private async saveSyncBuf(): Promise<void> {
    await ensureDir(getAccountsDir());
    await writeFile(this.syncFile(), JSON.stringify({ get_updates_buf: this.syncBuf }));
  }

  private async loadSyncBuf(): Promise<void> {
    const path = this.syncFile();
    if (!existsSync(path)) return;
    try {
      const raw = await readFile(path, "utf-8");
      const data = JSON.parse(raw);
      this.syncBuf = data.get_updates_buf || "";
    } catch {
      // fresh start
    }
  }
}

// ── Helpers ──

function randomUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function generateClientId(): string {
  return `wai-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
