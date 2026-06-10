import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { UpcomingInstallmentRow, UpcomingLoanRow } from '../../hooks/useUpcomingReminders';

type Props = {
  upcomingLoans: UpcomingLoanRow[];
  upcomingInstallments: UpcomingInstallmentRow[];
  onPayInstallment: (installmentId: number) => void;
};

function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    return `Overdue by ${Math.abs(daysUntilDue)}d`;
  }
  return daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue}d`;
}

// Merges the "Due Soon / Overdue" (loans) and "Installment Reminders"
// blocks, headers included — unlike the other extracted cards, both
// sections here are conditionally rendered as a pair, so keeping their
// headers next to the content they gate reads more clearly than leaving
// two near-identical `{list.length > 0 && (...)}` headers back in the
// orchestrator.
function DueSoonSection({
  upcomingLoans,
  upcomingInstallments,
  onPayInstallment,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <>
      {upcomingLoans.length > 0 && (
        <>
          <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
            Due Soon / Overdue
          </Text>
          <Card colors={colors} style={styles.card} borderColor={colors.warning}>
            {upcomingLoans.map(loan => (
              <Text key={loan.accountId} style={[styles.dueSoonRow, { color: colors.textSecondary }]}>
                {dueLabel(loan.daysUntilDue)}
                {' — '}
                {loan.counterpartyName} ({loan.type}): {formatAmount(loan.totalOwed, loan.currencyCode)}
              </Text>
            ))}
          </Card>
        </>
      )}

      {upcomingInstallments.length > 0 && (
        <>
          <Text style={[typography.eyebrow, styles.sectionLabel, { color: colors.textSecondary }]}>
            Installment Reminders
          </Text>
          {upcomingInstallments.map(reminder => (
            <Card
              key={reminder.id}
              colors={colors}
              style={[styles.card, styles.reminderRow]}
              borderColor={colors.warning}>
              <View style={styles.reminderText}>
                <Text style={[styles.listRowTitle, { color: colors.text }]} numberOfLines={1}>
                  {reminder.name}
                </Text>
                <Text style={[typography.amountMono, styles.listRowSubtitle, { color: colors.textSecondary }]}>
                  {dueLabel(reminder.daysUntilDue)}
                  {' — '}
                  {formatAmount(reminder.nextAmountDue, reminder.currencyCode)} · #
                  {reminder.nextInstallmentNumber} of {reminder.numberOfMonths}
                </Text>
              </View>
              <Pressable
                style={[styles.payButton, { backgroundColor: colors.primary }]}
                onPress={() => onPayInstallment(reminder.id)}>
                <Text style={[styles.payButtonText, { color: colors.primaryText }]}>Pay</Text>
              </Pressable>
            </Card>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    padding: 16,
    marginBottom: 10,
  },
  dueSoonRow: {
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderText: {
    flex: 1,
    marginRight: 12,
  },
  listRowTitle: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  listRowSubtitle: {
    fontSize: scaleFont(12),
    marginTop: 2,
  },
  payButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  payButtonText: {
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
});

export default DueSoonSection;
