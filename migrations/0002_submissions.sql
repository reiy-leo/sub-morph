-- 用户把自己的覆写脚本提交为官方脚本候选，管理员审核后生成 official_scripts。
CREATE TABLE script_submissions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_id            TEXT,                         -- 来源订阅（订阅删了也保留投稿）
  sub_name          TEXT NOT NULL,
  source_host       TEXT NOT NULL,                -- 原订阅主机名（只存主机名，不存路径和 token）
  suggested_pattern TEXT NOT NULL,                -- 按主机名生成的建议正则
  source_type       TEXT NOT NULL,                -- url | inline
  script_url        TEXT NOT NULL DEFAULT '',
  script_content    TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',     -- 投稿说明（预留）
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  official_id       TEXT REFERENCES official_scripts(id) ON DELETE SET NULL,
  review_note       TEXT NOT NULL DEFAULT '',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  reviewed_at       INTEGER
);
CREATE INDEX script_submissions_status ON script_submissions(status, created_at);
CREATE INDEX script_submissions_sub ON script_submissions(sub_id, created_at);
