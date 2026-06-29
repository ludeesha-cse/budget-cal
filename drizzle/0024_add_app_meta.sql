CREATE TABLE `app_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`default_currency_confirmed` integer DEFAULT false NOT NULL
);
