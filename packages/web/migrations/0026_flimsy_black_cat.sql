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
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_commit_tracking`("id", "user_id", "transcript_id", "repo_path", "timestamp", "commit_sha", "commit_title", "branch", "created_at") SELECT "id", "user_id", "transcript_id", "repo_path", "timestamp", "commit_sha", "commit_title", "branch", "created_at" FROM `commit_tracking`;--> statement-breakpoint
DROP TABLE `commit_tracking`;--> statement-breakpoint
ALTER TABLE `__new_commit_tracking` RENAME TO `commit_tracking`;--> statement-breakpoint
CREATE INDEX `idx_commit_tracking_transcript` ON `commit_tracking` (`transcript_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_tracking_user` ON `commit_tracking` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'waitlist' NOT NULL,
	`welcome_email_sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "username", "email", "email_verified", "image", "role", "welcome_email_sent_at", "created_at", "updated_at") SELECT "id", "name", "username", "email", "email_verified", "image", "role", "welcome_email_sent_at", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=ON;