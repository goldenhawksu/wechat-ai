import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createLogger } from "../../logger.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const log = createLogger("jwt");

const DATA_DIR = join(homedir(), ".wai");
const SECRET_FILE = join(DATA_DIR, ".jwt_secret");
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadOrCreateSecret(): string {
  // 1. Environment variable takes precedence
  const envSecret = process.env.WAI_JWT_SECRET;
  if (envSecret) {
    log.info("JWT secret loaded from WAI_JWT_SECRET environment variable");
    return envSecret;
  }

  // 2. Try loading persisted secret
  try {
    if (existsSync(SECRET_FILE)) {
      const secret = readFileSync(SECRET_FILE, "utf-8").trim();
      if (secret.length >= 32) {
        log.info("JWT secret loaded from persisted file");
        return secret;
      }
    }
  } catch {
    log.warn("Failed to read persisted JWT secret, generating new one");
  }

  // 3. Generate and persist a new secret
  const secret = randomBytes(32).toString("hex");
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    log.info("New JWT secret generated and persisted to ~/.wai/.jwt_secret");
  } catch (err) {
    log.warn(`Failed to persist JWT secret: ${err}. Secret will be lost on restart!`);
  }

  return secret;
}

const JWT_SECRET = loadOrCreateSecret();

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
