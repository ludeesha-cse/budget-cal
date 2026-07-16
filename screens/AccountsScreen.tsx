import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, Plus, Repeat, TrendingUp } from 'lucide-react-native';
import Card from '../components/Card';
import NumericInputAccessory from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import AccountListItem from '../components/accounts/AccountListItem';
import AccountFormModal from '../components/accounts/AccountFormModal';
import UpdateBalanceModal from '../components/accounts/UpdateBalanceModal';
import PayOffCardModal from '../components/accounts/PayOffCardModal';
import TransferModal from '../components/accounts/TransferModal';
import type { SettingsStackParamList } from '../navigation/types';
import { getSavingsGoalsForAccount } from '../db/queries';

import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useAccounts } from '../hooks/useAccounts';
import type { AccountWithBalances } from '../hooks/useAccounts';
import { useAccountForm } from '../hooks/useAccountForm';
import { useAddCurrency } from '../hooks/useAddCurrency';
import { useUpdateBalance } from '../hooks/useUpdateBalance';
import { usePayOffCard } from '../hooks/usePayOffCard';
import { useTransfer } from '../hooks/useTransfer';
import {
  useCloseAccount as useCloseAccountMutation,
  useDeleteAccount as useDeleteAccountMutation,
} from '../hooks/queries';

// Excluded Liability/Receivable from account screen to avoid confusion
const ACCOUNT_SECTIONS: { label: string; types: string[] }[] = [
  { label: 'Bank & Cash', types: ['Cash', 'Bank'] },
  { label: 'Crypto', types: ['CryptoWallet'] },
  { label: 'Credit Cards', types: ['CreditCard'] },
];

type Props = NativeStackScreenProps<SettingsStackParamList, 'Accounts'>;

function AccountsScreen({ route, navigation }: Props): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const closeAccount = useCloseAccountMutation();
  const deleteAccount = useDeleteAccountMutation();
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();
  const { tier } = useEntitlement();
  const { openPaywall } = usePaywall();

  const { accounts, currencies, activeAccounts } = useAccounts();
  const accountForm = useAccountForm({ currencies, tier, openPaywall });
  const addCurrency = useAddCurrency();
  const updateBalance = useUpdateBalance();
  const payOffCard = usePayOffCard(activeAccounts);
  const transfer = useTransfer({
    accounts,
    routeParams: route.params,
    clearRouteParams: () =>
      navigation.setParams({ withdrawMode: undefined, openTransfer: undefined }),
  });

  const handleDelete = (id: number) => {
    confirmDelete(
      'Delete account',
      'Are you sure you want to delete this account?',
      'Delete',
      () =>
        runAction(async () => {
          await deleteAccount(id);
        // No reload() here any more: the mutation above already
        // invalidated every query this write affects, and awaiting it
        // waits for those refetches — a second read would be redundant.
        }, 'Cannot delete account'),
    );
  };

  // Closing an account DELETES every savings goal saving into it — a
  // goal is defined by the account holding its money, and there is no
  // sensible state for one whose account is gone. So the goals are
  // fetched first and named in the prompt: "this deletes 2 goals" with
  // the names spelled out is a decision someone can actually make,
  // whereas discovering it afterwards is not. The query layer refuses
  // the close unless this flag is passed, so the warning cannot be
  // bypassed by another caller (see closeAccount in db/queries/accounts.ts).
  const handleClose = (account: AccountWithBalances) => {
    const isZeroBalance = account.balances.every(b => b.balance === 0);
    if (!isZeroBalance) {
      Alert.alert(
        'Cannot close account',
        'This account still has a nonzero balance in at least one currency. Transfer the remainder to another account or log a transaction accounting for it, then try again.',
      );
      return;
    }
    runAction(async () => {
      const linkedGoals = await getSavingsGoalsForAccount(account.id);
      const goalWarning =
        linkedGoals.length > 0
          ? `\n\nThis will also permanently delete ${
              linkedGoals.length === 1 ? 'this savings goal' : 'these savings goals'
            } and their funding history: ${linkedGoals
              .map(goal => goal.name)
              .join(', ')}. This cannot be undone.`
          : '';
      confirmDelete(
        linkedGoals.length > 0 ? 'Close account and delete goals?' : 'Close account',
        `Close ${account.name}? You can reopen it later from Stage 9's reuse flow.${goalWarning}`,
        linkedGoals.length > 0 ? 'Close and delete' : 'Close',
        () =>
          runAction(async () => {
            await closeAccount(account.id, {
              deleteLinkedSavingsGoals: linkedGoals.length > 0,
            });
          // No reload() here any more: the mutation above already
          // invalidated every query this write affects, and awaiting it
          // waits for those refetches — a second read would be redundant.
          }, 'Cannot close account'),
      );
    }, 'Cannot close account');
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
          onPress={accountForm.openAdd}>
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
          onPress={() => transfer.openTransferModal()}>
          <Repeat size={16} color={colors.text} />
          <Text style={[styles.outlinePillButtonText, { color: colors.text }]}>
            Transfer
          </Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {activeAccounts.length === 0 ? (
          <EmptyState message="No accounts yet." />
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
                .map(item => (
                  <AccountListItem
                    key={item.id}
                    item={item}
                    currencies={currencies}
                    addCurrency={addCurrency}
                    onEdit={accountForm.openEdit}
                    onClose={handleClose}
                    onDelete={handleDelete}
                    onUpdateBalance={updateBalance.openUpdateBalance}
                    onPayOffCard={payOffCard.openPayOffCard}
                  />
                ))}
            </View>
          ))
        )}
      </View>

      <AccountFormModal form={accountForm} currencies={currencies} tier={tier} />

      <Pressable onPress={() => navigation.navigate('NetWorth')}>
        <Card colors={colors} style={styles.netWorthLink}>
          <View
            style={[styles.netWorthLinkIcon, { backgroundColor: colors.primarySoft }]}>
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

      <UpdateBalanceModal state={updateBalance} />
      <PayOffCardModal state={payOffCard} />
      <TransferModal state={transfer} />

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
  list: {
    marginTop: 8,
  },
});

export default AccountsScreen;
