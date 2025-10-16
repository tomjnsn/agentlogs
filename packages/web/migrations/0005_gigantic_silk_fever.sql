PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`last_activity` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_repos`("id", "repo", "last_activity", "created_at") SELECT "id", "repo", "last_activity", "created_at" FROM `repos`;--> statement-breakpoint
DROP TABLE `repos`;--> statement-breakpoint
ALTER TABLE `__new_repos` RENAME TO `repos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX `idx_user_session`;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `sha256` text NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `transcript_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `source` text NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `preview` text;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `model` text;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `cost_usd` real NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `blended_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `message_count` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `input_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `cached_input_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `output_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `reasoning_output_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `total_tokens` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `git_repo` text;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `relative_cwd` text;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `branch` text;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `raw_transcript` text NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `updated_at` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repo_transcript` ON `transcripts` (`repo_id`,`transcript_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `transcripts` (`user_id`);--> statement-breakpoint
ALTER TABLE `transcripts` DROP COLUMN `session_id`;--> statement-breakpoint
ALTER TABLE `transcripts` DROP COLUMN `events`;