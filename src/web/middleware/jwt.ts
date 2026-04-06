import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createLogger } from "../../logger.js";

const log = createLogger("jwt");

const JWT_SECRET = process.env.WAI_JWT_SECRET || randomBytes(32).toString("hex");
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export function signToken(userId: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    userId,
    iat: Date.now(),
    exp: Date.now() + JWT_EXPIRY_MS,
  }));
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  // Verify signature with timing-safe comparison
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(signature!);
    const expBuf = Buffer.from(expected!);
    if (!timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload!, "base64url").toString());
    if (data.exp && Date.now() > data.exp) {
      log.debug("Token expired");
      return null;
    }
    if (!data.userId) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1] || null;
}
