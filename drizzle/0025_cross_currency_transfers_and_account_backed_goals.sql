CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`currency_id` integer NOT NULL,
	`rate_per_anchor` real NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_currency_id_unique` ON `exchange_rates` (`currency_id`);--> statement-breakpoint
ALTER TABLE `savings_contributions` ADD `transfer_id` integer REFERENCES transfers(id);--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_transfer_unique` ON `savings_contributions` (`transfer_id`);--> statement-breakpoint
ALTER TABLE `savings_goals` ADD `account_id` integer REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `transfers` ADD `to_currency_id` integer REFERENCES currencies(id);--> statement-breakpoint
ALTER TABLE `transfers` ADD `to_amount` real;--> statement-breakpoint
ALTER TABLE `transfers` ADD `description` text;--> statement-breakpoint
UPDATE `transfers` SET `to_currency_id` = `currency_id` WHERE `to_currency_id` IS NULL;--> statement-breakpoint
UPDATE `transfers` SET `to_amount` = `amount` WHERE `to_amount` IS NULL;
