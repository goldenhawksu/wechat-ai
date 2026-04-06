import { Router, Response } from "express";
import { getSessionManager } from "../../platform/session-manager.js";
import { getInviteCode, useInviteCode, getUserByInviteCode, extendUserSession, isUserExpired } from "../../storage/user-store.js";
import type { PlatformRequest } from "../middleware/auth.js";
import { validate, registerSchema } from "../middleware/validate.js";
import { signToken, verifyToken, extractBearerToken } from "../middleware/jwt.js";
import { auditRegister, auditLogin, auditLogout } from "../middleware/audit.js";

const router = Router();

// Register or re-login with invite code
router.post("/register", validate(registerSchema), (req: PlatformRequest, res: Response) => {
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

  // Check if this invite code already has a user (re-login)
  const existingUser = getUserByInviteCode(inviteCode);

  if (existingUser) {
    const expired = isUserExpired(existingUser.id);

    if (expired) {
      // Session expired: consume one use to extend
      if (!useInviteCode(inviteCode)) {
        res.status(400).json({ error: "邀请码使用失败" });
        return;
      }
      extendUserSession(existingUser.id);
    }
    // Not expired: just issue new JWT, no use consumed

    const token = signToken(existingUser.id);
    auditLogin(req, true);
    res.json({
      success: true,
      userId: existingUser.id,
      token,
      message: expired ? "登录成功，会话已续期" : "登录成功",
    });
    return;
  }

  // New registration — registerUser internally calls useInviteCode
  const sessionManager = getSessionManager();
  sessionManager.registerUser(inviteCode).then((result) => {
    if (result.success && result.userId) {
      const token = signToken(result.userId);
      auditRegister(req, true);
      res.json({
        success: true,
        userId: result.userId,
        token,
        message: "注册成功，请扫码绑定微信"
      });
    } else {
      auditRegister(req, false, result.error);
      res.status(400).json({ error: result.error });
    }
  }).catch((err) => {
    auditRegister(req, false, String(err));
    res.status(500).json({ error: "注册失败" });
  });
});

// Login check — reads JWT from Authorization header
router.get("/me", (req: PlatformRequest, res: Response) => {
  const token = extractBearerToken(req.headers["authorization"] as string | undefined);

  if (!token) {
    res.json({ loggedIn: false });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.json({ loggedIn: false });
    return;
  }

  const sessionManager = getSessionManager();
  const status = sessionManager.getUserStatus(payload.userId);
  const loggedIn = status.exists && !status.isExpired;
  auditLogin(req, loggedIn, loggedIn ? undefined : "token_invalid");
  res.json({
    loggedIn,
    userId: payload.userId,
    ...status,
  });
});

// Logout
router.post("/logout", (req: PlatformRequest, res: Response) => {
  auditLogout(req);
  res.json({ success: true });
});

export default router;
