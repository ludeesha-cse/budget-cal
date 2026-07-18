import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { getTransferableAccounts } from '../db/queries';
import { formatDateString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import {
  convertAmount,
  getPairRate,
  indexRatesByCurrencyId,
} from '../utils/currencyConversion';
import { useAsyncAction } from './useAsyncAction';
import { useFieldErrors } from './useFieldErrors';
import type { AccountBalanceRow, AccountWithBalances } from './useAccounts';
import {
  useCreateTransfer as useCreateTransferMutation,
  useCurrencyRates,
} from './queries';

export type TransferableAccountRow = Awaited<
  ReturnType<typeof getTransferableAccounts>
>[number];

export interface OpenTransferOptions {
  fromType?: string;
  toType?: string;
  title?: string;
}

export interface UseTransferDeps {
  accounts: AccountWithBalances[];
  // Only ever set for the FAB's Withdraw/Transfer deep links (see
  // navigation/types.ts's own comment on the Accounts route's params) —
  // both undefined means no deep link is pending.
  routeParams: { withdrawMode?: boolean; openTransfer?: boolean } | undefined;
  clearRouteParams: () => void;
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>;
}

export interface UseTransferResult {
  visible: boolean;
  title: string;
  fromOptions: TransferableAccountRow[];
  fromAccountId: string;
  setFromAccountId: (value: string) => void;
  // The from account's own currency balances — what it can send.
  fromCurrencyOptions: AccountBalanceRow[];
  currencyId: string;
  setCurrencyId: (value: string) => void;
  toOptions: TransferableAccountRow[];
  toAccountId: string;
  setToAccountId: (value: string) => void;
  // The destination account's currency balances — what it can receive.
  // Excludes the from currency when both sides are the same account,
  // since that pairing moves nothing.
  toCurrencyOptions: AccountBalanceRow[];
  toCurrencyId: string;
  setToCurrencyId: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  // Only meaningful when the two currencies differ. Pre-filled from the
  // configured rate as the user types the amount, and freely
  // overwritable — whatever is in here at save time is what gets stored.
  convertedAmount: string;
  setConvertedAmount: (value: string) => void;
  isCrossCurrency: boolean;
  // "1 USD = 340.00 LKR", or null when no rate is on file for the pair.
  rateHint: string | null;
  date: string;
  setDate: (value: string) => void;
  canSave: boolean;
  // True when this required field is empty AND the user has already
  // pressed Transfer. See hooks/useFieldErrors.
  isMissing: (field: string) => boolean;
  summaryText: string | null;
  openTransferModal: (options?: OpenTransferOptions) => Promise<void>;
  close: () => void;
  handleTransferSubmit: () => void;
}

// Transfers are a free-tier feature (Stage 11) — no PremiumGate around
// any of this, unlike usePayOffCard's credit-card state. Also handles the
// FAB's Withdraw/Transfer deep link (route.params), since opening the
// sheet is this hook's own responsibility either way.
//
// THE FLOW CHANGED SHAPE for cross-currency support. It used to be
// From account -> currency -> To account, where one currency governed
// both sides. It is now From account -> From currency -> To account ->
// To currency, because the two sides can differ. Two consequences:
//
//   - the To-account list is every transferable account, INCLUDING the
//     from account itself, so "BOC USD -> BOC LKR" is expressible;
//   - the To-currency list comes from the destination account's own
//     balances, which enforces the rule that a transfer moves money
//     between holdings that already exist rather than creating one.
export function useTransfer(deps: UseTransferDeps): UseTransferResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts).
  const createTransfer = useCreateTransferMutation();
  const { data: rateRows } = useCurrencyRates();
  const { accounts, routeParams, clearRouteParams, onSaved } = deps;
  const runAction = useAsyncAction();

  const [visible, setVisible] = useState(false);
  const [fromOptions, setFromOptions] = useState<TransferableAccountRow[]>([]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [toOptions, setToOptions] = useState<TransferableAccountRow[]>([]);
  const [toAccountId, setToAccountId] = useState('');
  const [toCurrencyId, setToCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [convertedAmount, setConvertedAmount] = useState('');
  // True once the user has typed in the converted field themselves. From
  // that moment the auto-fill stops overwriting it — someone who entered
  // the exact figure their bank gave them must not have it silently
  // replaced by the app's own arithmetic on the next keystroke of the
  // amount field.
  const [convertedTouched, setConvertedTouched] = useState(false);
  const [date, setDate] = useState(formatDateString(new Date()));
  // Set only for Withdraw (the FAB's constrained variant of this same
  // sheet) — narrows the "to" picker to a single account type.
  const [toTypeFilter, setToTypeFilter] = useState<string | null>(null);
  const [title, setTitle] = useState('Transfer');

  const ratesByCurrencyId = useMemo(
    () => indexRatesByCurrencyId(rateRows ?? []),
    [rateRows],
  );

  // Switching the from-account resets everything downstream of it rather
  // than leaving a stale, possibly-invalid selection — mirrors
  // TransactionForm's account-switch effect (Stage 7c).
  useEffect(() => {
    setCurrencyId('');
    setToAccountId('');
    setToCurrencyId('');
  }, [fromAccountId]);

  // Switching the from-currency invalidates the destination pairing too:
  // "same account, same currency" is refused, so the previously chosen
  // to-currency may no longer be legal.
  useEffect(() => {
    setToCurrencyId('');
  }, [currencyId]);

  // Re-fetches the to-account list from the query layer itself (not
  // derived from local state) every time the chosen from-currency
  // changes. Note it is deliberately called WITHOUT a currency filter:
  // the destination no longer has to hold the source's currency, only
  // some currency of its own, which the to-currency picker then chooses
  // from. The from account stays in this list — same account, different
  // currency is the in-place conversion case.
  useEffect(() => {
    if (!currencyId) {
      setToOptions([]);
      return;
    }
    let cancelled = false;
    getTransferableAccounts().then(rows => {
      if (cancelled) {
        return;
      }
      let filtered = rows;
      if (toTypeFilter) {
        filtered = filtered.filter(row => row.type === toTypeFilter);
      }
      // An account with no currency balances at all can receive nothing,
      // so offering it would only lead to an empty second picker.
      filtered = filtered.filter(row => {
        const withBalances = accounts.find(a => a.id === row.id);
        if (!withBalances) {
          return false;
        }
        if (String(row.id) !== fromAccountId) {
          return withBalances.balances.length > 0;
        }
        // The from account itself qualifies only if it holds a SECOND
        // currency to convert into.
        return withBalances.balances.some(
          b => String(b.currencyId) !== currencyId,
        );
      });
      setToOptions(filtered);
    });
    return () => {
      cancelled = true;
    };
  }, [currencyId, fromAccountId, toTypeFilter, accounts]);

  const toCurrencyOptions = useMemo(() => {
    if (!toAccountId) {
      return [];
    }
    const toAccount = accounts.find(a => String(a.id) === toAccountId);
    const balances = toAccount?.balances ?? [];
    if (toAccountId !== fromAccountId) {
      return balances;
    }
    // Same account on both sides: sending a currency to itself moves
    // nothing, so it is not offered at all rather than offered and then
    // rejected on save.
    return balances.filter(b => String(b.currencyId) !== currencyId);
  }, [accounts, toAccountId, fromAccountId, currencyId]);

  // A destination with exactly one receivable currency has no real
  // choice to make, so it is chosen automatically — this is what keeps
  // the common same-currency transfer a three-tap flow rather than
  // adding a picker step that only ever has one answer.
  useEffect(() => {
    if (toCurrencyId || toCurrencyOptions.length === 0) {
      return;
    }
    const sameAsSource = toCurrencyOptions.find(
      b => String(b.currencyId) === currencyId,
    );
    if (sameAsSource) {
      setToCurrencyId(String(sameAsSource.currencyId));
      return;
    }
    if (toCurrencyOptions.length === 1) {
      setToCurrencyId(String(toCurrencyOptions[0].currencyId));
    }
  }, [toCurrencyOptions, toCurrencyId, currencyId]);

  const isCrossCurrency =
    Boolean(currencyId) && Boolean(toCurrencyId) && currencyId !== toCurrencyId;

  const fromRate = ratesByCurrencyId.get(Number(currencyId));
  const toRate = ratesByCurrencyId.get(Number(toCurrencyId));

  // Auto-fill the converted amount from the configured rate, until the
  // user takes it over. Deliberately a suggestion and never a lock: the
  // rate a bank actually applied is a fact the app cannot know, so the
  // field stays editable and the edited value is what gets saved.
  useEffect(() => {
    if (!isCrossCurrency) {
      setConvertedAmount('');
      return;
    }
    if (convertedTouched) {
      return;
    }
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setConvertedAmount('');
      return;
    }
    const converted = convertAmount(parsed, fromRate, toRate);
    // null means no rate is on file for this pair — leave the field
    // empty so the user types the figure rather than reading a zero as
    // if the app had an opinion.
    setConvertedAmount(converted == null ? '' : String(converted));
  }, [amount, isCrossCurrency, convertedTouched, fromRate, toRate]);

  const rateHint = useMemo(() => {
    if (!isCrossCurrency) {
      return null;
    }
    const pairRate = getPairRate(fromRate, toRate);
    const fromCode = accounts
      .find(a => String(a.id) === fromAccountId)
      ?.balances.find(b => String(b.currencyId) === currencyId)?.currencyCode;
    const toCode = accounts
      .find(a => String(a.id) === toAccountId)
      ?.balances.find(b => String(b.currencyId) === toCurrencyId)?.currencyCode;
    if (pairRate == null) {
      return `No saved rate for ${fromCode ?? 'this pair'} → ${
        toCode ?? ''
      }. Enter the converted amount yourself, or set a rate in Settings › Exchange rates.`;
    }
    return `1 ${fromCode ?? ''} = ${pairRate} ${
      toCode ?? ''
    } · edit in Settings › Exchange rates`;
  }, [
    isCrossCurrency,
    fromRate,
    toRate,
    accounts,
    fromAccountId,
    currencyId,
    toAccountId,
    toCurrencyId,
  ]);

  // One list, two consumers: canSave below is "is it empty?", and
  // fieldErrors turns the same list into per-control outlines once the
  // user has actually pressed Transfer.
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!fromAccountId) {
      missing.push('fromAccountId');
    }
    if (!currencyId) {
      missing.push('currencyId');
    }
    if (!toAccountId) {
      missing.push('toAccountId');
    }
    if (!toCurrencyId) {
      missing.push('toCurrencyId');
    }
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      missing.push('amount');
    }
    // Only a field at all when the two currencies differ.
    if (
      isCrossCurrency &&
      (!convertedAmount ||
        Number.isNaN(Number(convertedAmount)) ||
        Number(convertedAmount) <= 0)
    ) {
      missing.push('convertedAmount');
    }
    return missing;
  }, [
    fromAccountId,
    currencyId,
    toAccountId,
    toCurrencyId,
    amount,
    convertedAmount,
    isCrossCurrency,
  ]);

  const fieldErrors = useFieldErrors(missingFields);
  const canSave = missingFields.length === 0;

  // Read through a ref so the callbacks below can reveal or clear the
  // outlines without listing fieldErrors — whose identity changes on
  // every keystroke — as a dependency.
  const fieldErrorsRef = useRef(fieldErrors);
  fieldErrorsRef.current = fieldErrors;

  const resetForm = useCallback(() => {
    fieldErrorsRef.current.reset();
    setFromAccountId('');
    setCurrencyId('');
    setToAccountId('');
    setToCurrencyId('');
    setAmount('');
    setConvertedAmount('');
    setConvertedTouched(false);
    setDate(formatDateString(new Date()));
  }, []);

  const openTransferModal = useCallback(
    async (options?: OpenTransferOptions) => {
      resetForm();
      setToTypeFilter(options?.toType ?? null);
      setTitle(options?.title ?? 'Transfer');
      const allOptions = await getTransferableAccounts();
      setFromOptions(
        options?.fromType
          ? allOptions.filter(a => a.type === options.fromType)
          : allOptions,
      );
      setVisible(true);
    },
    [resetForm],
  );

  // Arriving here via the FAB's "Withdraw"/"Transfer" actions —
  // routeParams is only ever set for those two navigations. Withdraw
  // constrains the sheet to Bank→Cash, matching "move money from a bank
  // account to cash" exactly rather than exposing every account type.
  // clearRouteParams runs right after so navigating back here later (tab
  // bar, "Add" again) never reopens the sheet unexpectedly.
  useEffect(() => {
    if (routeParams?.withdrawMode) {
      openTransferModal({
        fromType: 'Bank',
        toType: 'Cash',
        title: 'Withdraw to Cash',
      });
      clearRouteParams();
    } else if (routeParams?.openTransfer) {
      openTransferModal();
      clearRouteParams();
    }
    // Deliberately keyed only on the two route-param flags, same as the
    // original — openTransferModal/clearRouteParams are read for their
    // current closures, not reasons to re-fire this on their own identity
    // changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams?.withdrawMode, routeParams?.openTransfer]);

  const performTransfer = useCallback(
    async (parsedAmount: number, parsedToAmount: number) => {
      await runAction(async () => {
        await createTransfer({
          fromAccountId: Number(fromAccountId),
          toAccountId: Number(toAccountId),
          amount: parsedAmount,
          currencyId: Number(currencyId),
          toCurrencyId: Number(toCurrencyId),
          toAmount: parsedToAmount,
          date,
        });
        setVisible(false);
        await onSaved?.();
      }, 'Cannot transfer');
    },
    [
      runAction,
      fromAccountId,
      toAccountId,
      currencyId,
      toCurrencyId,
      date,
      onSaved,
      createTransfer,
    ],
  );

  const handleTransferSubmit = useCallback(() => {
    // The save button is muted but pressable while the form is
    // incomplete (see BottomSheetModal's footer), so this is the path an
    // incomplete press takes — reveal the outlines rather than only
    // showing an alert the user then has to map back onto the form.
    if (missingFields.length > 0) {
      fieldErrorsRef.current.reveal();
    }
    if (!fromAccountId || !toAccountId || !currencyId || !toCurrencyId) {
      Alert.alert(
        'Missing information',
        'Select both accounts and both currencies.',
      );
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a transfer amount greater than zero.');
      return;
    }
    // Same currency both sides: the two amounts are the same number by
    // definition, so the converted field is never shown and never read.
    const parsedToAmount = isCrossCurrency
      ? Number(convertedAmount)
      : parsedAmount;
    if (
      isCrossCurrency &&
      (!convertedAmount ||
        Number.isNaN(parsedToAmount) ||
        parsedToAmount <= 0)
    ) {
      Alert.alert(
        'Invalid converted amount',
        'Enter the amount that will land in the destination account.',
      );
      return;
    }
    // Real accounts can go negative — this is a warning, not a hard
    // block, per the Stage 11 spec. Computed from the same currentBalance
    // already loaded for display, not a fresh query, and always against
    // the FROM side, which is the only side money leaves.
    const fromAccount = accounts.find(a => String(a.id) === fromAccountId);
    const fromBalanceRow = fromAccount?.balances.find(
      b => String(b.currencyId) === currencyId,
    );
    const fromBalance = fromBalanceRow?.currentBalance ?? 0;
    const resultingBalance = fromBalance - parsedAmount;
    if (resultingBalance < 0) {
      Alert.alert(
        'This will leave the account negative',
        `This will leave ${fromAccount?.name ?? 'the account'} at ${formatAmount(
          resultingBalance,
          fromBalanceRow?.currencyCode ?? '',
        )}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => performTransfer(parsedAmount, parsedToAmount),
          },
        ],
      );
      return;
    }
    performTransfer(parsedAmount, parsedToAmount);
  }, [
    fromAccountId,
    toAccountId,
    currencyId,
    toCurrencyId,
    amount,
    convertedAmount,
    isCrossCurrency,
    accounts,
    performTransfer,
    missingFields,
  ]);


  const fromCurrencyOptions = useMemo(() => {
    const fromAccount = accounts.find(a => String(a.id) === fromAccountId);
    return fromAccount?.balances ?? [];
  }, [accounts, fromAccountId]);

  // "BOC: 1,200.00 USD · NTB: 45,000.00 LKR" — each side shown in its
  // OWN currency now, since the two can differ. Reading a destination
  // balance in the source's currency would be meaningless for a
  // conversion.
  const summaryText = useMemo(() => {
    if (!fromAccountId || !currencyId) {
      return null;
    }
    const fromAccount = accounts.find(a => String(a.id) === fromAccountId);
    const fromBalanceRow = fromAccount?.balances.find(
      b => String(b.currencyId) === currencyId,
    );
    const toAccount = toAccountId
      ? accounts.find(a => String(a.id) === toAccountId)
      : undefined;
    const toBalanceRow = toCurrencyId
      ? toAccount?.balances.find(b => String(b.currencyId) === toCurrencyId)
      : undefined;
    const fromCode = fromBalanceRow?.currencyCode ?? '';
    const fromLine = `${fromAccount?.name ?? 'From'}: ${
      fromBalanceRow?.currentBalance != null
        ? formatAmount(fromBalanceRow.currentBalance, fromCode, {
            hideCode: true,
          })
        : '—'
    } ${fromCode}`;
    if (!toAccount || !toBalanceRow) {
      return fromLine;
    }
    const toCode = toBalanceRow.currencyCode ?? '';
    return `${fromLine}  ·  ${toAccount.name}: ${formatAmount(
      toBalanceRow.currentBalance,
      toCode,
      { hideCode: true },
    )} ${toCode}`;
  }, [accounts, fromAccountId, currencyId, toAccountId, toCurrencyId]);

  const close = useCallback(() => setVisible(false), []);

  const setConvertedAmountFromUser = useCallback((value: string) => {
    setConvertedTouched(true);
    setConvertedAmount(value);
  }, []);

  return {
    visible,
    title,
    fromOptions,
    fromAccountId,
    setFromAccountId,
    fromCurrencyOptions,
    currencyId,
    setCurrencyId,
    toOptions,
    toAccountId,
    setToAccountId,
    toCurrencyOptions,
    toCurrencyId,
    setToCurrencyId,
    amount,
    setAmount,
    convertedAmount,
    setConvertedAmount: setConvertedAmountFromUser,
    isCrossCurrency,
    rateHint,
    date,
    setDate,
    canSave,
    isMissing: fieldErrors.isMissing,
    summaryText,
    openTransferModal,
    close,
    handleTransferSubmit,
  };
}
