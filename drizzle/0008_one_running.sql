DROP INDEX `tasks_one_active`;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_one_running` ON `tasks` (`owner`) WHERE "tasks"."status" = 'running';
