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
m0010
    }
  }
  