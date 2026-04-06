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

  // Simple session (in production, use express-session with a store)
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
      log.warn(`CORS rejected origin: ${origin}`);
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

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/config", configRoutes);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // QR code endpoint - returns QR for linking
  app.get("/api/qr", (_req, res) => {
    res.json({
      message: "QR code is displayed in terminal when starting wechat-ai",
      instruction: "Run 'wechat-ai' to see the QR code"
    });
  });

  // Static files for web UI (if exists)
  const webUiPath = join(process.cwd(), "web-ui");
  if (existsSync(webUiPath)) {
    app.use(express.static(webUiPath));
    log.info(`Serving static files from ${webUiPath}`);
  }

  log.info(`Web server configured on port ${port}`);

  return app;
}

export function startWebServer(app: Express, port: number = 3000): void {
  app.listen(port, () => {
    log.info(`Web server started: http://localhost:${port}`);
  });
}
