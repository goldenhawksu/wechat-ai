import { Router, Response } from "express";
import { getSessionManager } from "../../platform/session-manager.js";
import { getInviteCode } from "../../storage/user-store.js";
import type { PlatformRequest } from "../middleware/auth.js";
import { validate, registerSchema } from "../middleware/validate.js";
import { auditRegister, auditLogin, auditLogout } from "../middleware/audit.js";

const router = Router();

// Register with invite code - with validation
router.post("/register", validate(registerSchema), async (req: PlatformRequest, res: Response) => {
  const inviteCode = req.body.inviteCode as string;

  if (!inviteCode) {
    auditRegister(req, false, "missing_invite_code");
    res.status(400).json({ error: "请提供邀请码" });
    return;
  }

  // Check invite code validity
  const invite = getInviteCode(inviteCode);
  if (!invite || !invite.isActive) {
    auditRegister(req, false, "invalid_invite_code");
    res.status(400).json({ error: "无效的邀请码" });
    return;
  }

  if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
    auditRegister(req, false, "invite_code_exhausted");
    res.status(400).json({ error: "邀请码已用完" });
    return;
  }

  const sessionManager = getSessionManager();
  const result = await sessionManager.registerUser(inviteCode);

  if (result.success) {
    // Set session
    req.session = { userId: result.userId };
    auditRegister(req, true);
    res.json({
      success: true,
      userId: result.userId,
      message: "注册成功，请扫码绑定微信"
    });
  } else {
    auditRegister(req, false, result.error);
    res.status(400).json({ error: result.error });
  }
});

// Login check
router.get("/me", async (req: PlatformRequest, res: Response) => {
  const userId = req.session?.userId;  // 仅从 session 获取

  if (!userId) {
    res.json({ loggedIn: false });
    return;
  }

  const sessionManager = getSessionManager();
  const status = sessionManager.getUserStatus(userId);
  const loggedIn = status.exists && !status.isExpired;
  auditLogin(req, loggedIn, loggedIn ? undefined : "session_invalid");
  res.json({
    loggedIn,
    ...status,
  });
});

// Logout
router.post("/logout", (req: PlatformRequest, res: Response) => {
  auditLogout(req);
  req.session = undefined;
  res.json({ success: true });
});

export default router;
