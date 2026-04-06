import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getSessionManager } from "../../platform/session-manager.js";
import type { PlatformRequest } from "../middleware/auth.js";
import { createLogger } from "../../logger.js";

const log = createLogger("config-routes");

const router = Router();
const sessionManager = getSessionManager();

// All config routes require auth
router.use(authMiddleware);

/**
 * Mask API key for display format: sk-xxx...xxx
 */
function maskApiKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "****...***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Get user config
router.get("/", (req: PlatformRequest, res: Response) => {
  const config = sessionManager.getUserConfig(req.userId!);
  if (!config) {
    res.json({});
    return;
  }

  // Mask sensitive data in response
  const response = {
    ...config,
    providers: config.providers ? {} : {},
    systemPrompt: config.systemPrompt,
  };

  if (config.providers) {
    response.providers = Object.fromEntries(
      Object.entries(config.providers).map(([name, prov]) => [
        name,
        {
          apiKey: maskApiKey(prov.apiKey),
          baseUrl: prov.baseUrl
        }
      ])
    );
  }

  res.json(response);
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

// Set API key for provider
router.post("/provider/:provider/key", (req: PlatformRequest, res: Response) => {
  const provider = req.params.provider;
  const { apiKey, baseUrl } = req.body as { apiKey?: string; baseUrl?: string };

  if (!apiKey) {
    res.status(400).json({ error: "请提供 API Key" });
    return;
  }

  if (!provider) {
    res.status(400).json({ error: "无效的 provider 参数" });
    return;
  }

  const config = sessionManager.getUserConfig(req.userId!);
  if (!config) {
    res.status(404).json({ error: "用户配置不存在" });
    return;
  }

  config.providers = config.providers || {};
  config.providers[provider] = {
    type: "openai-compatible",
    apiKey,
    baseUrl
  };

  if (!config.defaultProvider) {
    config.defaultProvider = provider;
  }

  log.info(`Provider ${provider} configured for user ${req.userId}`);
  sessionManager.updateUserConfig(req.userId!, config);
  res.json({ success: true });
});

// Set default provider
router.post("/default-provider", (req: PlatformRequest, res: Response) => {
  const body = req.body as { provider?: string };
  const { provider } = body;

  if (!provider) {
    res.status(400).json({ error: "请提供模型名称" });
    return;
  }

  sessionManager.updateUserConfig(req.userId!, { defaultProvider: provider });
  res.json({ success: true });
});

export default router;
