import { Response, NextFunction } from "express";
import type { PlatformRequest } from "./auth.js";
import { createLogger } from "../../logger.js";

const log = createLogger("audit");

export function auditLog(action: string, req: PlatformRequest, details?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    action,
    userId: req.userId || "anonymous",
    ip: req.ip || "unknown",
    ...details
  };
  log.info(JSON.stringify(entry));
}

export function auditMiddleware(actions: string | string[]) {
  const actionList = Array.isArray(actions) ? actions : [actions];

  return (req: PlatformRequest, _res: Response, next: NextFunction) => {
    const action = actionList[0] || "unknown"; // Use first action as primary
    auditLog(action, req, {
      method: (req.body?.method as string) || "GET",
      path: (req.body?.path as string) || "/"
    });
    next();
  };
}

// Specific audit loggers for sensitive operations
export function auditLogin(req: PlatformRequest, success: boolean, reason?: string): void {
  auditLog("LOGIN", req, { success, reason });
}

export function auditLogout(req: PlatformRequest): void {
  auditLog("LOGOUT", req, {});
}

export function auditConfigChange(req: PlatformRequest, change: string, details?: Record<string, unknown>): void {
  auditLog("CONFIG_CHANGE", req, { change, ...details });
}

export function auditProviderChange(req: PlatformRequest, provider: string, action: "set_key" | "set_default"): void {
  auditLog("PROVIDER_CHANGE", req, { provider, action });
}

export function auditRegister(req: PlatformRequest, success: boolean, reason?: string): void {
  auditLog("REGISTER", req, { success, reason });
}
