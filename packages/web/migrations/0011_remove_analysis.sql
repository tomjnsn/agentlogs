-- Drop the analysis table
DROP TABLE IF EXISTS `analysis`;
--> statement-breakpoint
-- Remove the analyzed column from transcripts
ALTER TABLE `transcripts` DROP COLUMN `analyzed`;
