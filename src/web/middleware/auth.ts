import { Response, NextFunction } from "express";
import { getUser } from "../../storage/user-store.js";
import { verifyToken, extractBearerToken } from "./jwt.js";

// Extend Express Request type
export interface PlatformRequest {
  userId?: string;
  headers: { [key: string]: string | string[] | undefined };
  body: Record<string, unknown>;
  params: Record<string, string>;
  ip?: string;
}

export function authMiddleware(req: PlatformRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers["authorization"] as string | undefined);

  if (!token) {
    res.status(401).json({ error: "未登录" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "登录已过期，请重新登录" });
    return;
  }

  const user = getUser(payload.userId);
  if (!user) {
    res.status(401).json({ error: "用户不存在" });
    return;
  }

  req.userId = payload.userId;
  next();
}

export function adminAuthMiddleware(req: PlatformRequest, res: Response, next: NextFunction): void {
  const adminSecret = process.env.WAI_ADMIN_SECRET;
  if (!adminSecret) {
    res.status(403).json({ error: "管理功能未启用" });
    return;
  }
  const authHeader = req.headers["authorization"] as string | undefined;
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== adminSecret) {
    res.status(401).json({ error: "管理员认证失败" });
    return;
  }
  next();
}

export function optionalAuth(req: PlatformRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers["authorization"] as string | undefined);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.userId;
    }
  }
  next();
}
