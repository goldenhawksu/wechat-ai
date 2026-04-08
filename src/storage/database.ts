import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";
import { createLogger } from "../logger.js";

const log = createLogger("database");

const DATA_DIR = join(homedir(), ".wai");
const DB_PATH = join(DATA_DIR, "platform.db");

// Embed schema directly to avoid file path issues after bundling
const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  wechat_id TEXT UNIQUE,
  name TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- User configurations table
CREATE TABLE IF NOT EXISTS user_configs (
  user_id TEXT PRIMARY KEY,
  default_provider TEXT NOT NULL,
  providers TEXT NOT NULL,
  skills TEXT,
  mcp_servers TEXT,
  system_prompt TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User sessions table (for state recovery)
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id TEXT PRIMARY KEY,
  conversation_context TEXT,
  last_context_token TEXT,
  last_active_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  max_uses INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  expires_at INTEGER
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_wechat_id ON users(wechat_id);
CREATE INDEX IF NOT EXISTS idx_users_expires_at ON users(expires_at);
CREATE INDEX IF NOT EXISTS idx_invite_codes_is_active ON invite_codes(is_active);
`;

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Run embedded schema
    db.exec(SCHEMA);

    // Migrations: add UNIQUE constraint on invite_code if missing
    try {
      const tableInfo = db.pragma("table_info(users)") as Array<{ name: string; pk: number; notnull: number; dflt_value: unknown; type: string }>;
      const inviteCol = tableInfo.find(c => c.name === "invite_code");
      if (inviteCol && !db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql LIKE '%invite_code%'").get()) {
        // Recreate table with UNIQUE constraint using safe migration
        db.exec(`
          CREATE TABLE IF NOT EXISTS users_new (
            id TEXT PRIMARY KEY,
            wechat_id TEXT UNIQUE,
            name TEXT,
            invite_code TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            last_active_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            is_active INTEGER DEFAULT 1
          );
          INSERT OR IGNORE INTO users_new SELECT * FROM users;
          DROP TABLE IF EXISTS users;
          ALTER TABLE users_new RENAME TO users;
        `);
        log.info("Migrated users table: added UNIQUE constraint on invite_code");
      }
    } catch (err) {
      log.warn(`Migration check for invite_code UNIQUE: ${err}`);
    }

    log.info(`Database initialized at ${DB_PATH}`);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info("Database closed");
  }
}
