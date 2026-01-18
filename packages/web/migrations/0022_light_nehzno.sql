PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_commit_tracking` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transcript_id` text NOT NULL,
	`repo_path` text NOT NULL,
	`timestamp` text NOT NULL,
	`commit_sha` text,
	`commit_title` text,
	`branch` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_commit_tracking`("id", "user_id", "transcript_id", "repo_path", "timestamp", "commit_sha", "commit_title", "branch", "created_at") SELECT "id", "user_id", "transcript_id", "repo_path", "timestamp", "commit_sha", "commit_title", "branch", "created_at" FROM `commit_tracking`;--> statement-breakpoint
DROP TABLE `commit_tracking`;--> statement-breakpoint
ALTER TABLE `__new_commit_tracking` RENAME TO `commit_tracking`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_commit_tracking_transcript` ON `commit_tracking` (`transcript_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_tracking_user` ON `commit_tracking` (`user_id`);