ALTER TABLE `user` ADD `username` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `user` SET `username` = `name` WHERE `username` = '';