CREATE TABLE `loan_originations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`loan_account_id` integer NOT NULL,
	`counterpart_account_id` integer,
	`amount` real NOT NULL,
	`currency_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`loan_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterpart_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `loan_details` ADD `counterpart_account_id` integer REFERENCES accounts(id);
--> statement-breakpoint
-- Backfill: every loan that is open right now gets the "Borrowed"/"Lent"
-- History row it never had. Its amount is the account's CURRENT stored
-- principal rather than the amount originally handed over — nothing in
-- the schema recorded the latter, and for a loan that has never been
-- partially settled the two are the same number anyway. Closed loans are
-- skipped: their balance has been zeroed, so there is no figure left to
-- reconstruct and a 0.00 row in History would be worse than no row.
-- counterpart_account_id stays NULL for exactly the same reason — which
-- real account the money crossed was never stored, and inventing one
-- would put a wrong account name on screen.
INSERT INTO `loan_originations` (`loan_account_id`, `counterpart_account_id`, `amount`, `currency_id`, `date`, `created_at`)
SELECT `ld`.`account_id`, NULL, `ab`.`balance`, `ab`.`currency_id`, `ld`.`date_created`, `a`.`created_at`
FROM `loan_details` `ld`
JOIN `accounts` `a` ON `a`.`id` = `ld`.`account_id`
JOIN `account_balances` `ab` ON `ab`.`account_id` = `ld`.`account_id`
WHERE `a`.`active` = 1 AND `ab`.`balance` > 0;
