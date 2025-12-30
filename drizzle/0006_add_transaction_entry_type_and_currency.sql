ALTER TABLE `transactions` ADD `entry_type` text DEFAULT 'Expense' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency_id` integer DEFAULT 1 NOT NULL REFERENCES currencies(id);