import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { createTransfer, getTransferableAccounts } from '../db/queries';
import { formatDateString } from '../utils/date';
import { formatAmount } from '../utils/formatAmount';
import { useAsyncAction } from './useAsyncAction';
import type { AccountBalanceRow, AccountWithBalances } from './useAccounts';

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
  onSaved: () => void | Promise<void>;
}

export interface UseTransferResult {
  visible: boolean;
  title: string;
  fromOptions: TransferableAccountRow[];
  fromAccountId: string;
  setFromAccountId: (value: string) => void;
  // Replaces the transfer modal JSX's first inline IIFE — the from
  // account's own currency balances, memoized instead of re-derived from
  // `accounts` on every render.
  fromCurrencyOptions: AccountBalanceRow[];
  currencyId: string;
  setCurrencyId: (value: string) => void;
  toOptions: TransferableAccountRow[];
  toAccountId: string;
  setToAccountId: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  canSave: boolean;
  // Replaces the transfer modal JSX's second inline IIFE — the
  // "From: X · To: Y" balance preview line, or null before there's enough
  // selected to show one.
  summaryText: string | null;
  openTransferModal: (options?: OpenTransferOptions) => Promise<void>;
  close: () => void;
  handleTransferSubmit: () => void;
}

// Transfers are a free-tier feature (Stage 11) — no PremiumGate around
// any of this, unlike usePayOffCard's credit-card state. Also handles the
// FAB's Withdraw/Transfer deep link (route.params), since opening the
// sheet is this hook's own responsibility either way.
export function useTransfer(deps: UseTransferDeps): UseTransferResult {
  const { accounts, routeParams, clearRouteParams, onSaved } = deps;
  const runAction = useAsyncAction();

  const [visible, setVisible] = useState(false);
  const [fromOptions, setFromOptions] = useState<TransferableAccountRow[]>([]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [toOptions, setToOptions] = useState<TransferableAccountRow[]>([]);
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDateString(new Date()));
  // Set only for Withdraw (the FAB's constrained variant of this same
  // sheet) — narrows the "to" picker to a single account type. The "from"
  // side doesn't need its own persisted filter past the initial fetch
  // since fromOptions is filtered once at open time and never re-queried
  // afterward (unlike "to", which re-queries per currency change below).
  const [toTypeFilter, setToTypeFilter] = useState<string | null>(null);
  const [title, setTitle] = useState('Transfer');

  // Switching the from-account resets currency/to-account rather than
  // leaving a stale, possibly-invalid selection — mirrors
  // TransactionForm's account-switch effect (Stage 7c).
  useEffect(() => {
    setCurrencyId('');
    setToAccountId('');
  }, [fromAccountId]);

  // Re-fetches the to-account list from the query layer itself (not
  // derived from local state) every time the chosen currency changes —
  // this is the exact call the build order specifies
  // (getTransferableAccounts(currencyId)), so the currency-holding filter
  // is always the query's own rules, not a client-side re-guess of them.
  useEffect(() => {
    if (!currencyId) {
      setToOptions([]);
      return;
    }
    let cancelled = false;
    getTransferableAccounts(Number(currencyId)).then(rows => {
      if (cancelled) {
        return;
      }
      let filtered = rows.filter(row => String(row.id) !== fromAccountId);
      if (toTypeFilter) {
        filtered = filtered.filter(row => row.type === toTypeFilter);
      }
      setToOptions(filtered);
    });
    return () => {
      cancelled = true;
    };
  }, [currencyId, fromAccountId, toTypeFilter]);

  const openTransferModal = useCallback(async (options?: OpenTransferOptions) => {
    setFromAccountId('');
    setCurrencyId('');
    setToAccountId('');
    setAmount('');
    setDate(formatDateString(new Date()));
    setToTypeFilter(options?.toType ?? null);
    setTitle(options?.title ?? 'Transfer');
    const allOptions = await getTransferableAccounts();
    setFromOptions(
      options?.fromType
        ? allOptions.filter(a => a.type === options.fromType)
        : allOptions,
    );
    setVisible(true);
  }, []);

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
    async (parsedAmount: number) => {
      await runAction(async () => {
        await createTransfer({
          fromAccountId: Number(fromAccountId),
          toAccountId: Number(toAccountId),
          amount: parsedAmount,
          currencyId: Number(currencyId),
          date,
        });
        setVisible(false);
        await onSaved();
      }, 'Cannot transfer');
    },
    [runAction, fromAccountId, toAccountId, currencyId, date, onSaved],
  );

  const handleTransferSubmit = useCallback(() => {
    if (!fromAccountId || !toAccountId || !currencyId) {
      Alert.alert('Missing information', 'Select both accounts and a currency.');
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a transfer amount greater than zero.');
      return;
    }
    // Real accounts can go negative — this is a warning, not a hard
    // block, per the Stage 11 spec. Computed from the same currentBalance
    // already loaded for display, not a fresh query.
    const fromAccount = accounts.find(a => String(a.id) === fromAccountId);
    const fromBalanceRow = fromAccount?.balances.find(
      b => String(b.currencyId) === currencyId,
    );
    const fromBalance = fromBalanceRow?.currentBalance ?? 0;
    const resultingBalance = fromBalance - parsedAmount;
    if (resultingBalance < 0) {
      Alert.alert(
        'This will leave the account negative',
        `This will leave ${fromAccount?.name ?? 'the account'} at ${formatAmount(resultingBalance, fromBalanceRow?.currencyCode ?? '')}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => performTransfer(parsedAmount) },
        ],
      );
      return;
    }
    performTransfer(parsedAmount);
  }, [fromAccountId, toAccountId, currencyId, amount, accounts, performTransfer]);

  const canSave =
    Boolean(fromAccountId) &&
    Boolean(currencyId) &&
    Boolean(toAccountId) &&
    amount !== '' &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0;

  const fromCurrencyOptions = useMemo(() => {
    const fromAccount = accounts.find(a => String(a.id) === fromAccountId);
    return fromAccount?.balances ?? [];
  }, [accounts, fromAccountId]);

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
    const toBalanceRow = toAccount?.balances.find(
      b => String(b.currencyId) === currencyId,
    );
    const currencyCode = fromBalanceRow?.currencyCode ?? '';
    const fromLine = `${fromAccount?.name ?? 'From'}: ${
      fromBalanceRow?.currentBalance != null
        ? formatAmount(fromBalanceRow.currentBalance, currencyCode, {
            hideCode: true,
          })
        : '—'
    } ${currencyCode}`;
    const toLine = toAccount
      ? `  ·  ${toAccount.name}: ${
          toBalanceRow?.currentBalance != null
            ? formatAmount(toBalanceRow.currentBalance, currencyCode, {
                hideCode: true,
              })
            : '—'
        } ${currencyCode}`
      : '';
    return `${fromLine}${toLine}`;
  }, [accounts, fromAccountId, currencyId, toAccountId]);

  const close = useCallback(() => setVisible(false), []);

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
    amount,
    setAmount,
    date,
    setDate,
    canSave,
    summaryText,
    openTransferModal,
    close,
    handleTransferSubmit,
  };
}
