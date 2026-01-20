This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

# Budget Tracker Info
 
Single source of truth for where this project stands. Update the
checkboxes as you go — this is meant to survive long gaps between work
sessions, so it's written assuming you'll come back with zero memory of
where you left off.

---
 
## Where each stage actually lives (you're consolidating these yourself)
 
| Stages | File |
|---|---|
| 1–6 | `rn-budget-tracker-roadmap.md` (the original roadmap — frozen as of Stage 6; not updated since) |
| 7a, 7b, 7c + README requirements | `stage-7-currencies-and-readme.md` |
| 7d, 8 | `stage-7d-and-stage-8.md` |
| 9a, 9b | `stage-9-liabilities-receivables.md` |
| 18–20 (architecture + open decisions, not build prompts yet) | `stages-18-20-auth-and-subscriptions.md` |
| Schema (always current) | `budget-tracker-er-diagram.mermaid` — kept up to date through Stage 9; this is the one file worth trusting over any prose description if they ever disagree |
 
---
 
## Standing rules — apply to every stage from here on, even though later prompts won't restate them in full
 
- **VERIFICATION RULE** (since Stage 3): no screen recording, video capture, or automated screenshot/GIF tools, ever, to verify anything. Console logs, on-screen values, and manual interaction only.
- **Error logging + comments** (since Stage 7d): every DB read/write wrapped in try/catch with a specific `console.error` message (function name, what it was doing, the actual error) — never a generic catch-all. Non-obvious functions get a one-line "why" comment.
- **Version pinning**: everything pinned to the newest version published before **2025-08-01**. For anything beyond Node/React Native/React (which are confirmed exactly), run `npm view <package> time --json` and pin the newest version before that cutoff — never guess.
- **NETWORK-READY comments**: every data-access function documents what it would look like with a backend, but nothing in this app ever makes a real network call.
- **No network — scoped, not absolute (updated for Stages 18–20).** Through Stage 17, this stays literal: no `fetch`, no `axios`, nothing. From Stage 18 onward, network access is allowed for **exactly two things** — verifying who the user is (OAuth) and whether they've paid (subscription status). Financial data never leaves the device, in any stage, ever. If a future change would send a transaction, balance, loan, or account anywhere off-device, that's out of scope for this project as designed — not a judgment call to make in the moment.
- **No screen recordings, no exceptions, no matter how minor the stage.**
## Key design decisions already locked in (don't re-derive these, don't accidentally contradict them)
 
- **Net worth, per currency, never summed across currencies:**
  `Bank + Cash + CryptoWallet + Receivable balances − Liability balances − CreditCard debt − unpaid installment balances`
- **Interest is simple (non-compounding) daily accrual**, calculated live off principal + days elapsed — never silently written into a stored balance.
- **Credit card "opposite math" is inferred from account type alone** — no separate payment-method field on transactions.
- **Transfers require identical currency on both sides** — no conversion, anywhere, ever.
- **Budgets (overall and per-category) stay in your default currency only** — not extended to multi-currency.
- **Savings goals never touch real account balances** — contributions are a log, not a transaction.
- **USD and USDT are kept strictly separate** — no stablecoin-equals-fiat assumption anywhere.
- **Account closure requires a zero balance in every currency**, or the user must be asked where the remainder went — no silent balance discarding. Closing sets `active = false`, never deletes the row.
- **Liability/Receivable accounts auto-close on full payoff** and can be reactivated later (matching counterparty) instead of duplicated — the Thisara pattern.
- **Free tier**: add/update transactions, 1 account per type (Bank/Cash/CryptoWallet only), account-to-account transfers, budgets per category, max 5 expense categories (system-reserved "Bank" category excluded from the count).
- **Premium**: credit cards, liabilities/receivables, loans, installments, additional accounts, more than 5 categories. Shown disabled; tapping opens the paywall.
- **Pricing**: monthly, and yearly at `monthly × 12 × 0.85` (15% off).
- **Entitlement**: encrypted backend-issued token in Keychain/Keystore, valid until subscription end date — self-expiring, so no separate offline grace logic. Free users store no token; absence of a token *is* the free state.
---
 
## Suggested order for what's left
 
Stages 10–17 don't have hard dependencies on each other the way 7→8→9 did
(each of those built directly on the last). From here, a reasonable
sequence is:
 
1. **Stage 10 (Credit Cards)** next — it reuses Stage 9's settlement-style
   payoff pattern most directly, so doing it while that's fresh is the
   path of least friction.
2. **Stage 11 (Transfers)** — small, self-contained, good palate cleanser
   after two heavy stages.
3. **Stage 12 (Installments)** and **Stage 13 (Recurring)** — related
   concepts (both are "future obligations"), worth doing back to back.
4. **Stage 14 (Savings Goals)** — smallest remaining stage, low risk.
5. **Stage 15 (Search + Tags)** — quick, no schema dependencies on anything else.
6. **Stage 16 (Statistics)** and **Stage 17 (Excel Import/Export)** last of
   the offline work, deliberately — both benefit from every other feature
   already existing, since they're the ones that have to represent
   *everything* the app can do.
7. **Stages 18–20 (auth + subscriptions) genuinely last.** Not just
   sequencing preference: you can't decide what to put behind a paywall
   until the features exist, and both app stores review a real,
   working app with real products configured. Building this early means
   maintaining auth plumbing through fifteen stages of churn for no
   benefit.
