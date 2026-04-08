import express, { Express } from "express";
import { createLogger } from "../logger.js";
import authRoutes from "./routes/auth.js";
import configRoutes from "./routes/config.js";
import botRoutes from "./routes/bot.js";
import adminRoutes from "./routes/admin.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const log = createLogger("web-server");

// 从环境变量获取允许的源，默认只允许同源
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : [];

export function createWebServer(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }
    // No origin header (same-origin / curl) or non-allowed origin: no CORS headers needed
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  // Handle preflight
  app.options("/{*path}", (_req, res) => {
    res.status(204).end();
  });

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/bot", botRoutes);
  app.use("/api/admin", adminRoutes);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Static files for web UI (if exists)
  const webUiPath = join(process.cwd(), "web-ui");
  if (existsSync(webUiPath)) {
    app.use(express.static(webUiPath));
    log.info(`Serving static files from ${webUiPath}`);
  }

  return app;
}

export function startWebServer(app: Express, port: number = 3000): void {
  app.listen(port, () => {
    log.info(`Web server started: http://localhost:${port}`);
  });
}
