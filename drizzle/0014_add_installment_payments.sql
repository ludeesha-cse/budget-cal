CREATE TABLE `installment_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`installment_plan_id` integer NOT NULL,
	`installment_number` integer NOT NULL,
	`account_id` integer NOT NULL,
	`transaction_id` integer NOT NULL,
	`paid_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`installment_plan_id`) REFERENCES `installment_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_installment_unique` ON `installment_payments` (`installment_plan_id`,`installment_number`);