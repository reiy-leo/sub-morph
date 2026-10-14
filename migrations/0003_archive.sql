-- 订阅归档：归档后只读（不能编辑、试运行、刷新地址、删除），输出地址停止服务（410），只在管理后台「归档」里显示。
ALTER TABLE subscriptions ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_subs_archived ON subscriptions(archived_at);
