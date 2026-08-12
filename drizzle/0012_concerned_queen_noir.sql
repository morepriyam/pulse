ALTER TABLE `draft_transcripts` DROP COLUMN `language`;--> statement-breakpoint
ALTER TABLE `draft_transcripts` DROP COLUMN `text`;--> statement-breakpoint
ALTER TABLE `draft_transcripts` DROP COLUMN `edited_at`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `mode`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `thumbnail`;--> statement-breakpoint
ALTER TABLE `segments` DROP COLUMN `trim_start_ms`;--> statement-breakpoint
ALTER TABLE `segments` DROP COLUMN `trim_end_ms`;--> statement-breakpoint
ALTER TABLE `projects` RENAME TO `drafts`;--> statement-breakpoint
ALTER TABLE `segments` RENAME COLUMN `project_id` TO `draft_id`;--> statement-breakpoint
ALTER TABLE `draft_transcripts` RENAME COLUMN `project_id` TO `draft_id`;--> statement-breakpoint
ALTER TABLE `upload_artifacts` RENAME COLUMN `project_id` TO `draft_id`;--> statement-breakpoint
DROP INDEX `segments_project_order_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `segments_draft_order_unique` ON `segments` (`draft_id`,`sort_order`);