CREATE TABLE `conversation_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`channel` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'browser' NOT NULL,
	`is_final` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `visitor_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_event_unique` ON `conversation_messages` (`session_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_session` ON `conversation_messages` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `visitor_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`visitor_label` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`ended_at` text,
	`channel` text DEFAULT 'text' NOT NULL,
	`page_path` text DEFAULT '/' NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visitor_sessions_updated` ON `visitor_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `visitor_sessions_visitor` ON `visitor_sessions` (`visitor_hash`,`started_at`);