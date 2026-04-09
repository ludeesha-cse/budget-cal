CREATE TABLE `installment_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`principal_amount` integer,
	`interest_rate` integer,
	`number_of_months` integer NOT NULL,
	`monthly_amount` integer NOT NULL,
	`final_installment_amount` integer NOT NULL,
	`total_repayable` integer NOT NULL,
	`category_id` integer NOT NULL,
	`currency_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
