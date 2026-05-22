import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  CheckCircle2,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import CollapsiblePicker from '../components/CollapsiblePicker';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import type { SettingsStackParamList } from '../navigation/types';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import PremiumGate from '../components/PremiumGate';
import { scaleFont, typography } from '../theme/typography';
import {
  addAccountWithBalance,
  addCurrencyToAccount,
  closeAccount,
  createTransfer,
  deleteAccount,
  getAccountBalance,
  getAccountBalances,
  getActiveAccountCountByType,
  getAccounts,
  getCurrencies,
  getTransferableAccounts,
  payOffCreditCard,
  updateAccount,
  updateAccountBalanceWithAudit,
} from '../db/queries';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { canAddAccount } from '../utils/entitlementChecks';
import { FREE_ACCOUNT_TYPES } from '../config/entitlements';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { formatDateString } from '../utils/date';

const ACCOUNT_TYPES = [
  'Cash',
  'Bank',
  'CreditCard',
  'CryptoWallet',
  'Receivable',
  'Liability',
] as const;

const CREDIT_CARD_TYPE = 'CreditCard';

// Only ordinary asset accounts can fund a card payoff — paying a credit
// card off with another credit card, a liability, or a receivable isn't
// a real payment, it's just moving debt around.
const PAYOFF_SOURCE_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

// Purely a display grouping (matches the mockup's "BANK & CASH" section
// label) — has no effect on which accounts are eligible for what, that's
// still governed entirely by each account's own `type`. A section with
// no matching accounts is simply never rendered.
const ACCOUNT_SECTIONS: { label: string; types: string[] }[] = [
  { label: 'Bank & Cash', types: ['Cash', 'Bank'] },
  { label: 'Crypto', types: ['CryptoWallet'] },
  { label: 'Credit Cards', types: ['CreditCard'] },
  { label: 'Loans', types: ['Liability', 'Receivable'] },
];

// The left accent bar's color per account type — asset accounts (Cash/
// Bank/Crypto) get the palette's own primary accent, a credit card's
// bar reads as debt (danger), and a Liability/Receivable loan account
// reads as a pending obligation (warning), same semantic colors those
// account types already use elsewhere (LiabilitiesReceivablesScreen,
// Dashboard's Due Soon card).
function accentColorFor(type: string, colors: ThemeColors): string {
  if (type === CREDIT_CARD_TYPE) {
    return colors.danger;
  }
  if (type === 'Liability' || type === 'Receivable') {
    return colors.warning;
  }
  return colors.primary;
}

type CurrencyRow = Awaited<ReturnType<typeof getCurrencies>>[number];
type AccountBalanceRow = Awaited<
  ReturnType<typeof getAccountBalances>
>[number] & {
  // Balance minus everything spent from the account so far (see
  // getAccountBalance's NETWORK-READY comment for the currency caveat).
  currentBalance: number;
};
type AccountWithBalances = Awaited<ReturnType<typeof getAccounts>>[number] & {
  balances: AccountBalanceRow[];
};

type Props = NativeStackScreenProps<SettingsStackParamList, 'Accounts'>;

