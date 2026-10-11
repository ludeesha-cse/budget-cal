import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Card from '../components/Card';
import MonthYearPicker from '../components/MonthYearPicker';
import CurrencyTabs from '../components/common/CurrencyTabs';
import {
  useBudgetCurrencyOptions,
  useCategories,
  useCategoryBudgetsForMonth,
  useSpendingByCategory,
} from '../hooks/queries';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';
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
import {
  useUpsertCategoryBudget as useUpsertCategoryBudgetMutation,
} from '../hooks/queries';
import { SCREEN_BOTTOM_CLEARANCE } from '../theme/layout';

function CategoryBudgetsScreen(): React.JSX.Element {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const upsertCategoryBudget = useUpsertCategoryBudgetMutation();
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  // null until the options query resolves a starting tab — see the same
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

  // The amounts field used to be clobbered by load() firing on every
  // focus, including a plain tab-switch-away-and-back with no month or
  // currency change — this ref is what protected an in-progress, unsaved
  // edit from that. It is still needed for the same reason: a background
  // refetch (or an invalidation from a write elsewhere) can deliver new
  // budget rows while the user is mid-edit, and those must not overwrite
  // what is being typed. Read as a ref, not a dependency, so toggling
  // edit mode doesn't itself re-seed the fields.
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = editGate.isEditing;
  }, [editGate.isEditing]);

  const selectedMonth = `${year}-${month}`;

  // All app currencies are offered as tabs here (not just ones with
  // existing spending) — unlike ExpensesByTypeScreen/Reports, this screen
  // is for setting budgets, and a user should be able to plan a budget in
  // a currency before ever spending in it (e.g. budgeting ahead for a
  // trip). getBudgetCurrencyOptions() already returns default-currency
  // first, so the initial tab lands on the default currency.
  const { data: categories } = useCategories();
  const { data: currencyOptions } = useBudgetCurrencyOptions();

  const resolvedCurrencyId = useMemo(() => {
    if (!currencyOptions) {
      return currencyId;
    }
    if (currencyId != null && currencyOptions.some(c => c.id === currencyId)) {
      return currencyId;
    }
    return currencyOptions[0]?.id ?? null;
  }, [currencyOptions, currencyId]);

  useEffect(() => {
    if (resolvedCurrencyId !== currencyId) {
      setCurrencyId(resolvedCurrencyId);
    }
  }, [resolvedCurrencyId, currencyId]);

  const currencyCode =
    (currencyOptions ?? []).find(option => option.id === currencyId)?.code ?? '';

  const { data: existingBudgets } = useCategoryBudgetsForMonth(
    selectedMonth,
    resolvedCurrencyId,
  );

  // Seeds the editable amount fields from whatever this month/currency
  // pair has saved — the same assignment load() used to make, now driven
  // by the query resolving. Every (month, currency) pair is its own cache
  // entry, so switching tabs or months re-reads nothing already seen.
  useEffect(() => {
    if (isEditingRef.current) {
      return;
    }
    const byCategory: Record<number, string> = {};
    for (const budget of existingBudgets ?? []) {
      byCategory[budget.categoryId] = String(budget.amount);
    }
    setAmounts(byCategory);
  }, [existingBudgets, selectedMonth, resolvedCurrencyId]);

  const [startDate, endDate] = useMemo(() => {
    const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
    const lastDay = clampDayToMonth(yearNum, monthNum, 31);
    return [
      `${selectedMonth}-01`,
      `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
    ];
  }, [selectedMonth]);

  const { data: spendingRows } = useSpendingByCategory(
    startDate,
    endDate,
    resolvedCurrencyId,
  );

  const spentByCategory = useMemo(() => {
    const byCategory: Record<number, number> = {};
    for (const row of spendingRows ?? []) {
      if (row.categoryId != null) {
        byCategory[row.categoryId] = row.total;
      }
    }
    return byCategory;
  }, [spendingRows]);

  // Clearing the "saved" banner used to happen inside load(); it belongs
  // to the month/currency selection, not to any database read.
  useEffect(() => {
    setSavedMessage(null);
  }, [selectedMonth, resolvedCurrencyId]);

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
    // No load() here any more: upsertCategoryBudget's mutation
    // invalidated every budget query this write affects, and awaiting it
    // above waited for those refetches.
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
    <KeyboardAwareScrollView
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
        style={styles.monthPicker}
      />

      {(currencyOptions ?? []).length > 1 && (
        <CurrencyTabs
          currencies={currencyOptions ?? []}
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

      {(categories ?? []).length === 0 ? (
        <EmptyState message="No categories yet." />
      ) : (
        (categories ?? []).map(item => {
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
    </KeyboardAwareScrollView>
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
    paddingBottom: SCREEN_BOTTOM_CLEARANCE,
  },
  title: {
    marginBottom: 12,
  },
  // The chip no longer carries its own margin (see MonthYearPicker), so
  // the gap below it that it used to provide lives here.
  monthPicker: {
    marginBottom: 8,
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
