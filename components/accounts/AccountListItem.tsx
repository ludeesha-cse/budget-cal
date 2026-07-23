import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Pencil, Trash2 } from 'lucide-react-native';
import Card from '../Card';
import PremiumGate from '../PremiumGate';
import ActionButtons from '../common/ActionButtons';
import AddCurrencyForm from './AddCurrencyForm';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { creditCardDebt } from '../../utils/balanceMath';
import type {
  AccountBalanceRow,
  AccountWithBalances,
  CurrencyRow,
} from '../../hooks/useAccounts';
import type { UseAddCurrencyResult } from '../../hooks/useAddCurrency';

const CREDIT_CARD_TYPE = 'CreditCard';

function accentColorFor(type: string, colors: ThemeColors): string {
  if (type === CREDIT_CARD_TYPE) {
    return colors.danger;
  }
  if (type === 'Liability' || type === 'Receivable') {
    return colors.warning;
  }
  return colors.primary;
}

type Props = {
  item: AccountWithBalances;
  currencies: CurrencyRow[];
  addCurrency: UseAddCurrencyResult;
  onEdit: (account: AccountWithBalances) => void;
  onClose: (account: AccountWithBalances) => void;
  onDelete: (id: number) => void;
  onUpdateBalance: (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => void;
  onPayOffCard: (
    account: AccountWithBalances,
    balance: AccountBalanceRow,
  ) => void;
};

// One account card in the list — the caller (AccountsScreen) is
// responsible for the `key` prop on each instance, same as any other
// list-row component in this app.
function AccountListItem({
  item,
  currencies,
  addCurrency,
  onEdit,
  onClose,
  onDelete,
  onUpdateBalance,
  onPayOffCard,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    addCurrencyAccountId,
    addCurrencyCurrencyId,
    setAddCurrencyCurrencyId,
    addCurrencyBalance,
    setAddCurrencyBalance,
    toggleAddCurrency,
    handleAddCurrencySubmit,
  } = addCurrency;

  const availableCurrencies = currencies.filter(
    c => !item.balances.some(b => b.currencyId === c.id),
  );
  const isCreditCard = item.type === CREDIT_CARD_TYPE;
  const accent = accentColorFor(item.type, colors);
  const isExpanded = addCurrencyAccountId === item.id;

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
                onPress={() => onUpdateBalance(item, b)}>
                <Text
                  style={[
                    typography.amountMono,
                    styles.balanceChip,
                    { borderColor: colors.border, color: colors.text },
                  ]}>
                  {isCreditCard
                    ? `${b.currencyCode} owes ${formatAmount(creditCardDebt(b.currentBalance), b.currencyCode, { hideCode: true })}`
                    : formatAmount(b.currentBalance, b.currencyCode)}
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
                onPress={() => onPayOffCard(item, b)}>
                <Text style={[styles.outlinePillButtonText, { color: colors.danger }]}>
                  Pay Off Card ({b.currencyCode})
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <ActionButtons
          items={[
            { key: 'edit', icon: Pencil, label: 'Edit', onPress: () => onEdit(item) },
            { key: 'close', icon: CheckCircle2, label: 'Close', onPress: () => onClose(item) },
            { key: 'delete', icon: Trash2, label: 'Delete', tone: 'danger', onPress: () => onDelete(item.id) },
          ]}
        />

        <Pressable
          onPress={() => toggleAddCurrency(item.id, availableCurrencies)}>
          <Text style={[styles.addCurrencyLink, { color: colors.primary }]}>
            {isExpanded ? 'Cancel' : '+ Add Currency'}
          </Text>
        </Pressable>

        {isExpanded && (
          <AddCurrencyForm
            availableCurrencies={availableCurrencies}
            currencyId={addCurrencyCurrencyId}
            onCurrencyIdChange={setAddCurrencyCurrencyId}
            balance={addCurrencyBalance}
            onBalanceChange={setAddCurrencyBalance}
            onSubmit={() => handleAddCurrencySubmit(item.id)}
            canSave={addCurrency.canSave}
            isMissing={addCurrency.isMissing}
            error={addCurrency.error}
          />
        )}
      </View>
    </Card>
  );

  return (
    <View>
      {isCreditCard ? (
        <PremiumGate label="Credit cards are a Premium feature.">
          {rowContent}
        </PremiumGate>
      ) : (
        rowContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  addCurrencyLink: {
    marginTop: 8,
    fontWeight: '600',
  },
  payOffRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
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
});

export default AccountListItem;
