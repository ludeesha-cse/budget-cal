import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import CollapsiblePicker from '../components/CollapsiblePicker';
import {
  addAccountWithBalance,
  addCurrencyToAccount,
  closeAccount,
  deleteAccount,
  getAccountBalance,
  getAccountBalances,
  getActiveAccountCountByType,
  getAccounts,
  getCurrencies,
  updateAccount,
  updateAccountBalanceWithAudit,
} from '../db/queries';
import { useEntitlement } from '../hooks/useEntitlement';
import { usePaywall } from '../contexts/PaywallContext';
import { canAddAccount } from '../utils/entitlementChecks';
import { FREE_ACCOUNT_TYPES } from '../config/entitlements';
import { useTheme } from '../contexts/ThemeContext';

const ACCOUNT_TYPES = [
  'Cash',
  'Bank',
  'CreditCard',
  'CryptoWallet',
  'Receivable',
  'Liability',
] as const;

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

function AccountsScreen(): React.JSX.Element {
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
      openPaywall({
        reason: check.reason ?? `${type} accounts require Premium.`,
        onPurchaseSuccess: performCreate,
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

  // Closed accounts stay in the DB (and in `accounts` state, for anything
  // that still needs to look one up) but drop out of the visible list.
  const activeAccounts = accounts.filter(a => a.active);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled">
      {formVisible ? (
        <View style={styles.form}>
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
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />
            </>
          )}

          <View style={styles.formActions}>
            <Button
              title="Cancel"
              color={colors.primary}
              onPress={() => {
                setFormVisible(false);
                resetForm();
              }}
            />
            <Button
              title={editingId ? 'Update' : 'Add'}
              color={colors.primary}
              onPress={handleSubmit}
            />
          </View>
        </View>
      ) : (
        <Button title="Add Account" color={colors.primary} onPress={handleAddPress} />
      )}

      <View style={styles.list}>
        {activeAccounts.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No accounts yet.
          </Text>
        ) : (
          activeAccounts.map(item => {
            const availableCurrencies = currencies.filter(
              c => !item.balances.some(b => b.currencyId === c.id),
            );
            return (
              <View
                key={item.id}
                style={[styles.rowContainer, { borderBottomColor: colors.border }]}>
                <View style={styles.row}>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.rowName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {item.type}
                    </Text>
                    {item.balances.length > 0 ? (
                      <View style={styles.balanceChips}>
                        {item.balances.map(b => (
                          <Pressable
                            key={b.currencyId}
                            onPress={() => openUpdateBalance(item, b)}>
                            <Text
                              style={[
                                styles.balanceChip,
                                { borderColor: colors.primary, color: colors.primary },
                              ]}>
                              {b.currencyCode} {b.currentBalance.toFixed(2)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.rowBalance, { color: colors.textSecondary }]}>
                        No balances yet
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowActions}>
                    <Button
                      title="Edit"
                      color={colors.primary}
                      onPress={() => handleEditPress(item)}
                    />
                    <Button
                      title="Close"
                      color={colors.primary}
                      onPress={() => handleClose(item)}
                    />
                    <Button
                      title="Delete"
                      color={colors.danger}
                      onPress={() => handleDelete(item.id)}
                    />
                  </View>
                </View>

                <Pressable onPress={() => toggleAddCurrency(item.id)}>
                  <Text style={[styles.addCurrencyLink, { color: colors.primary }]}>
                    {addCurrencyAccountId === item.id
                      ? 'Cancel'
                      : '+ Add Currency'}
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
                          placeholder="Starting balance"
                          placeholderTextColor={colors.textSecondary}
                        />
                        <Button
                          title="Add"
                          color={colors.primary}
                          onPress={() => handleAddCurrencySubmit(item.id)}
                        />
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      <Modal
        visible={updateBalanceTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setUpdateBalanceTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            {updateBalanceTarget && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>
                  Update balance — {updateBalanceTarget.accountName} (
                  {updateBalanceTarget.currencyCode})
                </Text>
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

                <View style={styles.formActions}>
                  <Button
                    title="Cancel"
                    color={colors.primary}
                    onPress={() => setUpdateBalanceTarget(null)}
                  />
                  <Button
                    title="Save"
                    color={colors.primary}
                    onPress={handleUpdateBalanceSubmit}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  form: {
    marginBottom: 16,
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
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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
  rowContainer: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowDetails: {
    flex: 1,
  },
  rowName: {
    fontWeight: '600',
  },
  rowBalance: {
    marginTop: 2,
  },
  balanceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
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
  rowActions: {
    flexDirection: 'row',
    gap: 4,
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
});

export default AccountsScreen;
