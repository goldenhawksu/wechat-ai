import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getSessionManager } from "../../platform/session-manager.js";
import type { PlatformRequest } from "../middleware/auth.js";
import { validate, validateParams } from "../middleware/validate.js";
import { setProviderSchema, setApiKeySchema } from "../middleware/validate.js";

const router = Router();
const sessionManager = getSessionManager();

// All config routes require auth
router.use(authMiddleware);

// Get user config
router.get("/", (req: PlatformRequest, res: Response) => {
  const config = sessionManager.getUserConfig(req.userId!);
  res.json(config || {});
});

// Update user config
router.put("/", (req: PlatformRequest, res: Response) => {
  const updates = req.body as Partial<import("../../types.js").UserConfig>;

  const success = sessionManager.updateUserConfig(req.userId!, updates);

  if (success) {
    res.json({ success: true, message: "配置已更新" });
  } else {
    res.status(400).json({ error: "更新失败" });
  }
});

// Set API key for provider - with validation
router.post(
  "/provider/:provider/key",
  validateParams(setProviderSchema),
  validate(setApiKeySchema),
  (req: PlatformRequest, res: Response) => {
    const provider = req.params.provider;
    const { apiKey, baseUrl } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: "请提供 API Key" });
      return;
    }

    const config = sessionManager.getUserConfig(req.userId!)
    if (!config) {
      res.status(404).json({ error: "用户配置不存在" });
      return
    }

    config.providers = config.providers || {}
    config.providers[provider] = {
      type: "openai-compatible",
      apiKey,
      baseUrl: baseUrl || undefined,
    };

    if (!config.defaultProvider) {
      config.defaultProvider = provider;
    }

    sessionManager.updateUserConfig(req.userId!, config)
    res.json({ success: true })
  }
);

// Set default provider
router.post("/default-provider", (req: PlatformRequest, res: Response) => {
  const body = req.body as { provider?: string }
    const { provider } = body

    if (!provider) {
      res.status(400).json({ error: "请提供模型名称" });
    return
  }

    sessionManager.updateUserConfig(req.userId!, { defaultProvider: provider })
    res.json({ success: true })
  }
);

export default router;
