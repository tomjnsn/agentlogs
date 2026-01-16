DROP INDEX `idx_user_created_at`;--> statement-breakpoint
CREATE INDEX `idx_user_created_at` ON `transcripts` (`user_id`,`created_at`,`id`);