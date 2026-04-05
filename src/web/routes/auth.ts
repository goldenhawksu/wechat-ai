import { Router, Response } from "express";
import { getSessionManager } from "../../platform/session-manager.js";
import { getInviteCode } from "../../storage/user-store.js";
import type { PlatformRequest } from "../middleware/auth.js";

const router = Router();

// Register with invite code
router.post("/register", async (req: PlatformRequest, res: Response) => {
  const inviteCode = req.body.inviteCode as string;

  if (!inviteCode) {
    res.status(400).json({ error: "请提供邀请码" });
    return;
  }

  // Check invite code validity
  const invite = getInviteCode(inviteCode);
  if (!invite || !invite.isActive) {
    res.status(400).json({ error: "无效的邀请码" });
    return;
  }

  if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
    res.status(400).json({ error: "邀请码已用完" });
    return;
  }

  const sessionManager = getSessionManager();
  const result = await sessionManager.registerUser(inviteCode);

  if (result.success) {
    // Set session
    req.session = { userId: result.userId };
    res.json({
      success: true,
      userId: result.userId,
      message: "注册成功，请扫码绑定微信"
    });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Login check
router.get("/me", async (req: PlatformRequest, res: Response) => {
  const userId = (req.headers["x-user-id"] || req.session?.userId) as string | undefined;

  if (!userId) {
    res.json({ loggedIn: false });
    return;
  }

  const sessionManager = getSessionManager();
  const status = sessionManager.getUserStatus(userId);
  res.json({
    loggedIn: status.exists && !status.isExpired,
    ...status,
  });
});

// Logout
router.post("/logout", (req: PlatformRequest, res: Response) => {
  req.session = undefined;
  res.json({ success: true });
});

export default router;
