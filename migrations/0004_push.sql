-- 推送模式：原订阅只能从用户自己的网络（家庭 IP）拉到时，由用户设备定时把原订阅内容推上来（PUT /p/:token）。
-- 推送密钥只存 hash + 加密副本；推送内容加密存在 KV push:<sub_id>（30 天过期），关闭推送 / 归档 / 删除时清除。
ALTER TABLE subscriptions ADD COLUMN push_token_hash TEXT;
ALTER TABLE subscriptions ADD COLUMN push_token_enc TEXT;
ALTER TABLE subscriptions ADD COLUMN pushed_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN push_status INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_push_token ON subscriptions(push_token_hash);
