import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import type { SettingsStackParamList } from '../navigation/types';
import Card from '../components/Card';
import BottomSheetModal from '../components/BottomSheetModal';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import LoadErrorState from '../components/common/LoadErrorState';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../components/common/SegmentedToggle';
import LoanCard from '../components/liabilities/LoanCard';
import LoanFormFields from '../components/liabilities/LoanFormFields';
import SettleLoanFields from '../components/liabilities/SettleLoanFields';
import { totalsByCurrency, formatCurrencyTotals } from '../utils/currencyTotals';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import type { LoanAccountType } from '../db/queries';
import { useLoanAccountsData } from '../hooks/useLoanAccountsData';
import { useLoanForm } from '../hooks/useLoanForm';
import { useSettleLoan } from '../hooks/useSettleLoan';
import { FAB_CLEARANCE } from '../theme/layout';

const COUNTERPART_ACCOUNT_TYPES = ['Bank', 'Cash', 'CryptoWallet'];

const TYPE_LABELS: Record<
  LoanAccountType,
  { heading: string; add: string; edit: string }
> = {
  Liability: {
    heading: 'Liabilities (borrowed)',
    add: 'Add Liability',
    edit: 'Edit Liability',
  },
  Receivable: {
    heading: 'Receivables (lended)',
    add: 'Add Lend',
    edit: 'Edit Lend',
  },
};

// One sheet serves four jobs (see LoanFormFields), so its title and its
// confirm button say which one is happening — "Save" on a form headed
// "Add Lend" while it is actually about to fold money into an account
// that already exists would be the wrong promise.
function formTitle(mode: string, type: LoanAccountType): string {
  if (mode === 'edit') {
    return TYPE_LABELS[type].edit;
  }
  if (mode === 'topUp') {
    return type === 'Liability' ? 'Borrow more' : 'Lend more';
  }
  return TYPE_LABELS[type].add;
}

function formSaveLabel(mode: string): string {
  if (mode === 'edit') {
    return 'Save changes';
  }
  if (mode === 'topUp') {
    return 'Add to loan';
  }
  if (mode === 'reopen') {
    return 'Reopen';
  }
  return 'Save';
}

const LOAN_TYPE_OPTIONS: SegmentedToggleOption<LoanAccountType>[] = [
  { key: 'Liability', label: 'Liabilities' },
  { key: 'Receivable', label: 'Receivables' },
];

function LiabilitiesReceivablesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();
  const route =
    useRoute<RouteProp<SettingsStackParamList, 'LiabilitiesReceivables'>>();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<SettingsStackParamList, 'LiabilitiesReceivables'>
    >();

  const data = useLoanAccountsData({
    routeParams: route.params,
    clearRouteParams: () => navigation.setParams({ type: undefined }),
  });
  const {
    type,
    setType,
    activeLiabilities,
    activeReceivables,
    inactiveLoans,
    currencies,
    accounts,
    loading,
    totalOwedByAccountId,
    loans,
  } = data;

  const counterpartAccounts = accounts.filter(
    a => a.active && COUNTERPART_ACCOUNT_TYPES.includes(a.type),
  );

  const form = useLoanForm({
    type,
    loans,
    inactiveLoans,
    currencies,
    counterpartAccounts,
    tier,
    openPaywall,
  });
  const settle = useSettleLoan(counterpartAccounts);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled">
      <Card colors={colors} style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text
            style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
            TOTAL LIABILITIES
          </Text>
          <Text style={[typography.amountMono, styles.summaryValue, { color: colors.danger }]}>
            {formatCurrencyTotals(
              totalsByCurrency(activeLiabilities, row => row.currentBalance),
            )}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            style={[typography.eyebrow, styles.summaryLabel, { color: colors.textSecondary }]}>
            TOTAL RECEIVABLES
          </Text>
          <Text style={[typography.amountMono, styles.summaryValue, { color: colors.success }]}>
            {formatCurrencyTotals(
              totalsByCurrency(activeReceivables, row => row.currentBalance),
            )}
          </Text>
        </View>
      </Card>

      <SegmentedToggle
        options={LOAN_TYPE_OPTIONS}
        value={type}
        onChange={option => {
          setType(option);
          form.close();
        }}
      />

      <Text style={[typography.cardTitle, styles.heading, { color: colors.text }]}>
        {TYPE_LABELS[type].heading}
      </Text>

      <Pressable style={[styles.addButton, { borderColor: colors.primary }]} onPress={form.openAdd}>
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          {TYPE_LABELS[type].add}
        </Text>
      </Pressable>

      {data.loadFailed ? (
        <LoadErrorState what="your loans" onRetry={data.retry} />
      ) : loading ? (
        <EmptyState message="Loading..." />
      ) : loans.length === 0 ? (
        <EmptyState
          message={
            type === 'Liability'
              ? 'Nothing borrowed right now.'
              : 'Nothing lended out right now.'
          }
        />
      ) : (
        loans.map((loan, index) => (
          <LoanCard
            key={`${loan.accountId}-${loan.currencyId}`}
            loan={loan}
            index={index}
            type={type}
            totalOwed={totalOwedByAccountId[loan.accountId] ?? loan.principal}
            onSettle={() => settle.open(loan)}
            // useEntityFormModal keys its edit flow off row.id, which a
            // loan row does not have — accountId is its identity. See
            // LoanEditRow in hooks/useLoanForm.ts.
            onEdit={() => form.openEdit({ ...loan, id: loan.accountId })}
          />
        ))
      )}

      <BottomSheetModal
        visible={form.visible}
        onClose={form.close}
        onSave={form.submit}
        canSave={form.canSave}
        title={formTitle(form.mode, type)}
        saveLabel={formSaveLabel(form.mode)}>
        <LoanFormFields
          form={form}
          type={type}
          currencies={currencies}
          counterpartAccounts={counterpartAccounts}
        />
        <NumericInputAccessory />
      </BottomSheetModal>

      <BottomSheetModal
        visible={settle.target != null}
        onClose={settle.close}
        onSave={settle.submit}
        canSave={settle.canSave}
        title={settle.target ? `Settle — ${settle.target.counterpartyName}` : undefined}
        saveLabel="Save">
        <SettleLoanFields
          settle={settle}
          type={type}
          counterpartAccounts={counterpartAccounts}
          totalOwedByAccountId={totalOwedByAccountId}
        />
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
    paddingBottom: FAB_CLEARANCE,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 12,
  },
  summaryLabel: {
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: scaleFont(15),
  },
  heading: {
    marginTop: 20,
    marginBottom: 10,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  addButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default LiabilitiesReceivablesScreen;
