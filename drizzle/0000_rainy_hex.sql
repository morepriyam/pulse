CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`mode` text DEFAULT 'camera' NOT NULL,
	`thumbnail` text,
	`upload_server` text,
	`upload_token` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_modified` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`original_filename` text NOT NULL,
	`trim_start_ms` integer,
	`trim_end_ms` integer,
	`duration_ms` integer NOT NULL,
	`thumbnail` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
