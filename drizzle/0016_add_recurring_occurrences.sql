CREATE TABLE `recurring_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recurring_rule_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` integer,
	`confirmed_amount` integer,
	`resolved_at` text,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_due_date_unique` ON `recurring_occurrences` (`recurring_rule_id`,`due_date`);