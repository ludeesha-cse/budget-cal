CREATE TABLE `installment_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`installment_plan_id` integer NOT NULL,
	`installment_number` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`installment_payment_id` integer,
	`resolved_at` text,
	FOREIGN KEY (`installment_plan_id`) REFERENCES `installment_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_payment_id`) REFERENCES `installment_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_occurrence_unique` ON `installment_occurrences` (`installment_plan_id`,`installment_number`);