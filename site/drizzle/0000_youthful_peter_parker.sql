CREATE TABLE `service` (
	`id` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`csrf` text NOT NULL,
	`view` text NOT NULL,
	`touched` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`command` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`lease` integer NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `work_owner` ON `work` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `work_status` ON `work` (`status`,`created`);