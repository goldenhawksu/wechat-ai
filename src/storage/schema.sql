-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  wechat_id TEXT UNIQUE,
  name TEXT,
  invite_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- User configurations table
CREATE TABLE IF NOT EXISTS user_configs (
  user_id TEXT PRIMARY KEY,
  default_provider TEXT NOT NULL,
  providers TEXT NOT NULL,  -- JSON
  skills TEXT,              -- JSON
  mcp_servers TEXT,         -- JSON
  system_prompt TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User sessions table (for state recovery)
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id TEXT PRIMARY KEY,
  conversation_context TEXT,  -- JSON
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
