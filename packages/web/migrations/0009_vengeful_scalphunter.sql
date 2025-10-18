PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text,
	`user_id` text NOT NULL,
	`analyzed` integer DEFAULT false NOT NULL,
	`sha256` text NOT NULL,
	`transcript_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`preview` text,
	`model` text,
	`cost_usd` real NOT NULL,
	`blended_tokens` integer NOT NULL,
	`message_count` integer NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`reasoning_output_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`relative_cwd` text,
	`branch` text,
	`cwd` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_transcripts`("id", "repo_id", "user_id", "analyzed", "sha256", "transcript_id", "source", "created_at", "preview", "model", "cost_usd", "blended_tokens", "message_count", "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens", "relative_cwd", "branch", "cwd", "updated_at") SELECT "id", "repo_id", "user_id", "analyzed", "sha256", "transcript_id", "source", "created_at", "preview", "model", "cost_usd", "blended_tokens", "message_count", "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens", "relative_cwd", "branch", "cwd", "updated_at" FROM `transcripts`;--> statement-breakpoint
DROP TABLE `transcripts`;--> statement-breakpoint
ALTER TABLE `__new_transcripts` RENAME TO `transcripts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repo_transcript` ON `transcripts` (`repo_id`,`transcript_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_transcript` ON `transcripts` (`user_id`,`transcript_id`);--> statement-breakpoint
CREATE INDEX `idx_repo_id` ON `transcripts` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `transcripts` (`user_id`);