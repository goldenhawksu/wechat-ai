import { Router, Response } from "express";
import { adminAuthMiddleware } from "../middleware/auth.js";
import {
  createInviteCode,
  listInviteCodes,
  revokeInviteCode,
  listUsers,
  getUser,
} from "../../storage/user-store.js";
import type { PlatformRequest } from "../middleware/auth.js";

const router = Router();

// All admin routes require admin secret
router.use(adminAuthMiddleware);

// ── Invite Codes ──

// List all invite codes
router.get("/invites", (_req: PlatformRequest, res: Response) => {
  const codes = listInviteCodes(false); // include inactive
  res.json(codes);
});

// Create invite code
router.post("/invite", (req: PlatformRequest, res: Response) => {
  const { maxUses } = (req.body || {}) as { maxUses?: number };
  const code = createInviteCode("admin", maxUses ?? 0);
  res.json({ success: true, code: code.code });
});

// Revoke invite code
router.delete("/invite/:code", (req: PlatformRequest, res: Response) => {
  const { code } = req.params;
  if (!code) {
    res.status(400).json({ error: "请提供邀请码" });
    return;
  }
  const ok = revokeInviteCode(code);
  if (ok) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "邀请码不存在或已撤销" });
  }
});

// ── Users ──

// List all users
router.get("/users", (_req: PlatformRequest, res: Response) => {
  const users = listUsers();
  // Mask sensitive data
  const masked = users.map((u) => ({
    id: u.id,
    wechatId: u.wechatId || "-",
    name: u.name || "-",
    inviteCode: u.inviteCode,
    createdAt: u.createdAt,
    lastActiveAt: u.lastActiveAt,
    expiresAt: u.expiresAt,
    isActive: u.isActive,
  }));
  res.json(masked);
});

// Get single user
router.get("/user/:id", (req: PlatformRequest, res: Response) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "请提供用户 ID" });
    return;
  }
  const user = getUser(id);
  if (!user) {
    res.status(404).json({ error: "用户不存在" });
    return;
  }
  res.json({
    id: user.id,
    wechatId: user.wechatId || "-",
    name: user.name || "-",
    inviteCode: user.inviteCode,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    expiresAt: user.expiresAt,
    isActive: user.isActive,
  });
});

export default router;
