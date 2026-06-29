import type { ImageSourcePropType } from 'react-native';

// The single source of truth for "what this app does", shared by the
// first-launch carousel (screens/OnboardingScreen.tsx) and the Help &
// Support page (screens/HelpSupportScreen.tsx) so the two can never drift
// apart. Both screens render the SAME groupings in the SAME order —
// onboarding shows `summary` (2-3 sentences, meant to be skimmed once at
// 3am on a new phone), Help shows `detail` (written for someone who came
// looking for a specific answer and will actually read it).
//
// Adding a topic here adds it to both screens at once. That is the whole
// point of this file existing rather than each screen carrying its own
// copy: the complaint this design is guarding against is a Help page that
// still describes a feature the onboarding stopped mentioning three
// releases ago.

export type HelpTopic = {
  key: string;
  // Short enough to sit on one line as a carousel heading on a small
  // phone — Help re-uses it verbatim as its section heading.
  heading: string;
  // Onboarding copy. Two to three sentences, no more: a carousel slide
  // that needs scrolling has already failed at its job.
  summary: string;
  // Help & Support copy. Each entry renders as its own paragraph, so
  // these can be as long as they need to be — this is reference material,
  // not a slide.
  detail: string[];
  // Per-slide artwork for the carousel. Screenshots are being supplied
  // separately, so every entry is null for now and OnboardingScreen
  // renders a clearly-marked placeholder frame in its place (see that
  // file's SlideImage). When the assets land, this becomes e.g.
  //   image: require('../assets/onboarding/budgets.png'),
  // and nothing else has to change.
  // TODO: replace each null with a require() once the onboarding
  // screenshots are supplied.
  image: ImageSourcePropType | null;
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    key: 'welcome',
    heading: 'Welcome',
    summary:
      'This is your budget tracker — every rupee, dollar and pound you earn, spend, owe or save, in one place. Everything is stored on this device only: no account to create, no server holding your records, and it all works with the phone in airplane mode. The next few screens show what it can do.',
    detail: [
      'This app is an offline personal finance tracker. Every record you create — transactions, accounts, budgets, loans, savings goals — is written to a database file on this phone and nowhere else. There is no sign-up, no sync, and no server holding a copy of your finances.',
      'That has one important consequence worth knowing up front: if you lose the phone or delete the app, the data goes with it. Use More → Export Data regularly to save an Excel backup you can restore from, and keep that file somewhere you trust.',
      'The app works entirely without a network connection. The only thing that ever leaves the app is a file you deliberately export, or a message you deliberately send us from the contact section at the bottom of this page.',
    ],
    image: require('../public/welcome-onboarding.png'),
  },
  {
    key: 'money-in-out',
    heading: 'Money in, money out',
    summary:
      'Tap the + button at the bottom of any screen to record an expense or income. Pick an amount, a category, the account it came from, and save — that is the whole loop. Everything else in the app is built on top of these entries.',
    detail: [
      'The floating + button sits above the tab bar on every screen. Tapping it opens a short menu: Expense, Income, Liability Repayment, Receivable Income, Withdraw and Transfer.',
      'Expense and Income open the same form with the matching tab preselected. You enter an amount, choose a category, pick which account the money moved through, set the date, and optionally add a note and tags. Only the amount, category and account are required — everything else can be left alone.',
      'Withdraw and Transfer move money between accounts you already own rather than recording new spending. A transfer never counts as an expense and never touches a budget, because nothing actually left your net worth — it just changed pockets.',
      'Every entry can be edited or deleted afterwards from the History tab. Tap any row to open it; the amount, category, account, date, note and tags can all be changed, and the balances and budgets recalculate themselves from the new values.',
      'Tags are a second, freeform way to label an entry alongside its category — useful for cutting across categories ("Reimbursable", "Shared", a trip name). Manage the list from More → Tags, and filter History by tag from the search bar at the top of that tab.',
    ],
    image: require('../public/money-in-out.png'),
  },
  {
    key: 'budgets',
    heading: 'Budgets',
    summary:
      'Set a monthly budget and the Dashboard tracks what is left as you spend. You can also set a separate budget per category, so "Food" and "Transport" each get their own ceiling. Budgets are per month and per currency, so nothing gets mixed together.',
    detail: [
      'There are two kinds of budget, and they work together. The overall monthly budget (More → Monthly Budget) is one number for the whole month. Category budgets (More → Category Budgets) set a separate ceiling per category on top of that.',
      'Both are set per month and per currency. A budget you set for August does not carry into September automatically — this is deliberate, so a month with unusual spending does not quietly become your new normal. A budget in LKR and a budget in USD are two separate figures and are never converted into each other.',
      "The Dashboard shows the current month's progress: what you have budgeted, what you have spent against it, and what is left. The category breakdown underneath shows the same thing per category, so an overspend is visible before the month ends rather than after.",
      'Individual transactions can be excluded from budget calculations with the "Exclude from budget" checkbox on the entry form. Use it for one-off items that would otherwise distort the picture — a reimbursed work expense, a large annual payment you account for separately.',
    ],
    image: require('../public/budgets.png'),
  },
  {
    key: 'accounts',
    heading: 'Accounts & currencies',
    summary:
      'Add every place your money sits — cash, bank accounts, credit cards, crypto wallets — and the app tracks each balance for you. Any account can hold several currencies at once, each kept as its own separate balance. Currencies are never converted into one another, so nothing is distorted by an exchange rate.',
    detail: [
      'An account is any place money sits: cash in your wallet, a bank account, a credit card, a crypto wallet. Add them from More → Accounts. Each one carries its own balance, which the app keeps up to date as you record transactions against it.',
      "A single account can hold balances in more than one currency at the same time — a bank account with both an LKR and a USD balance is two balance rows under one account, not two accounts. Add a currency to an account from that account's row on the Accounts screen.",
      'Currencies are never converted into one another anywhere in this app. There is no exchange rate table and no automatic conversion, on purpose: rates move, and a converted figure recorded today would silently become wrong tomorrow. Totals, budgets and reports are always shown per currency, side by side.',
      'Manage the currency list itself from More → Currencies. You can add a currency the app does not know about, disable ones you never use so they stop cluttering every picker, and change which currency is the default. The default currency cannot be disabled — the app always needs at least one currency it can fall back to.',
      'Credit cards behave a little differently from other accounts: spending increases what you owe, and paying the card off from another account is recorded as a payoff rather than as a new expense. This is what stops a card purchase being counted twice — once when you bought the thing, and again when you paid the bill.',
      'Liabilities and receivables (More → Liabilities & Receivables) track money you owe to people and money people owe you, including loans with interest. Recording a repayment updates both the loan and the account the money moved through.',
    ],
    image: require('../public/accounts.png'),
  },
  {
    key: 'automation',
    heading: 'Automation',
    summary:
      'Anything that repeats can be set up once instead of typed in every month. Recurring rules generate entries on a schedule, installment plans track what is left to pay, and savings goals show how close you are to a target. Recurring entries always wait for your review before they are recorded.',
    detail: [
      'Recurring rules (More → Recurring) handle anything that happens on a schedule — rent, a salary, a subscription. You define the amount, category, account and how often it repeats, and the app generates the entries for you as their dates come around.',
      'Generated entries are never recorded silently. They land in a pending review queue, and the Dashboard shows a banner when something is waiting. You approve, edit or skip each one — so a subscription you cancelled last month does not keep quietly adding itself to your spending.',
      'Installment plans (More → Installments) track a purchase you are paying off over a fixed number of months. The plan records the total, how many installments there are, and which are paid; the Dashboard reminds you when one is due, and paying from that reminder records the payment against both the plan and the account.',
      'Savings goals (More → Savings Goals) are the opposite direction: a target amount you are working towards, with each contribution recorded against it. The goal card shows how much is in, how much is left, and how far along you are.',
      'All three are per currency, like everything else. A goal in USD tracks only USD contributions.',
    ],
    image: require('../public/automation.png'),
  },
  {
    key: 'reports-history',
    heading: 'Reports & History',
    summary:
      'The History tab is every entry you have ever recorded, searchable and filterable. The Reports tab turns those entries into charts — spending by category, income against expenses, and how the trend is moving month to month. Both are read-only views of the same data.',
    detail: [
      'The History tab lists every transaction, transfer, loan payment and payoff in date order, newest first. Use the search bar to find an entry by note or amount, and the tag filter beside it to narrow to a single tag. Tap any row to edit or delete it.',
      'The Reports tab summarises the same data. It shows totals for the period you pick, a category breakdown as a pie chart, a month-to-month trend line, and a comparison of income against expenses. Use the currency tabs at the top to switch between currencies — figures are never combined across them.',
      'More → Expenses by Type breaks spending down by the kind of account it came from, which is the quickest way to see how much of a month went onto a credit card versus out of cash.',
      'More → Net Worth (linked from the bottom of the Accounts screen) totals everything you own against everything you owe, per currency. It is deliberately one extra tap away rather than on the main list — it is a number worth looking at monthly, not one worth checking anxiously every day.',
      'Nothing in Reports or History changes your data. They are views. The only screens that write anything are the entry forms and the management screens under More.',
    ],
    image: require('../public/reports-history.png'),
  },
  {
    key: 'more',
    heading: 'Everything else lives in More',
    summary:
      "The More tab is the app's control panel — accounts, categories, tags, budgets, recurring rules, installments, savings goals and app settings all live there. It is also where Export and Import Data live, which is how you back up and move to a new phone. This Help page is at the bottom of that list whenever you need it again.",
    detail: [
      'The More tab groups every management screen in the app: Budget, Accounts & Balances, Transactions (categories, tags, recurring, installments), Goals, Data, and App settings. If you are looking for a screen and it is not one of the four tabs, it is in More.',
      'App Settings holds the light/dark mode choice and the colour theme. These are cosmetic only and change nothing about your data.',
      'Export Data writes every record in the app to an Excel file you can save anywhere — cloud storage, email to yourself, a computer. This is the only backup that exists, so it is worth doing regularly. Export is never restricted; getting your own data out is not a paid feature.',
      'Import Data reads one of those exported files back in. It offers two modes. Merge adds the records in the file to what you already have and removes nothing. Replace deletes everything currently in the app and restores it from the file exactly as exported — use Replace when moving to a new phone, and read the confirmation carefully, because it cannot be undone.',
      'Help & Support — this page — is the last item in More, and it is always reachable from there whether or not you have been through the welcome carousel.',
    ],
    image: require('../public/more.png'),
  },
];
