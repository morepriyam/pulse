CREATE TABLE `upload_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`local_key` text NOT NULL,
	`artifact_id` text NOT NULL,
	`resource_url` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