function AccountsScreen({ route, navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(ACCOUNT_TYPES[0]);
  const [initialCurrencyId, setInitialCurrencyId] = useState('');
  const [initialBalance, setInitialBalance] = useState('');

  const [addCurrencyAccountId, setAddCurrencyAccountId] = useState<
    number | null
  >(null);
  const [addCurrencyCurrencyId, setAddCurrencyCurrencyId] = useState('');
  const [addCurrencyBalance, setAddCurrencyBalance] = useState('');

  // Same modal/handler pair regardless of what triggers it (month-start
  // prompt or an anytime tap) — one code path calling
  // updateAccountBalanceWithAudit, per the Stage 8 build order.
  const [updateBalanceTarget, setUpdateBalanceTarget] = useState<{
    accountId: number;
    accountName: string;
    currencyId: number;
    currencyCode: string;
    currentBalance: number;
  } | null>(null);
  const [updateBalanceNewValue, setUpdateBalanceNewValue] = useState('');
  const [updateBalanceDescription, setUpdateBalanceDescription] =
    useState('');

  // Separate from the generic Update Balance modal above — a payoff moves
  // real money out of a paying account via payOffCreditCard(), it doesn't
  // just overwrite a stored number the way an audit correction does.
  const [payOffTarget, setPayOffTarget] = useState<{
    accountId: number;
    accountName: string;
    currencyId: number;
    currencyCode: string;
    currentDebt: number;
  } | null>(null);
  const [payOffAmount, setPayOffAmount] = useState('');
  const [payOffPayingAccountId, setPayOffPayingAccountId] = useState('');
  const [payOffDate, setPayOffDate] = useState(formatDateString(new Date()));
  const [showPayOffDatePicker, setShowPayOffDatePicker] = useState(false);

  // Transfers are a free-tier feature (Stage 11) — no PremiumGate around
  // any of this, unlike the credit-card state above.
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferFromOptions, setTransferFromOptions] = useState<
    Awaited<ReturnType<typeof getTransferableAccounts>>
  >([]);
  const [transferFromAccountId, setTransferFromAccountId] = useState('');
  const [transferCurrencyId, setTransferCurrencyId] = useState('');
  const [transferToOptions, setTransferToOptions] = useState<
    Awaited<ReturnType<typeof getTransferableAccounts>>
  >([]);
  const [transferToAccountId, setTransferToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(formatDateString(new Date()));
  const [showTransferDatePicker, setShowTransferDatePicker] = useState(false);
  // Set only for Withdraw (FAB's constrained variant of this same sheet)
  // — narrows the "to" picker to a single account type. The "from" side
  // doesn't need its own persisted filter past the initial fetch since
  // transferFromOptions is filtered once at open time and never
  // re-queried afterward (unlike "to", which re-queries per currency
  // change below).
  const [transferToTypeFilter, setTransferToTypeFilter] = useState<
    string | null
  >(null);
  const [transferTitle, setTransferTitle] = useState('Transfer');

  const load = useCallback(async () => {
    const [rows, currencyRows] = await Promise.all([
      getAccounts(),
      getCurrencies(),
    ]);
    setCurrencies(currencyRows);
    const withBalances = await Promise.all(
      rows.map(async account => {
        const balances = await getAccountBalances(account.id);
        const balancesWithCurrent = await Promise.all(
          balances.map(async balance => ({
            ...balance,
            currentBalance: await getAccountBalance(
              account.id,
              balance.currencyId,
            ),
          })),
        );
        return { ...account, balances: balancesWithCurrent };
      }),
    );
    setAccounts(withBalances);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Switching the from-account resets currency/to-account rather than
  // leaving a stale, possibly-invalid selection — mirrors
  // TransactionForm's account-switch effect (Stage 7c).
  useEffect(() => {
    setTransferCurrencyId('');
    setTransferToAccountId('');
  }, [transferFromAccountId]);

  // Re-fetches the to-account list from the query layer itself (not
  // derived from local state) every time the chosen currency changes —
  // this is the exact call the build order specifies
  // (getTransferableAccounts(currencyId)), so the currency-holding filter
  // is always the query's own rules, not a client-side re-guess of them.
  useEffect(() => {
    if (!transferCurrencyId) {
      setTransferToOptions([]);
      return;
    }
    let cancelled = false;
    getTransferableAccounts(Number(transferCurrencyId)).then(rows => {
      if (cancelled) {
        return;
      }
      let filtered = rows.filter(row => String(row.id) !== transferFromAccountId);
      if (transferToTypeFilter) {
        filtered = filtered.filter(row => row.type === transferToTypeFilter);
      }
      setTransferToOptions(filtered);
    });
    return () => {
      cancelled = true;
    };
  }, [transferCurrencyId, transferFromAccountId, transferToTypeFilter]);

  const defaultCurrencyId = () => {
    const defaultCurrency = currencies.find(c => c.isDefault);
    return String((defaultCurrency ?? currencies[0])?.id ?? '');
  };

  const currencyLabel = (currencyId: string) => {
    const currency = currencies.find(c => String(c.id) === currencyId);
    return currency ? `${currency.code} — ${currency.name}` : 'Select currency';
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setType(ACCOUNT_TYPES[0]);
    setInitialCurrencyId(defaultCurrencyId());
    setInitialBalance('');
  };

  const handleAddPress = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEditPress = (account: AccountWithBalances) => {
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      return;
    }
    if (editingId) {
      // Editing an existing account is never gated — entitlement only
      // ever governs creating new items, per the standing rule that
      // existing data stays fully usable regardless of tier.
      await updateAccount(editingId, { name: name.trim(), type });
      setFormVisible(false);
      resetForm();
      load();
      return;
    }

    const parsedBalance = Number(initialBalance);
    if (!initialCurrencyId || !initialBalance || Number.isNaN(parsedBalance)) {
      return;
    }

    // Form is fully valid at this point — the paywall (if it appears at
    // all) is the very last thing standing between the user and Create,
    // not the first thing they see.
    const performCreate = async () => {
      await addAccountWithBalance(
        name.trim(),
        type,
        Number(initialCurrencyId),
        parsedBalance,
      );
      setFormVisible(false);
      resetForm();
      load();
    };

    const activeCountForType = await getActiveAccountCountByType(type);
    const check = canAddAccount(type, activeCountForType, tier);
    if (!check.allowed) {
      // performCreate is stored, not run — it becomes the pending action
      // a future successful purchase (Stage 19) completes automatically,
      // and dismissing the paywall now just leaves the form exactly as
      // filled in, since nothing here has cleared or unmounted it.
      //
      // formVisible is hidden first because this screen's form is itself
      // a native <Modal> — leaving it visible while PaywallModal's own
      // <Modal> opens on top of it means two native Modals are visible at
      // once, which never finishes presenting on iOS and freezes the app
      // solid (Android tolerates it). onDismiss brings the form back,
      // still filled in, if the user backs out without buying.
      setFormVisible(false);
      openPaywall({
        reason: check.reason ?? `${type} accounts require Premium.`,
        onPurchaseSuccess: performCreate,
        onDismiss: () => setFormVisible(true),
      });
      return;
    }
    await performCreate();
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete account',
      'Are you sure you want to delete this account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot delete account',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  };
    // Mirror closeAccount's own zero-balance gate here so the blocked
    // path shows an explanatory message instead of a confirm dialog —
    // there's no "close anyway" option, by design.
  const handleClose = (account: AccountWithBalances) => {
    const isZeroBalance = account.balances.every(b => b.balance === 0);
    if (!isZeroBalance) {
      Alert.alert(
        'Cannot close account',
        'This account still has a nonzero balance in at least one currency. Transfer the remainder to another account or log a transaction accounting for it, then try again.',
      );
      return;
    }
    Alert.alert(
      'Close account',
      `Close ${account.name}? You can reopen it later from Stage 9's reuse flow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeAccount(account.id);
              load();
            } catch (error) {
              Alert.alert(
                'Cannot close account',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  };

  const toggleAddCurrency = (accountId: number) => {
    if (addCurrencyAccountId === accountId) {
      setAddCurrencyAccountId(null);
      return;
    }
    setAddCurrencyAccountId(accountId);
    setAddCurrencyCurrencyId('');
    setAddCurrencyBalance('');
  };

  const handleAddCurrencySubmit = async (accountId: number) => {
    const parsedBalance = Number(addCurrencyBalance);
    if (
      !addCurrencyCurrencyId ||
      !addCurrencyBalance ||
      Number.isNaN(parsedBalance)
    ) {
      return;
    }
    try {
      await addCurrencyToAccount(
        accountId,
        Number(addCurrencyCurrencyId),
        parsedBalance,
      );
      setAddCurrencyAccountId(null);
      setAddCurrencyCurrencyId('');
      setAddCurrencyBalance('');
      load();
    } catch (error) {
      Alert.alert(
        'Cannot add currency',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const openUpdateBalance = (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => {
    setUpdateBalanceTarget({
      accountId: account.id,
      accountName: account.name,
      currencyId: balance.currencyId,
      currencyCode: balance.currencyCode,
      currentBalance: balance.currentBalance,
    });
    setUpdateBalanceNewValue(String(balance.currentBalance));
    setUpdateBalanceDescription('');
  };

  const handleUpdateBalanceSubmit = async () => {
    if (!updateBalanceTarget) {
      return;
    }
    const parsed = Number(updateBalanceNewValue);
    if (!updateBalanceNewValue || Number.isNaN(parsed)) {
      return;
    }
    if (!updateBalanceDescription.trim()) {
      Alert.alert(
        'Description required',
        'Enter a description explaining this balance correction.',
      );
      return;
    }
    try {
      await updateAccountBalanceWithAudit(
        updateBalanceTarget.accountId,
        updateBalanceTarget.currencyId,
        parsed,
        updateBalanceDescription.trim(),
      );
      setUpdateBalanceTarget(null);
      load();
    } catch (error) {
      Alert.alert(
        'Cannot update balance',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const openPayOffCard = (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => {
    // The card's stored balance is the negative of what's owed (see
    // db/queries.ts's getCreditCardDebt) — currentBalance is already
    // computed via getAccountBalance in load(), so no extra DB round trip
    // is needed just to show the debt here.
    const currentDebt = -balance.currentBalance;
    const eligiblePayingAccounts = activeAccounts.filter(
      a => a.id !== account.id && PAYOFF_SOURCE_ACCOUNT_TYPES.includes(a.type),
    );
    const eligiblePayingAccount = eligiblePayingAccounts.find(a =>
      a.balances.some(b => b.currencyId === balance.currencyId),
    );
    setPayOffTarget({
      accountId: account.id,
      accountName: account.name,
      currencyId: balance.currencyId,
      currencyCode: balance.currencyCode,
      currentDebt,
    });
    setPayOffAmount('');
    setPayOffPayingAccountId(
      eligiblePayingAccount ? String(eligiblePayingAccount.id) : '',
    );
    setPayOffDate(formatDateString(new Date()));
    setShowPayOffDatePicker(false);
  };

  const handlePayOffDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setPayOffDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowPayOffDatePicker(false);
    }
  };

  const handlePayOffSubmit = async () => {
    if (!payOffTarget) {
      return;
    }
    const parsedAmount = Number(payOffAmount);
    if (!payOffAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a payment amount greater than zero.');
      return;
    }
    if (!payOffPayingAccountId) {
      Alert.alert(
        'Select a paying account',
        'Choose the Bank, Cash, or Crypto Wallet account this payment is coming from.',
      );
      return;
    }
    try {
      await payOffCreditCard({
        creditCardAccountId: payOffTarget.accountId,
        payingAccountId: Number(payOffPayingAccountId),
        amount: parsedAmount,
        currencyId: payOffTarget.currencyId,
        date: payOffDate,
      });
      setPayOffTarget(null);
      load();
    } catch (error) {
      Alert.alert(
        'Cannot pay off card',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  // fromType/toType are only ever passed by the Withdraw entry point
  // below — a plain Transfer (whether from this screen's own "Transfer"
  // button or the FAB) leaves both undefined and gets every transferable
  // account type, same as always.
  const openTransferModal = async (options?: {
    fromType?: string;
    toType?: string;
    title?: string;
  }) => {
    setTransferFromAccountId('');
    setTransferCurrencyId('');
    setTransferToAccountId('');
    setTransferAmount('');
    setTransferDate(formatDateString(new Date()));
    setShowTransferDatePicker(false);
    setTransferToTypeFilter(options?.toType ?? null);
    setTransferTitle(options?.title ?? 'Transfer');
    const allOptions = await getTransferableAccounts();
    setTransferFromOptions(
      options?.fromType
        ? allOptions.filter(a => a.type === options.fromType)
        : allOptions,
    );
    setTransferModalVisible(true);
  };

  // Arriving here via the FAB's "Withdraw"/"Transfer" actions —
  // route.params is only ever set for those two navigations (see
  // navigation/types.ts's own comment on the Accounts route). Withdraw
  // constrains the sheet to Bank→Cash, matching "move money from a bank
  // account to cash" exactly rather than exposing every account type.
  // Params are cleared right after so navigating back here later (tab
  // bar, "Add" again) never reopens the sheet unexpectedly.
  useEffect(() => {
    if (route.params?.withdrawMode) {
      openTransferModal({
        fromType: 'Bank',
        toType: 'Cash',
        title: 'Withdraw to Cash',
      });
      navigation.setParams({ withdrawMode: undefined, openTransfer: undefined });
    } else if (route.params?.openTransfer) {
      openTransferModal();
      navigation.setParams({ withdrawMode: undefined, openTransfer: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.withdrawMode, route.params?.openTransfer]);

  const handleTransferDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setTransferDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowTransferDatePicker(false);
    }
  };

  const performTransfer = async (amount: number) => {
    try {
      await createTransfer({
        fromAccountId: Number(transferFromAccountId),
        toAccountId: Number(transferToAccountId),
        amount,
        currencyId: Number(transferCurrencyId),
        date: transferDate,
      });
      setTransferModalVisible(false);
      load();
    } catch (error) {
      Alert.alert(
        'Cannot transfer',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleTransferSubmit = () => {
    if (!transferFromAccountId || !transferToAccountId || !transferCurrencyId) {
      Alert.alert(
        'Missing information',
        'Select both accounts and a currency.',
      );
      return;
    }
    const parsedAmount = Number(transferAmount);
    if (!transferAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Enter a transfer amount greater than zero.',
      );
      return;
    }
    // Real accounts can go negative — this is a warning, not a hard
    // block, per the Stage 11 spec. Computed from the same currentBalance
    // already loaded for display, not a fresh query.
    const fromAccount = accounts.find(
      a => String(a.id) === transferFromAccountId,
    );
    const fromBalance =
      fromAccount?.balances.find(
        b => String(b.currencyId) === transferCurrencyId,
      )?.currentBalance ?? 0;
    const resultingBalance = fromBalance - parsedAmount;
    if (resultingBalance < 0) {
      Alert.alert(
        'This will leave the account negative',
        `This will leave ${fromAccount?.name ?? 'the account'} at ${resultingBalance.toFixed(2)}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => performTransfer(parsedAmount) },
        ],
      );
      return;
    }
    performTransfer(parsedAmount);
  };

  // Closed accounts stay in the DB (and in `accounts` state, for anything
  // that still needs to look one up) but drop out of the visible list.
  const activeAccounts = accounts.filter(a => a.active);

  const transferCanSave =
    Boolean(transferFromAccountId) &&
    Boolean(transferCurrencyId) &&
    Boolean(transferToAccountId) &&
    transferAmount !== '' &&
    !Number.isNaN(Number(transferAmount)) &&
    Number(transferAmount) > 0;

  const payOffPayingAccountOptions = payOffTarget
    ? activeAccounts.filter(
        a =>
          a.id !== payOffTarget.accountId &&
          PAYOFF_SOURCE_ACCOUNT_TYPES.includes(a.type) &&
          a.balances.some(b => b.currencyId === payOffTarget.currencyId),
      )
    : [];

  // Mirrors handleSubmit's own checks — editing only ever needs a name,
  // creating additionally needs a starting currency + balance, same
  // asymmetry handleSubmit itself already has.
  const accountFormCanSave =
    name.trim() !== '' &&
    (editingId != null ||
      (initialCurrencyId !== '' &&
        initialBalance !== '' &&
        !Number.isNaN(Number(initialBalance))));

  const updateBalanceCanSave =
    updateBalanceNewValue !== '' &&
    !Number.isNaN(Number(updateBalanceNewValue)) &&
    updateBalanceDescription.trim() !== '';

  const payOffCanSave =
    payOffAmount !== '' &&
    !Number.isNaN(Number(payOffAmount)) &&
    Number(payOffAmount) > 0 &&
    payOffPayingAccountId !== '';

  // Not module-scope (react/no-unstable-nested-components would normally
  // flag that for a function returning JSX) — kept as a plain function
  // declared inside the component body instead of inlined into the
  // section .map() below purely for readability, since it closes over
  // a dozen-plus pieces of local state (colors, addCurrencyAccountId,
  // currencies, every handler) that would otherwise have to be threaded
  // through as props for no real benefit — this is never passed to a
  // list-rendering API as its own component, just called directly.
  const renderAccountRow = (item: AccountWithBalances) => {
    const availableCurrencies = currencies.filter(
      c => !item.balances.some(b => b.currencyId === c.id),
    );
    const isCreditCard = item.type === CREDIT_CARD_TYPE;
    const accent = accentColorFor(item.type, colors);
    const rowContent = (
      <Card colors={colors} style={styles.accountCard}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <View style={styles.accountCardContent}>
          <Text style={[styles.rowName, { color: colors.text }]}>
            {item.name}
          </Text>
          <Text
            style={[typography.eyebrow, styles.rowType, { color: colors.textSecondary }]}>
            {item.type.toUpperCase()}
          </Text>
          {item.balances.length > 0 ? (
            <View style={styles.balanceChips}>
              {item.balances.map(b => (
                <Pressable
                  key={b.currencyId}
                  onPress={() => openUpdateBalance(item, b)}>
                  <Text
                    style={[
                      typography.amountMono,
                      styles.balanceChip,
                      { borderColor: colors.border, color: colors.text },
                    ]}>
                    {isCreditCard
                      ? `${b.currencyCode} owes ${(-b.currentBalance).toFixed(2)}`
                      : `${b.currencyCode} ${b.currentBalance.toFixed(2)}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.rowBalance, { color: colors.textSecondary }]}>
              No balances yet
            </Text>
          )}

          {isCreditCard && item.balances.length > 0 && (
            <View style={styles.payOffRow}>
              {item.balances.map(b => (
                <Pressable
                  key={b.currencyId}
                  style={[styles.outlinePillButton, { borderColor: colors.danger }]}
                  onPress={() => openPayOffCard(item, b)}>
                  <Text style={[styles.outlinePillButtonText, { color: colors.danger }]}>
                    Pay Off Card ({b.currencyCode})
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.accountActionsRow}>
            <Pressable
              style={[styles.iconPillButton, { borderColor: colors.border }]}
              onPress={() => handleEditPress(item)}>
              <Pencil size={14} color={colors.text} />
              <Text style={[styles.iconPillButtonText, { color: colors.text }]}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              style={[styles.iconPillButton, { borderColor: colors.border }]}
              onPress={() => handleClose(item)}>
              <CheckCircle2 size={14} color={colors.text} />
              <Text style={[styles.iconPillButtonText, { color: colors.text }]}>
                Close
              </Text>
            </Pressable>
            <Pressable
              style={[styles.iconPillButton, { borderColor: colors.dangerSoft }]}
              onPress={() => handleDelete(item.id)}>
              <Trash2 size={14} color={colors.danger} />
              <Text style={[styles.iconPillButtonText, { color: colors.danger }]}>
                Delete
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={() => toggleAddCurrency(item.id)}>
            <Text style={[styles.addCurrencyLink, { color: colors.primary }]}>
              {addCurrencyAccountId === item.id ? 'Cancel' : '+ Add Currency'}
            </Text>
          </Pressable>

          {addCurrencyAccountId === item.id && (
            <View style={styles.addCurrencyForm}>
              {availableCurrencies.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  This account already has a balance in every currency.
                </Text>
              ) : (
                <>
                  <CollapsiblePicker
                    displayLabel={
                      addCurrencyCurrencyId
                        ? currencyLabel(addCurrencyCurrencyId)
                        : 'Select currency'
                    }
                    selectedValue={addCurrencyCurrencyId}
                    onValueChange={setAddCurrencyCurrencyId}
                    items={availableCurrencies.map(c => ({
                      label: `${c.code} — ${c.name}`,
                      value: String(c.id),
                    }))}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                    ]}
                    value={addCurrencyBalance}
                    onChangeText={setAddCurrencyBalance}
                    keyboardType="numeric"
                    returnKeyType="done"
                    inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                    placeholder="Starting balance"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Pressable
                    style={[styles.primaryPillButton, { backgroundColor: colors.primary }]}
                    onPress={() => handleAddCurrencySubmit(item.id)}>
                    <Text
                      style={[styles.primaryPillButtonText, { color: colors.primaryText }]}>
                      Add
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </Card>
    );
    return (
      <View key={item.id}>
        {isCreditCard ? (
          <PremiumGate label="Credit cards are a Premium feature.">
            {rowContent}
          </PremiumGate>
        ) : (
          rowContent
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.topActionsRow}>
        <Pressable
          style={[
            styles.primaryPillButton,
            styles.topActionButton,
            { backgroundColor: colors.primary },
          ]}
          onPress={handleAddPress}>
          <Plus size={16} color={colors.primaryText} strokeWidth={2.5} />
          <Text style={[styles.primaryPillButtonText, { color: colors.primaryText }]}>
            Add Account
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.outlinePillButton,
            styles.topActionButton,
            { borderColor: colors.border },
          ]}
          onPress={() => openTransferModal()}>
          <Repeat size={16} color={colors.text} />
          <Text style={[styles.outlinePillButtonText, { color: colors.text }]}>
            Transfer
          </Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {activeAccounts.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No accounts yet.
          </Text>
        ) : (
          ACCOUNT_SECTIONS.filter(section =>
            activeAccounts.some(a => section.types.includes(a.type)),
          ).map(section => (
            <View key={section.label}>
              <Text
                style={[
                  typography.eyebrow,
                  styles.sectionLabel,
                  { color: colors.textSecondary },
                ]}>
                {section.label.toUpperCase()}
              </Text>
              {activeAccounts
                .filter(a => section.types.includes(a.type))
                .map(item => renderAccountRow(item))}
            </View>
          ))
        )}
      </View>

      <BottomSheetModal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          resetForm();
        }}
        onSave={handleSubmit}
        canSave={accountFormCanSave}
        title={editingId ? 'Edit Account' : 'Add Account'}
        saveLabel={editingId ? 'Update' : 'Add'}>
        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          value={name}
          onChangeText={setName}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.text }]}>Type</Text>
        <CollapsiblePicker
          displayLabel={type}
          selectedValue={type}
          onValueChange={setType}
          items={ACCOUNT_TYPES.map(t => ({ label: t, value: t }))}
        />
        {/* Only while creating — editing an existing account of a
            premium type is never blocked, so flagging it here would be
            misleading about what's actually gated. */}
        {!editingId && tier === 'free' && !FREE_ACCOUNT_TYPES.includes(type) && (
          <Text style={[styles.premiumBadge, { color: colors.warning }]}>
            🔒 Premium — {type}
          </Text>
        )}

        {!editingId && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>
              Initial currency
            </Text>
            <CollapsiblePicker
              displayLabel={currencyLabel(initialCurrencyId)}
              selectedValue={initialCurrencyId}
              onValueChange={setInitialCurrencyId}
              items={currencies.map(c => ({
                label: `${c.code} — ${c.name}`,
                value: String(c.id),
              }))}
            />

            <Text style={[styles.label, { color: colors.text }]}>
              Initial balance
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              value={initialBalance}
              onChangeText={setInitialBalance}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </>
        )}

        <NumericInputAccessory />
      </BottomSheetModal>

      {/* Deliberately placed here rather than as a SettingsHome list
          entry or a Dashboard card — net worth is sensitive enough that
          it should take a real choice to see, not show up on the screen
          the app opens to or a flat row one tap from More. See
          NetWorthScreen's own header comment. */}
      <Pressable onPress={() => navigation.navigate('NetWorth')}>
        <Card colors={colors} style={styles.netWorthLink}>
          <View
            style={[
              styles.netWorthLinkIcon,
              { backgroundColor: colors.primarySoft },
            ]}>
            <TrendingUp size={18} color={colors.primary} />
          </View>
          <View style={styles.netWorthLinkText}>
            <Text style={[styles.netWorthLinkTitle, { color: colors.text }]}>
              View Net Worth
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              Assets minus liabilities, by currency
            </Text>
          </View>
          <ChevronRight size={18} color={colors.chevron} />
        </Card>
      </Pressable>

      <BottomSheetModal
        visible={updateBalanceTarget != null}
        onClose={() => setUpdateBalanceTarget(null)}
        onSave={handleUpdateBalanceSubmit}
        canSave={updateBalanceCanSave}
        title={
          updateBalanceTarget
            ? `Update balance — ${updateBalanceTarget.accountName} (${updateBalanceTarget.currencyCode})`
            : undefined
        }
        saveLabel="Save">
        {updateBalanceTarget && (
          <>
            <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
              Current: {updateBalanceTarget.currentBalance.toFixed(2)}
            </Text>

            <Text style={[styles.label, { color: colors.text }]}>
              New balance
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              value={updateBalanceNewValue}
              onChangeText={setUpdateBalanceNewValue}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>
              Description (required)
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              value={updateBalanceDescription}
              onChangeText={setUpdateBalanceDescription}
              placeholder="Why is this balance being corrected?"
              placeholderTextColor={colors.textSecondary}
            />

            <NumericInputAccessory />
          </>
        )}
      </BottomSheetModal>

      <BottomSheetModal
        visible={payOffTarget != null}
        onClose={() => setPayOffTarget(null)}
        onSave={handlePayOffSubmit}
        canSave={payOffCanSave}
        title={
          payOffTarget
            ? `Pay off ${payOffTarget.accountName} (${payOffTarget.currencyCode})`
            : undefined
        }
        saveLabel="Pay Off">
            {payOffTarget && (
              <>
                <Text style={[styles.modalCurrent, { color: colors.danger }]}>
                  Current debt: {payOffTarget.currentDebt.toFixed(2)}{' '}
                  {payOffTarget.currencyCode}
                </Text>

                <Text style={[styles.label, { color: colors.text }]}>
                  Pay from
                </Text>
                {payOffPayingAccountOptions.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>
                    No eligible Bank, Cash, or Crypto Wallet account with a
                    balance in {payOffTarget.currencyCode} was found.
                  </Text>
                ) : (
                  <CollapsiblePicker
                    displayLabel={
                      payOffPayingAccountOptions.find(
                        a => String(a.id) === payOffPayingAccountId,
                      )?.name ?? 'Select account'
                    }
                    selectedValue={payOffPayingAccountId}
                    onValueChange={setPayOffPayingAccountId}
                    items={payOffPayingAccountOptions.map(a => ({
                      label: `${a.name} (${a.type})`,
                      value: String(a.id),
                    }))}
                  />
                )}

                <Text style={[styles.label, { color: colors.text }]}>
                  Amount
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
                  ]}
                  value={payOffAmount}
                  onChangeText={setPayOffAmount}
                  keyboardType="numeric"
                  returnKeyType="done"
                  inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.label, { color: colors.text }]}>
                  Date
                </Text>
                <View style={styles.payOffDateRow}>
                  <View style={styles.dueDateButton}>
                    <Button
                      title={payOffDate}
                      color={colors.primary}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowPayOffDatePicker(true);
                      }}
                    />
                  </View>
                </View>
                {Platform.OS === 'android' ? (
                  showPayOffDatePicker && (
                    <DateTimePicker
                      value={new Date(payOffDate)}
                      mode="date"
                      display="default"
                      onChange={handlePayOffDateChange}
                    />
                  )
                ) : (
                  <Modal
                    visible={showPayOffDatePicker}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowPayOffDatePicker(false)}>
                    <Pressable
                      style={styles.modalBackdrop}
                      onPress={() => setShowPayOffDatePicker(false)}>
                      <Pressable
                        style={[styles.modalCard, { backgroundColor: colors.surface }]}
                        onPress={() => {}}>
                        <DateTimePicker
                          value={new Date(payOffDate)}
                          mode="date"
                          display="spinner"
                          onChange={handlePayOffDateChange}
                        />
                        <Button
                          title="Done"
                          color={colors.primary}
                          onPress={() => setShowPayOffDatePicker(false)}
                        />
                      </Pressable>
                    </Pressable>
                  </Modal>
                )}

                <NumericInputAccessory />
              </>
            )}
      </BottomSheetModal>

      <BottomSheetModal
        visible={transferModalVisible}
        onClose={() => setTransferModalVisible(false)}
        onSave={handleTransferSubmit}
        canSave={transferCanSave}
        title={transferTitle}
        saveLabel={transferTitle === 'Withdraw to Cash' ? 'Withdraw' : 'Transfer'}>
            <Text style={[styles.label, { color: colors.text }]}>From</Text>
            {transferFromOptions.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No Bank, Cash, or Crypto Wallet accounts available.
              </Text>
            ) : (
              <CollapsiblePicker
                displayLabel={
                  transferFromOptions.find(
                    a => String(a.id) === transferFromAccountId,
                  )?.name ?? 'Select account'
                }
                selectedValue={transferFromAccountId}
                onValueChange={setTransferFromAccountId}
                items={transferFromOptions.map(a => ({
                  label: `${a.name} (${a.type})`,
                  value: String(a.id),
                }))}
              />
            )}

            {transferFromAccountId ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>
                  Currency
                </Text>
                {(() => {
                  const fromAccount = accounts.find(
                    a => String(a.id) === transferFromAccountId,
                  );
                  const fromCurrencyOptions = fromAccount?.balances ?? [];
                  return fromCurrencyOptions.length === 0 ? (
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                      This account has no currency balances yet.
                    </Text>
                  ) : (
                    <CollapsiblePicker
                      displayLabel={
                        fromCurrencyOptions.find(
                          b => String(b.currencyId) === transferCurrencyId,
                        )?.currencyCode ?? 'Select currency'
                      }
                      selectedValue={transferCurrencyId}
                      onValueChange={setTransferCurrencyId}
                      items={fromCurrencyOptions.map(b => ({
                        label: `${b.currencyCode} — ${b.currencyName}`,
                        value: String(b.currencyId),
                      }))}
                    />
                  );
                })()}
              </>
            ) : null}

            {transferCurrencyId ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>To</Text>
                {transferToOptions.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>
                    No other account holds this currency yet.
                  </Text>
                ) : (
                  <CollapsiblePicker
                    displayLabel={
                      transferToOptions.find(
                        a => String(a.id) === transferToAccountId,
                      )?.name ?? 'Select account'
                    }
                    selectedValue={transferToAccountId}
                    onValueChange={setTransferToAccountId}
                    items={transferToOptions.map(a => ({
                      label: `${a.name} (${a.type})`,
                      value: String(a.id),
                    }))}
                  />
                )}
              </>
            ) : null}

            {transferFromAccountId && transferCurrencyId && (
              <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
                {(() => {
                  const fromAccount = accounts.find(
                    a => String(a.id) === transferFromAccountId,
                  );
                  const fromBalanceRow = fromAccount?.balances.find(
                    b => String(b.currencyId) === transferCurrencyId,
                  );
                  const toAccount = transferToAccountId
                    ? accounts.find(a => String(a.id) === transferToAccountId)
                    : undefined;
                  const toBalanceRow = toAccount?.balances.find(
                    b => String(b.currencyId) === transferCurrencyId,
                  );
                  const currencyCode = fromBalanceRow?.currencyCode ?? '';
                  const fromLine = `${fromAccount?.name ?? 'From'}: ${
                    fromBalanceRow?.currentBalance?.toFixed(2) ?? '—'
                  } ${currencyCode}`;
                  const toLine = toAccount
                    ? `  ·  ${toAccount.name}: ${
                        toBalanceRow?.currentBalance?.toFixed(2) ?? '—'
                      } ${currencyCode}`
                    : '';
                  return `${fromLine}${toLine}`;
                })()}
              </Text>
            )}

            <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              ]}
              value={transferAmount}
              onChangeText={setTransferAmount}
              keyboardType="numeric"
              returnKeyType="done"
              inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Date</Text>
            <View style={styles.payOffDateRow}>
              <View style={styles.dueDateButton}>
                <Button
                  title={transferDate}
                  color={colors.primary}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowTransferDatePicker(true);
                  }}
                />
              </View>
            </View>
            {Platform.OS === 'android' ? (
              showTransferDatePicker && (
                <DateTimePicker
                  value={new Date(transferDate)}
                  mode="date"
                  display="default"
                  onChange={handleTransferDateChange}
                />
              )
            ) : (
              <Modal
                visible={showTransferDatePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowTransferDatePicker(false)}>
                <Pressable
                  style={styles.modalBackdrop}
                  onPress={() => setShowTransferDatePicker(false)}>
                  <Pressable
                    style={[styles.modalCard, { backgroundColor: colors.surface }]}
                    onPress={() => {}}>
                    <DateTimePicker
                      value={new Date(transferDate)}
                      mode="date"
                      display="spinner"
                      onChange={handleTransferDateChange}
                    />
                    <Button
                      title="Done"
                      color={colors.primary}
                      onPress={() => setShowTransferDatePicker(false)}
                    />
                  </Pressable>
                </Pressable>
              </Modal>
            )}

            <NumericInputAccessory />
      </BottomSheetModal>

      <NumericInputAccessory />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerContent: {
    padding: 16,
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  topActionButton: {
    flex: 1,
  },
  primaryPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryPillButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  outlinePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  outlinePillButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 12,
    marginBottom: 8,
  },
  netWorthLink: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginTop: 16,
  },
  netWorthLinkIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  netWorthLinkText: {
    flex: 1,
  },
  netWorthLinkTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  premiumBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    marginTop: 8,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
  accountCard: {
    flexDirection: 'row',
    padding: 0,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
  },
  accountCardContent: {
    flex: 1,
    padding: 14,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  rowType: {
    marginTop: 2,
  },
  rowBalance: {
    marginTop: 6,
  },
  balanceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  balanceChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  accountActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  iconPillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
  addCurrencyLink: {
    marginTop: 8,
    fontWeight: '600',
  },
  addCurrencyForm: {
    marginTop: 8,
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  modalCurrent: {
    fontSize: 14,
    marginBottom: 4,
  },
  payOffRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  payOffDateRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  dueDateButton: {
    flex: 1,
  },
});

export default AccountsScreen;
