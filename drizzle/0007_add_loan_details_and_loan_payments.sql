CREATE TABLE `loan_details` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`counterparty_name` text NOT NULL,
	`date_created` text NOT NULL,
	`last_accrual_anchor_date` text NOT NULL,
	`due_date` text,
	`interest_rate` integer,
	`interest_period` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_details_account_id_unique` ON `loan_details` (`account_id`);--> statement-breakpoint
CREATE TABLE `loan_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`loan_account_id` integer NOT NULL,
	`counterpart_account_id` integer NOT NULL,
	`amount` real NOT NULL,
	`currency_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`loan_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterpart_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
