CREATE TABLE `transcripts` (
	`segment_id` text PRIMARY KEY NOT NULL,
	`source_file` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`language` text,
	`text` text,
	`lines` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade
);
