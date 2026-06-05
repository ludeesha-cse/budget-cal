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
};

// Every existing loan (open or closed) whose counterparty matches what's
// been typed so far in the name field — open ones surface an
// about-to-be-duplicated name before Save creates a second account for
// the same person; closed ones are tappable to reuse instead. Renders
// nothing once both lists are empty, so the caller never needs its own
// "any matches at all" gate.
function CounterpartySuggestions({
  activeMatches,
  inactiveMatches,
  onPickSuggestion,
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
        <View
          key={`active-${loan.accountId}`}
          style={[styles.suggestionRowInactive, { borderTopColor: colors.border }]}>
          <Text style={[styles.suggestionName, { color: colors.primary }]}>
            {loan.counterpartyName}
          </Text>
          <Text style={[styles.loanDetail, { color: colors.textSecondary }]}>
            Already open · {formatAmount(loan.currentBalance, loan.currencyCode)} outstanding
          </Text>
        </View>
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
  suggestionRowInactive: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    opacity: 0.6,
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
