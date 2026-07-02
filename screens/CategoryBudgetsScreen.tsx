import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import Card from '../components/Card';
import MonthYearPicker from '../components/MonthYearPicker';
import CurrencyTabs from '../components/common/CurrencyTabs';
import {
  getBudgetCurrencyOptions,
  getCategories,
  getCategoryBudgetsForMonth,
  getSpendingByCategory,
  upsertCategoryBudget,
  type CurrencyOption,
} from '../db/queries';
import { clampDayToMonth, getCurrentMonthString, getCurrentYearString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import { budgetStatusFor } from '../utils/statusColor';
import { formatAmount } from '../utils/formatAmount';
import { useEditGate } from '../hooks/useEditGate';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

function CategoryBudgetsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [spentByCategory, setSpentByCategory] = useState<Record<number, number>>({});
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  // null until the first load resolves a starting tab — see the same
  // pattern in useBudgetSettingsData/useReportData.
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Read-only until Edit is tapped, then Save only lights up once
  // something actually changed — see hooks/useEditGate.ts's own doc
  // comment for why this is a shared hook rather than screen-local state.
  const editGate = useEditGate<Record<number, string>>({
    value: amounts,
    onChange: setAmounts,
  });

  // load() (below) runs on every focus, including a plain tab-switch-
  // away-and-back with no month/currency change — without this guard it
  // would clobber an in-progress, unsaved edit the moment the user so
  // much as glanced at another tab. Read as a ref (not a load()
  // dependency) so toggling edit mode doesn't itself trigger a reload.
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = editGate.isEditing;
  }, [editGate.isEditing]);

  const selectedMonth = `${year}-${month}`;
  const currencyCode =
    currencyOptions.find(option => option.id === currencyId)?.code ?? '';

  // All app currencies are offered as tabs here (not just ones with
  // existing spending) — unlike ExpensesByTypeScreen/Reports, this screen
  // is for setting budgets, and a user should be able to plan a budget in
  // a currency before ever spending in it (e.g. budgeting ahead for a
  // trip). getBudgetCurrencyOptions() already returns default-currency
  // first, so the initial tab lands on the default currency.
  const load = useCallback(async () => {
    setSavedMessage(null);
    const [allCategories, options] = await Promise.all([
      getCategories(),
      getBudgetCurrencyOptions(),
    ]);
    setCategories(allCategories);
    setCurrencyOptions(options);

    const resolvedCurrencyId =
      currencyId != null && options.some(c => c.id === currencyId)
        ? currencyId
        : (options[0]?.id ?? null);
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }

    if (resolvedCurrencyId == null) {
      if (!isEditingRef.current) {
        setAmounts({});
      }
      setSpentByCategory({});
      return;
    }

    const existingBudgets = await getCategoryBudgetsForMonth(
      selectedMonth,
      resolvedCurrencyId,
    );
    const byCategory: Record<number, string> = {};
    for (const budget of existingBudgets) {
      byCategory[budget.categoryId] = String(budget.amount);
    }
    if (!isEditingRef.current) {
      setAmounts(byCategory);
    }

    const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
    const lastDay = clampDayToMonth(yearNum, monthNum, 31);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    const spendingRows = await getSpendingByCategory(
      startDate,
      endDate,
      resolvedCurrencyId,
    );
    const spendByCategory: Record<number, number> = {};
    for (const row of spendingRows) {
      if (row.categoryId != null) {
        spendByCategory[row.categoryId] = row.total;
      }
    }
    setSpentByCategory(spendByCategory);
  }, [selectedMonth, currencyId]);

  // Re-runs on focus and whenever `load` itself changes identity — which
  // happens whenever selectedMonth or currencyId changes (see load's own
  // dependency array) — so switching the month or the currency tab both
  // reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleAmountChange = (categoryId: number, value: string) => {
    setAmounts(current => ({ ...current, [categoryId]: value }));
    setSavedMessage(null);
  };

  const handleSaveAll = async () => {
    if (currencyId == null) {
      return;
    }
    // Same gap as BudgetSettingsScreen's Save button — the per-row amount
    // fields rely solely on the iOS-only numeric accessory bar to blur,
    // so without this the keyboard stays open (on both platforms) after
    // tapping Save while a field is still focused.
    Keyboard.dismiss();
    const entries = Object.entries(amounts).filter(
      ([, value]) => value.trim() !== '',
    );
    await Promise.all(
      entries.map(([categoryId, value]) => {
        const parsedAmount = Number(value);
        if (Number.isNaN(parsedAmount)) {
          return Promise.resolve();
        }
        return upsertCategoryBudget(
          selectedMonth,
          Number(categoryId),
          currencyId,
          parsedAmount,
        );
      }),
    );
    editGate.finishEdit();
    setSavedMessage('Category budgets saved');
    load();
  };

  const handleCancel = () => {
    editGate.cancelEdit();
    setSavedMessage(null);
  };

  return (
    // A plain View + one unbounded FlatList used to sit here, with the
    // Save button living outside it — fine for the list itself (a
    // FlatList is its own scroll container), but not for the Edit/
    // Cancel/Save row, which needs to be part of the same scrollable
    // content rather than a separate fixed element for it to reliably
    // stay reachable and end up at the bottom, matching
    // BudgetSettingsScreen's own fix for the identical shape of bug.
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Category Budgets
      </Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

      {currencyOptions.length > 1 && (
        <CurrencyTabs
          currencies={currencyOptions}
          value={currencyId}
          onChange={setCurrencyId}
          style={styles.currencyTabs}
        />
      )}

      <Text
        style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
        BUDGETS FOR {selectedMonth}
        {currencyCode ? ` · ${currencyCode}` : ''}
      </Text>

      {savedMessage && (
        <View style={[styles.successBanner, { backgroundColor: colors.successSoft }]}>
          <Check size={14} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
            {savedMessage}
          </Text>
        </View>
      )}

      {categories.length === 0 ? (
        <EmptyState message="No categories yet." />
      ) : (
        categories.map(item => {
          const budgetAmount = Number(amounts[item.id] ?? 0);
          const spent = spentByCategory[item.id] ?? 0;
          const hasBudget = (amounts[item.id] ?? '').trim() !== '' && budgetAmount > 0;
          const percent = hasBudget ? Math.min(100, (spent / budgetAmount) * 100) : 0;
          const statusColor = hasBudget
            ? budgetStatusFor(spent, budgetAmount, colors).text
            : colors.border;
          return (
            <Card key={item.id} colors={colors} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.background,
                    },
                    !editGate.isEditing && {
                      backgroundColor: colors.neutralSoft,
                      color: colors.textSecondary,
                    },
                  ]}
                  editable={editGate.isEditing}
                  value={amounts[item.id] ?? ''}
                  onChangeText={value => handleAmountChange(item.id, value)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <ProgressBar
                percent={percent}
                color={statusColor}
                style={styles.progressTrack}
              />
              <Text style={[typography.amountMono, styles.rowSpent, { color: colors.textSecondary }]}>
                {hasBudget
                  ? `Spent ${formatAmount(spent, currencyCode, {
                      hideCode: true,
                    })} of ${formatAmount(budgetAmount, currencyCode, {
                      hideCode: true,
                    })}`
                  : `Spent ${formatAmount(spent, currencyCode, {
                      hideCode: true,
                    })} · no budget set`}
              </Text>
            </Card>
          );
        })
      )}

      {editGate.isEditing ? (
        <View style={styles.editActionRow}>
          <Pressable
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={handleCancel}>
            <Text style={[styles.cancelButtonText, { color: colors.text }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            disabled={!editGate.isDirty}
            style={[
              styles.saveButton,
              styles.actionButtonGrow,
              { backgroundColor: !editGate.isDirty ? colors.neutralSoft : colors.primary },
            ]}
            onPress={handleSaveAll}>
            <Text
              style={[
                styles.saveButtonText,
                { color: !editGate.isDirty ? colors.textSecondary : colors.primaryText },
              ]}>
              Save All
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={editGate.startEdit}>
          <Text style={[styles.saveButtonText, { color: colors.primaryText }]}>
            Edit
          </Text>
        </Pressable>
      )}

      <NumericInputAccessory />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Clears the floating tab bar pill + FAB (see App.tsx), same as every
    // other scrollable top-level screen.
    paddingBottom: 120,
  },
  title: {
    marginBottom: 12,
  },
  currencyTabs: {
    marginTop: 12,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  successText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  row: {
    padding: 14,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    width: 110,
    textAlign: 'right',
  },
  progressTrack: {
    marginTop: 10,
  },
  rowSpent: {
    fontSize: scaleFont(12.5),
    marginTop: 6,
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButtonGrow: {
    flex: 1,
    marginTop: 0,
  },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});

export default CategoryBudgetsScreen;
