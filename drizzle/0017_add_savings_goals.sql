CREATE TABLE `savings_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`savings_goal_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`savings_goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`currency_id` integer NOT NULL,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
