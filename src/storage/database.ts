import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createLogger } from "../logger.js";

const log = createLogger("database");

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(homedir(), ".wai");
const DB_PATH = join(DATA_DIR, "platform.db");

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Run schema
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);

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
