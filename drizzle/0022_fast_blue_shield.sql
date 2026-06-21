DROP INDEX `month_category_unique`;--> statement-breakpoint
ALTER TABLE `category_budgets` ADD `currency_id` integer DEFAULT 1 NOT NULL REFERENCES currencies(id);--> statement-breakpoint
CREATE UNIQUE INDEX `month_category_currency_unique` ON `category_budgets` (`month`,`category_id`,`currency_id`);--> statement-breakpoint
ALTER TABLE `budgets` ADD `currency_id` integer DEFAULT 1 NOT NULL REFERENCES currencies(id);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_month_currency_unique` ON `budgets` (`month`,`currency_id`);