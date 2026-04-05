import { Response, NextFunction } from "express";
import { getUser } from "../../storage/user-store.js";

// Extend Express Request type
export interface PlatformRequest {
  userId?: string;
  session?: { userId?: string };
  headers: { [key: string]: string | string[] | undefined };
  body: Record<string, unknown>;
  params: Record<string, string>;
}

export function authMiddleware(req: PlatformRequest, res: Response, next: NextFunction): void {
  const userId = req.headers["x-user-id"] as string || req.session?.userId;

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
  const userId = req.headers["x-user-id"] as string || req.session?.userId;
  if (userId) {
    req.userId = userId;
  }
  next();
}
