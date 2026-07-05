DROP TABLE `transcripts`;--> statement-breakpoint
CREATE TABLE `draft_transcripts` (
	`project_id` text PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`model` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`language` text,
	`text` text,
	`lines` text,
	`edited_lines` text,
	`edited_at` integer,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
UPDATE `projects` SET `upload_unit` = 'segment' WHERE `upload_unit` = 'beat';--> statement-breakpoint
UPDATE `upload_destinations` SET `upload_unit` = 'segment' WHERE `upload_unit` = 'beat';
