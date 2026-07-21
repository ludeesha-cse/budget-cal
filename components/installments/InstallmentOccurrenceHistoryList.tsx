import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { InstallmentOccurrenceRow } from '../../hooks/queries';

type Props = {
  occurrences: InstallmentOccurrenceRow[] | undefined;
  currencyCode: string;
};

// The schedule half of a plan's expanded history: every occurrence this
// plan has had — paid, skipped and the one still pending — shown the same
// way RecurringRulesScreen already shows a rule's occurrence history, so
// "what was this plan asked to do and what happened" reads the same for
// both kinds of scheduled item.
//
// This sits ALONGSIDE the payments list rather than replacing it,
// because the two answer different questions: payments are what actually
// moved money (and are what "Undo" acts on), occurrences are what was
// due. A skipped month appears here and nowhere else — it never became a
// payment, which is exactly the thing worth being able to see.
//
// `occurrences` is undefined until the per-plan query resolves on first
// expand, hence the loading branch.
function InstallmentOccurrenceHistoryList({
  occurrences,
  currencyCode,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={styles.list}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>
        Schedule
      </Text>
      {!occurrences ? (
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      ) : occurrences.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          No occurrences scheduled yet.
        </Text>
      ) : (
        occurrences.map(occurrence => (
          <View
            key={occurrence.id}
            style={[styles.row, { borderTopColor: colors.border }]}>
            {/* Keyed on the due date rather than the occurrence's own
                slot number: the slot is an internal scheduling key, and
                after a skip it deliberately runs ahead of the
                installment a payment actually settles. What a paid row
                reports is therefore the PAYMENT's installment number,
                which is the one that also appears in the payments list
                above. */}
            <Text style={{ color: colors.text }}>
              Due {occurrence.dueDate} —{' '}
              {occurrence.status === 'paid'
                ? `Paid installment ${occurrence.paidInstallmentNumber} · ${formatAmount(
                    occurrence.paidAmount ?? 0,
                    currencyCode,
                  )}${occurrence.accountName ? ` (${occurrence.accountName})` : ''}`
                : occurrence.status === 'skipped'
                  ? `Skipped${occurrence.resolvedAt ? ` on ${occurrence.resolvedAt}` : ''}`
                  : 'Pending'}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 12,
    gap: 4,
  },
  heading: {
    fontSize: scaleFont(12),
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  row: {
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default InstallmentOccurrenceHistoryList;
