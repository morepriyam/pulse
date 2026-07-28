ALTER TABLE `projects` ADD `last_clip_number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `segments` ADD `label` text;--> statement-breakpoint
CREATE TEMP TABLE `segment_ranked` AS
SELECT
	`s1`.`id`,
	(
		SELECT COUNT(*)
		FROM `segments` AS `s2`
		WHERE `s2`.`project_id` = `s1`.`project_id`
			AND (
				`s2`.`sort_order` < `s1`.`sort_order`
				OR (`s2`.`sort_order` = `s1`.`sort_order` AND `s2`.`id` <= `s1`.`id`)
			)
	) - 1 AS `rn`
FROM `segments` AS `s1`;--> statement-breakpoint
UPDATE `segments` SET `sort_order` = (
	SELECT `rn` FROM `segment_ranked` WHERE `segment_ranked`.`id` = `segments`.`id`
);--> statement-breakpoint
DROP TABLE `segment_ranked`;--> statement-breakpoint
UPDATE `segments` SET `label` = CAST(`sort_order` + 1 AS TEXT) WHERE `label` IS NULL;--> statement-breakpoint
UPDATE `projects` SET `last_clip_number` = COALESCE((
	SELECT MAX(`sort_order`) + 1 FROM `segments` WHERE `segments`.`project_id` = `projects`.`id`
), 0);--> statement-breakpoint
CREATE UNIQUE INDEX `segments_project_order_unique` ON `segments` (`project_id`,`sort_order`);
