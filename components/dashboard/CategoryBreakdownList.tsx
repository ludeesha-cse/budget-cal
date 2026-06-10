import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import { budgetStatusFor } from '../../utils/statusColor';
import type { CategoryBreakdownRow } from '../../hooks/useCategoryBreakdown';

// Only the top few rows show on the dashboard itself — "See all" exists
// specifically so this card never has to grow to fit everything.
const CATEGORY_PREVIEW_COUNT = 3;

type Props = {
  categoryBreakdown: CategoryBreakdownRow[];
  onPressRow: () => void;
};

// "By Category" card body — the section header/"See all" link stays in
// the screen orchestrator. Previously called
// `categoryBreakdown.filter(...)` twice (once just to check emptiness,
// once to actually slice/map) — memoized into one filtered array here
// instead (Step 16 fix).
function CategoryBreakdownList({ categoryBreakdown, onPressRow }: Props): React.JSX.Element {
  const { colors } = useTheme();

  const budgeted = useMemo(
    () => categoryBreakdown.filter(c => c.budgetAmount != null),
    [categoryBreakdown],
  );

  return (
    <Card colors={colors} style={[styles.card, styles.listCard]}>
      {budgeted.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No category budgets set yet.</Text>
      ) : (
        budgeted.slice(0, CATEGORY_PREVIEW_COUNT).map((item, index, arr) => {
          const budgetAmount = item.budgetAmount ?? 0;
          const pct = budgetAmount > 0 ? Math.round((item.spent / budgetAmount) * 100) : 0;
          const status = budgetStatusFor(item.spent, budgetAmount, colors);
          return (
            <Pressable
              key={item.categoryId}
              style={[
                styles.listRow,
                index < arr.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={onPressRow}>
              <View style={[styles.avatar, { backgroundColor: status.soft }]}>
                <Text style={[styles.avatarText, { color: status.text }]}>
                  {item.categoryName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.listRowText}>
                <Text style={[styles.listRowTitle, { color: colors.text }]}>
                  {item.categoryName}
                </Text>
                <Text style={[typography.amountMono, styles.listRowSubtitle, { color: colors.textSecondary }]}>
                  Rs. {formatAmount(item.spent, '', { decimals: 0, hideCode: true })} of{' '}
                  {formatAmount(budgetAmount, '', { decimals: 0, hideCode: true })}
                </Text>
              </View>
              <Text style={[typography.amountMono, styles.listRowPercent, { color: status.text }]}>
                {pct}%
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
  },
  listCard: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  listRowText: {
    flex: 1,
  },
  listRowTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  listRowSubtitle: {
    fontSize: scaleFont(12),
    marginTop: 2,
  },
  listRowPercent: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default CategoryBreakdownList;
