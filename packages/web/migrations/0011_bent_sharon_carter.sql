CREATE TABLE `blobs` (
	`sha256` text PRIMARY KEY NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcript_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`transcript_id` text NOT NULL,
	`sha256` text NOT NULL,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sha256`) REFERENCES `blobs`(`sha256`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcript_blob_unique` ON `transcript_blobs` (`transcript_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `idx_transcript_blobs_sha256` ON `transcript_blobs` (`sha256`);--> statement-breakpoint
DROP TABLE `analysis`;--> statement-breakpoint
ALTER TABLE `transcripts` DROP COLUMN `analyzed`;
