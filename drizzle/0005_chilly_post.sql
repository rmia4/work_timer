CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memos_owner_position` ON `memos` (`owner`,`position`);