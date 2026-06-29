// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_bored_bruce_banner.sql';
import m0001 from './0001_violet_patriot.sql';
import m0002 from './0002_add_categories.sql';
import m0003 from './0003_add_category_budgets.sql';
import m0004 from './0004_add_currencies_and_account_balances.sql';
import m0005 from './0005_add_accounts_active.sql';
import m0006 from './0006_add_transaction_entry_type_and_currency.sql';
import m0007 from './0007_add_loan_details_and_loan_payments.sql';
import m0008 from './0008_make_transaction_category_nullable.sql';
import m0009 from './0009_add_category_system_reserved.sql';
import m0010 from './0010_add_app_settings.sql';
import m0011 from './0011_add_credit_card_payoffs.sql';
import m0012 from './0012_add_transfers.sql';
import m0013 from './0013_add_installment_plans.sql';
import m0014 from './0014_add_installment_payments.sql';
import m0015 from './0015_add_recurring_rules.sql';
import m0016 from './0016_add_recurring_occurrences.sql';
import m0017 from './0017_add_savings_goals.sql';
import m0018 from './0018_add_tags.sql';
import m0019 from './0019_add_exclude_from_budget.sql';
import m0020 from './0020_add_palette_id.sql';
import m0021 from './0021_add_installment_due_day.sql';
import m0022 from './0022_fast_blue_shield.sql';
import m0023 from './0023_lyrical_winter_soldier.sql';
import m0024 from './0024_add_app_meta.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017,
m0018,
m0019,
m0020,
m0021,
m0022,
m0023,
m0024
    }
  }
  