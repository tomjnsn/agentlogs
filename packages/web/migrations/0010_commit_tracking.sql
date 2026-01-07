CREATE TABLE `commit_tracking` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`repo_path` text NOT NULL,
	`timestamp` text NOT NULL,
	`created_at` integer NOT NULL
);
