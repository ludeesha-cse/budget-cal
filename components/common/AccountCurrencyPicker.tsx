import React from 'react';
import { StyleSheet, Text } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import { labelForId } from '../../utils/pickerLabels';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
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
};

// The ACCOUNT picker (always shown) + CURRENCY picker (only shown once an
// account has more than one currency to choose from) — shared byte-for-byte
// between TransactionForm and IncomeForm.
function AccountCurrencyPicker({
  accounts,
  accountId,
  onAccountIdChange,
  accountBalances,
  currencyId,
  onCurrencyIdChange,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  const selectedAccountName = labelForId(
    accounts,
    accountId,
    'name',
    'Select account',
  );

  return (
    <>
      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        ACCOUNT
      </Text>
      <CollapsiblePicker
        displayLabel={selectedAccountName}
        selectedValue={accountId != null ? String(accountId) : ''}
        onValueChange={value => onAccountIdChange(Number(value))}
        items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
      />

      {accountBalances.length > 1 && (
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
          />
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
});

export default AccountCurrencyPicker;
