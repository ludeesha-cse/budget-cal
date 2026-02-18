CREATE TABLE `credit_card_payoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`credit_card_account_id` integer NOT NULL,
	`paying_account_id` integer NOT NULL,
	`amount` real NOT NULL,
	`currency_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`credit_card_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paying_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
