import { z } from "zod";
import { Response, NextFunction } from "express";
import type { PlatformRequest } from "./auth.js";

// ============ Validation Schemas ============

// 注册验证
export const registerSchema = z.object({
  inviteCode: z.string()
    .min(8)
    .max(16)
    .regex(/^[A-Z0-9]+$/),
});

// API Key 设置验证
export const setApiKeySchema = z.object({
  apiKey: z.string()
    .min(1)
    .max(256),
  baseUrl: z.string().url().optional(),
});

// Provider 名称验证
export const setProviderSchema = z.object({
  provider: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
});

// 配置更新验证
export const updateConfigSchema = z.object({
  defaultProvider: z.string().max(64).optional(),
  systemPrompt: z.string().max(4096).optional(),
});

// ============ Validation middleware factories ============

// Body validation
export function validate(schema: z.ZodSchema) {
  return (req: PlatformRequest, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "输入验证失败",
        details: result.error.issues.map(i => ({
          field: i.path.join("."),
          message: i.message,
        }))
      });
      return;
    }
    // Replace body with validated data
    req.body = result.data;
    next();
  };
}

// Params validation
export function validateParams(schema: z.ZodSchema) {
  return (req: PlatformRequest, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: "参数验证失败",
        details: result.error.issues.map(i => ({
          field: i.path.join("."),
          message: i.message
        })
      });
      return;
    }
    // Replace params with validated data
    req.params = result.data as Record<string, string>;
    next();
  };
}
