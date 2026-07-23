import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { ActiveLoan, InactiveLoan } from '../../hooks/useLoanAccountsData';

type Props = {
  activeMatches: ActiveLoan[];
  inactiveMatches: InactiveLoan[];
  onPickSuggestion: (loan: InactiveLoan) => void;
  onPickOpenLoan: (loan: ActiveLoan) => void;
};

// Every existing loan (open or closed) whose counterparty matches what's
// been typed so far in the name field. BOTH kinds are tappable and both
// lead somewhere real: an open one adds this amount to the loan that
// already exists, a closed one reopens it.
//
// Open matches used to render greyed out and inert, which named the
// problem ("already open · LKR 6,000 outstanding") while offering no way
// out of it — the only move left was to save anyway and end up with two
// accounts called Hasindu, each holding half of what one person owes.
// Making the row itself the fix is the whole point: the duplicate is now
// harder to reach than the correct thing.
//
// Renders nothing once both lists are empty, so the caller never needs
// its own "any matches at all" gate.
function CounterpartySuggestions({
  activeMatches,
  inactiveMatches,
  onPickSuggestion,
  onPickOpenLoan,
}: Props): React.JSX.Element | null {
  const { colors } = useTheme();

  if (activeMatches.length === 0 && inactiveMatches.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.suggestions,
        { borderColor: colors.primary, backgroundColor: colors.surface },
      ]}>
      <Text style={[styles.suggestionsHint, { color: colors.textSecondary }]}>
        Existing accounts matching this name:
      </Text>
      {activeMatches.map(loan => (
        <Pressable
          key={`active-${loan.accountId}`}
          style={[styles.suggestionRow, { borderTopColor: colors.border }]}
          onPress={() => onPickOpenLoan(loan)}>
          <Text style={[styles.suggestionName, { color: colors.primary }]}>
            {loan.counterpartyName}
          </Text>
          <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
            Already open · {formatAmount(loan.currentBalance, loan.currencyCode)} outstanding · tap to add to it
          </Text>
        </Pressable>
      ))}
      {inactiveMatches.map(loan => (
        <Pressable
          key={`inactive-${loan.accountId}`}
          style={[styles.suggestionRow, { borderTopColor: colors.border }]}
          onPress={() => onPickSuggestion(loan)}>
          <Text style={[styles.suggestionName, { color: colors.primary }]}>
            {loan.counterpartyName}
          </Text>
          <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
            Closed · last opened {loan.dateCreated} · tap to reuse
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
  },
  suggestionsHint: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  loanDetail: {
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
});

export default CounterpartySuggestions;
