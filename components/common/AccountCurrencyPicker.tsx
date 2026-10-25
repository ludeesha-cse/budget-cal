import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Plus } from 'lucide-react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import FieldErrorText from './FieldErrorText';
import { labelForId } from '../../utils/pickerLabels';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import type { RootTabParamList } from '../../navigation/types';
import type { getAccountBalances, getAccounts } from '../../db/queries';

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
type AccountBalanceRow = Awaited<ReturnType<typeof getAccountBalances>>[number];

type Props = {
  accounts: AccountRow[];
  accountId: number | null;
  onAccountIdChange: (accountId: number) => void;
  accountBalances: AccountBalanceRow[];
  currencyId: number | null;
  onCurrencyIdChange: (currencyId: number) => void;
  accountInvalid?: boolean;
  currencyInvalid?: boolean;
  // A sentence about the chosen account that is not "you left it blank" —
  // "Insufficient balance, transfer or withdraw to the account first",
  // "Cash in wallet doesn't hold USD yet — …". Shown in red directly
  // under the account picker. The form clears it when the account or
  // the amount changes.
  accountError?: string | null;
  // The same for the currency ("USD is turned off …"). Shown under the
  // currency picker, or under the account picker when the account has
  // only one currency and so no currency picker is shown.
  currencyError?: string | null;
  // The account whose balances are in `accountBalances`, or null while
  // they load (see useAccountCurrency). Only used to avoid flashing the
  // "holds no currency" state while loading; omit to never show it.
  balancesLoadedFor?: number | null;
};

// The ACCOUNT picker (always shown) + CURRENCY picker (only shown once an
// account has more than one currency to choose from) — shared byte-for-byte
// between TransactionForm and IncomeForm.
//
// It also owns the two "you can't pick anything here" states, each naming
// exactly what is missing and offering the form that fixes it: no
// account to use at all, or an account that holds no currency yet.
function AccountCurrencyPicker({
  accounts,
  accountId,
  onAccountIdChange,
  accountBalances,
  currencyId,
  onCurrencyIdChange,
  accountInvalid = false,
  currencyInvalid = false,
  accountError = null,
  currencyError = null,
  balancesLoadedFor,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const selectedAccount = accounts.find(a => a.id === accountId);
  const selectedAccountName = labelForId(
    accounts,
    accountId,
    'name',
    'Select account',
  );
  const holdsNoCurrency =
    selectedAccount != null &&
    balancesLoadedFor === selectedAccount.id &&
    accountBalances.length === 0;
  const showCurrencyPicker = accountBalances.length > 1;

  const actionButton = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.actionButton, { borderColor: colors.primary }]}>
      <Plus size={15} color={colors.primary} strokeWidth={2.5} />
      <Text style={[styles.actionButtonText, { color: colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <>
      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        ACCOUNT
      </Text>
      {accounts.length === 0 ? (
        <View>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            You don't have an open cash, bank, card or crypto account to use
            yet.
          </Text>
          {actionButton('Add an account', () =>
            navigation.navigate('Settings', {
              screen: 'Accounts',
              params: { openAddAccount: true },
            }),
          )}
        </View>
      ) : (
        <CollapsiblePicker
          displayLabel={selectedAccountName}
          selectedValue={accountId != null ? String(accountId) : ''}
          onValueChange={value => onAccountIdChange(Number(value))}
          items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
          label="Account"
          invalid={accountInvalid}
        />
      )}
      <FieldErrorText message={accountError} />
      {!showCurrencyPicker && <FieldErrorText message={currencyError} />}

      {holdsNoCurrency && selectedAccount && (
        <View>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {selectedAccount.name} has no currency yet, so it can't hold money.
          </Text>
          {actionButton(`Add a currency to ${selectedAccount.name}`, () =>
            navigation.navigate('Settings', {
              screen: 'Accounts',
              params: { setupAccountId: selectedAccount.id },
            }),
          )}
        </View>
      )}

      {showCurrencyPicker && (
        <>
          <Text
            style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
            CURRENCY
          </Text>
          <CollapsiblePicker
            displayLabel={labelForId(
              accountBalances.map(b => ({ ...b, id: b.currencyId })),
              currencyId,
              'currencyCode',
              'Select currency',
            )}
            selectedValue={currencyId != null ? String(currencyId) : ''}
            onValueChange={value => onCurrencyIdChange(Number(value))}
            items={accountBalances.map(b => ({
              label: `${b.currencyCode} — ${b.currencyName}`,
              value: String(b.currencyId),
            }))}
            label="Currency"
            invalid={currencyInvalid}
          />
          <FieldErrorText message={currencyError} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  actionButtonText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default AccountCurrencyPicker;
