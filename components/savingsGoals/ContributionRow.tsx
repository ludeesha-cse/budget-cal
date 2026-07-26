import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { SavingsContributionRow } from '../../hooks/useSavingsTransferForm';

type Props = {
  contribution: SavingsContributionRow;
  currencyCode: string;
  onDelete: () => void;
  // Omitted where there is nowhere to edit from (the card's own compact
  // list). The goal's details screen passes it.
  onEdit?: () => void;
};

// One entry in a goal's funding history.
//
// EDIT MOVES THE MONEY, it does not retype a note. A contribution is the
// earmark attached to a real transfer, so Edit opens a form that
// corrects that transfer and lets it carry this row's amount with it
// (see useEditContributionModal). What is deliberately still impossible
// is editing the earmark alone: the goal would then claim money the
// accounts do not agree has moved.
//
// A legacy contribution — logged before goals were tied to an account —
// has no transfer behind it and therefore nothing to correct, so it gets
// no Edit button at all rather than one that fails on press.
function ContributionRow({
  contribution,
  currencyCode,
  onDelete,
  onEdit,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const isLinked = contribution.transferId != null;

  return (
    <View style={[styles.contributionRow, { borderTopColor: colors.border }]}>
      <Text style={{ color: colors.text }}>
        {contribution.date} — {formatAmount(contribution.amount, currencyCode)}
      </Text>
      <Text style={[styles.source, { color: colors.textSecondary }]}>
        {isLinked
          ? `from ${contribution.fromAccountName ?? 'another account'}`
          : 'logged before goals were tied to an account'}
      </Text>
      <View style={styles.rowActions}>
        {onEdit && isLinked && (
          <Pressable
            style={[styles.smallPillButton, { borderColor: colors.border }]}
            onPress={onEdit}>
            <Text style={[styles.smallPillButtonText, { color: colors.text }]}>
              Edit
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.smallPillButton, { borderColor: colors.dangerSoft }]}
          onPress={onDelete}>
          <Text style={[styles.smallPillButtonText, { color: colors.danger }]}>
            {isLinked ? 'Remove' : 'Delete'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contributionRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  source: {
    fontSize: scaleFont(12),
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  smallPillButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default ContributionRow;
