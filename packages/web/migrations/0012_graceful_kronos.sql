ALTER TABLE `transcripts` ADD `tool_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `user_message_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `files_changed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `lines_added` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transcripts` ADD `lines_removed` integer DEFAULT 0 NOT NULL;