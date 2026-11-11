CREATE TABLE `credential_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_sessions` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credential_event_user_created_idx` ON `credential_event` (`user_id`,`created_at`);