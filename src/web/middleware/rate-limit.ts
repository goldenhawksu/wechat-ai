import rateLimit from "express-rate-limit";
import { createLogger } from "../../logger.js";

const log = createLogger("rate-limit");

// 通用 API 限流: 每分钟 60 次请求
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "请求过于频繁，请稍后再试",
      retryAfter: 60
    });
  },
});

// 注册限流: 每小时 10 次 (防止刷邀请码)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn(`Register rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "注册请求过于频繁,请稍后再试",
      retryAfter: 60 * 60
    });
  },
});

// 配置更新限流: 每分钟 30 次
export const configLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const session = (req as any).session as { userId?: string };
    log.warn(`Config rate limit exceeded for user: ${session?.userId || req.ip}`);
    res.status(429).json({
      error: "配置更新过于频繁,请稍后再试",
      retryAfter: 60
    });
  },
});
