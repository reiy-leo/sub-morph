-- sub-morph 初始表结构。只增不改：改表结构请新增 0002_xxx.sql。

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  picture       TEXT,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE INDEX users_email ON users(email);

CREATE TABLE official_scripts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  pattern         TEXT NOT NULL,              -- JS 正则（不含 / /），匹配原订阅 URL
  source_type     TEXT NOT NULL,              -- url | inline
  script_url      TEXT NOT NULL DEFAULT '',
  script_content  TEXT NOT NULL DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1,
  priority        INTEGER NOT NULL DEFAULT 0, -- 大的优先匹配
  last_hash       TEXT,
  last_fetched_at INTEGER,
  last_changed_at INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  source_enc          TEXT NOT NULL,          -- AES-GCM 加密的原订阅 URL
  source_host         TEXT NOT NULL,          -- 脱敏主机名，仅用于展示
  format              TEXT NOT NULL DEFAULT 'auto', -- auto | clash | qx
  detected_format     TEXT,
  user_agent          TEXT NOT NULL DEFAULT '',
  script_mode         TEXT NOT NULL DEFAULT 'none', -- none | official | url | inline
  official_id         TEXT REFERENCES official_scripts(id) ON DELETE SET NULL,
  script_url          TEXT NOT NULL DEFAULT '',
  script_content      TEXT NOT NULL DEFAULT '',
  fallback            INTEGER NOT NULL DEFAULT 0,
  token_hash          TEXT NOT NULL UNIQUE,   -- SHA-256(输出密钥)，用于查找
  token_enc           TEXT NOT NULL,          -- 加密的输出密钥，用于给本人展示
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  last_at             INTEGER,
  last_served         TEXT,
  last_http           INTEGER,
  last_upstream       INTEGER,
  last_error          TEXT,
  last_proxies        INTEGER,
  last_script_hash    TEXT,
  script_changed_at   INTEGER
);
CREATE INDEX subscriptions_user ON subscriptions(user_id);

CREATE TABLE revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  sub_id     TEXT NOT NULL,
  revoked_at INTEGER NOT NULL
);

CREATE TABLE fetch_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id          TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  at              INTEGER NOT NULL,
  trigger         TEXT NOT NULL,              -- client | preview
  served          TEXT NOT NULL,              -- fresh | fallback | error
  http_status     INTEGER NOT NULL,           -- 返回给客户端的状态码
  upstream_status INTEGER,                    -- 原订阅的状态码
  script_hash     TEXT,
  script_changed  INTEGER NOT NULL DEFAULT 0,
  proxies         INTEGER,
  duration_ms     INTEGER NOT NULL,
  bytes           INTEGER,
  error           TEXT                        -- 不含完整 URL
);
CREATE INDEX fetch_logs_sub ON fetch_logs(sub_id, id);
CREATE INDEX fetch_logs_at ON fetch_logs(at);

CREATE TABLE script_cache (
  url_hash   TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  hash       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE usage (
  key   TEXT NOT NULL,
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
