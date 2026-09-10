CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`elapsed` integer DEFAULT 0 NOT NULL,
	`started` integer,
	`status` text DEFAULT 'done' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_day` ON `tasks` (`owner`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_one_active` ON `tasks` (`owner`) WHERE "tasks"."status" != 'done';