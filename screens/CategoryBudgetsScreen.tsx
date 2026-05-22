import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import Card from '../components/Card';
import MonthYearPicker from '../components/MonthYearPicker';
import {
  getCategories,
  getCategoryBudgetsForMonth,
  getDefaultCurrency,
  getSpendingByCategory,
  upsertCategoryBudget,
} from '../db/queries';
import { clampDayToMonth, getCurrentMonthString, getCurrentYearString } from '../utils/date';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../components/NumericInputAccessory';

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];

// Same three-tier read as Dashboard's own budget card (statusColorsFor) —
// duplicated locally rather than imported since Dashboard doesn't export
// it and pulling in a whole extra screen module just for one small color
// function isn't worth the coupling.
function statusColorFor(spent: number, budgetAmount: number, colors: ThemeColors): string {
  if (budgetAmount <= 0) {
    return colors.textSecondary;
  }
  const used = spent / budgetAmount;
  if (used > 1) {
    return colors.danger;
  }
  if (used >= 0.9) {
    return colors.warning;
  }
  return colors.success;
}

function CategoryBudgetsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [spentByCategory, setSpentByCategory] = useState<Record<number, number>>({});
  const [currencyCode, setCurrencyCode] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const selectedMonth = `${year}-${month}`;

  const load = useCallback(async () => {
    setSavedMessage(null);
    const [allCategories, existingBudgets, defaultCurrency] = await Promise.all([
      getCategories(),
      getCategoryBudgetsForMonth(selectedMonth),
      getDefaultCurrency(),
    ]);
    setCategories(allCategories);
    const byCategory: Record<number, string> = {};
    for (const budget of existingBudgets) {
      byCategory[budget.categoryId] = String(budget.amount);
    }
    setAmounts(byCategory);
    setCurrencyCode(defaultCurrency?.code ?? '');

    if (defaultCurrency) {
      const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
      const lastDay = clampDayToMonth(yearNum, monthNum, 31);
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const spendingRows = await getSpendingByCategory(startDate, endDate, defaultCurrency.id);
      const spendByCategory: Record<number, number> = {};
      for (const row of spendingRows) {
        if (row.categoryId != null) {
          spendByCategory[row.categoryId] = row.total;
        }
      }
      setSpentByCategory(spendByCategory);
    } else {
      setSpentByCategory({});
    }
  }, [selectedMonth]);

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
          parsedAmount,
        );
      }),
    );
    setSavedMessage('Category budgets saved');
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.screenTitle, styles.title, { color: colors.text }]}>
        Category Budgets
      </Text>
      <MonthYearPicker
        month={month}
        year={year}
        onMonthChange={setMonth}
        onYearChange={setYear}
      />

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

      <FlatList
        style={styles.list}
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => {
          const budgetAmount = Number(amounts[item.id] ?? 0);
          const spent = spentByCategory[item.id] ?? 0;
          const hasBudget = (amounts[item.id] ?? '').trim() !== '' && budgetAmount > 0;
          const percent = hasBudget ? Math.min(100, (spent / budgetAmount) * 100) : 0;
          const statusColor = hasBudget
            ? statusColorFor(spent, budgetAmount, colors)
            : colors.border;
          return (
            <Card colors={colors} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
                  ]}
                  value={amounts[item.id] ?? ''}
                  onChangeText={value => handleAmountChange(item.id, value)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View
                style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${percent}%`, backgroundColor: statusColor },
                  ]}
                />
              </View>
              <Text style={[typography.amountMono, styles.rowSpent, { color: colors.textSecondary }]}>
                {hasBudget
                  ? `Spent ${spent.toFixed(2)} of ${budgetAmount.toFixed(2)}`
                  : `Spent ${spent.toFixed(2)} · no budget set`}
              </Text>
            </Card>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No categories yet.
          </Text>
        }
      />

      <Pressable
        style={[styles.saveButton, { backgroundColor: colors.primary }]}
        onPress={handleSaveAll}>
        <Text style={[styles.saveButtonText, { color: colors.primaryText }]}>
          Save All
        </Text>
      </Pressable>

      <NumericInputAccessory />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 12,
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
  list: {
    marginTop: 4,
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
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  rowSpent: {
    fontSize: scaleFont(12.5),
    marginTop: 6,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
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
