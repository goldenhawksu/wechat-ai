import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getBotManager } from "../../platform/bot-manager.js";
import type { PlatformRequest } from "../middleware/auth.js";

const router = Router();

// All bot routes require JWT auth
router.use(authMiddleware);

// Start user's bot instance (generates QR code for WeChat login)
router.post("/start", async (req: PlatformRequest, res: Response) => {
  const userId = req.userId!;
  const botManager = getBotManager();

  try {
    const result = await botManager.startBot(userId);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Get user's bot status
router.get("/status", async (req: PlatformRequest, res: Response) => {
  const userId = req.userId!;
  const botManager = getBotManager();

  try {
    const status = botManager.getBotStatus(userId);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Stop user's bot instance
router.post("/stop", async (req: PlatformRequest, res: Response) => {
  const userId = req.userId!;
  const botManager = getBotManager();

  try {
    await botManager.stopBot(userId);
    res.json({ success: true, message: "Bot 已停止" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
