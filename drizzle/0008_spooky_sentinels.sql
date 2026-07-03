CREATE TABLE `upload_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`server` text NOT NULL,
	`artifact_id` text NOT NULL,
	`upload_unit` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
