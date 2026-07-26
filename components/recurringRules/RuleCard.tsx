import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ban, CheckCircle2, ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import Card from '../Card';
import ActionButtons from '../common/ActionButtons';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { avatarColorsFor } from '../../utils/avatarColor';
import { formatAmount } from '../../utils/formatAmount';
import type { RecurringRuleRow } from '../../hooks/useRecurringRulesData';

type Props = {
  rule: RecurringRuleRow;
  index: number;
  onOpenHistory: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
};

// One recurring rule card — badge/name/amount/meta header, action row
// (Edit/Activate-Deactivate/Delete), and the link to its occurrence
// history.
//
// The history opens in a bottom sheet rather than unfolding here. A rule
// that has been running for a year has a long list, and expanding it in
// place shifted every card below it — a sheet keeps the list still and
// gives the history its own scroll.
function RuleCard({
  rule,
  index,
  onOpenHistory,
  onEdit,
  onToggleActive,
  onDelete,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { bg, fg } = avatarColorsFor(index, colors.chart);

  return (
    <Card colors={colors} style={[styles.ruleCard, !rule.active && styles.ruleCardInactive]}>
      <View style={styles.ruleHeader}>
        <View style={[styles.dayBadge, { backgroundColor: bg }]}>
          <Text style={[styles.dayBadgeText, { color: fg }]}>{rule.dayOfMonth}</Text>
        </View>
        <View style={styles.ruleHeaderText}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {rule.name}
            {!rule.active && (
              <Text style={[styles.inactiveTag, { color: colors.textSecondary }]}>
                {' '}
                (inactive)
              </Text>
            )}
          </Text>
          <Text style={[typography.amountMono, styles.rowMeta, { color: colors.text }]}>
            {formatAmount(rule.amount, rule.currencyCode)}
          </Text>
          <Text style={[styles.rowSubMeta, { color: colors.textSecondary }]}>
            Day {rule.dayOfMonth} · {rule.accountName}
            {rule.ruleType === 'Expense' && rule.categoryName ? ` · ${rule.categoryName}` : ''}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <ActionButtons
        equalWidth
        style={styles.ruleActionsRow}
        items={[
          { key: 'edit', icon: Pencil, label: 'Edit', onPress: onEdit },
          {
            key: 'toggle',
            icon: rule.active ? Ban : CheckCircle2,
            label: rule.active ? 'Deactivate' : 'Activate',
            onPress: onToggleActive,
          },
          { key: 'delete', icon: Trash2, label: 'Delete', tone: 'danger', onPress: onDelete },
        ]}
      />

      <Pressable style={styles.historyRow} onPress={onOpenHistory}>
        <Text style={[styles.historyLink, { color: colors.primary }]}>
          View history
        </Text>
        <ChevronRight size={15} color={colors.primary} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  ruleCard: {
    padding: 14,
    marginBottom: 10,
  },
  ruleCardInactive: {
    opacity: 0.6,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dayBadgeText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  ruleHeaderText: {
    flex: 1,
  },
  rowName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  inactiveTag: {
    fontWeight: '400',
  },
  rowMeta: {
    fontSize: scaleFont(14),
    marginTop: 2,
  },
  rowSubMeta: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  ruleActionsRow: {
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyLink: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
});

export default RuleCard;
