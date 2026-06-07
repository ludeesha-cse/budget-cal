import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ban, CheckCircle2, Pencil, Trash2 } from 'lucide-react-native';
import Card from '../Card';
import ActionButtons from '../common/ActionButtons';
import OccurrenceHistoryList from './OccurrenceHistoryList';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { avatarColorsFor } from '../../utils/avatarColor';
import { formatAmount } from '../../utils/formatAmount';
import type { getOccurrenceHistory } from '../../db/queries';
import type { RecurringRuleRow } from '../../hooks/useRecurringRulesData';

type HistoryRow = Awaited<ReturnType<typeof getOccurrenceHistory>>[number];

type Props = {
  rule: RecurringRuleRow;
  index: number;
  expanded: boolean;
  history: HistoryRow[] | undefined;
  onToggleHistory: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
};

// One recurring rule card — badge/name/amount/meta header, action row
// (Edit/Activate-Deactivate/Delete), and the expandable occurrence
// history.
function RuleCard({
  rule,
  index,
  expanded,
  history,
  onToggleHistory,
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

      <Pressable onPress={onToggleHistory}>
        <Text style={[styles.historyLink, { color: colors.primary }]}>
          {expanded ? 'Hide history' : 'View history'}
        </Text>
      </Pressable>

      {expanded && <OccurrenceHistoryList history={history} currencyCode={rule.currencyCode} />}
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
  historyLink: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
});

export default RuleCard;
