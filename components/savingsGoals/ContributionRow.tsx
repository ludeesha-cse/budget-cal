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
};

// One entry in a goal's funding history.
//
// THERE IS NO INLINE EDIT HERE ANY MORE, on purpose. A contribution used
// to be a free-standing number the user could retype; it is now the
// earmark attached to a real transfer, and the amount that matters is
// the transfer's. Editing it here would mean either changing the earmark
// without moving the money (the two would disagree) or quietly moving
// money from a row that does not look like it moves money. So amounts
// are edited on the transfer itself in History, which carries this row
// with it — and Remove, below, reverses the transfer rather than
// deleting a note about it.
function ContributionRow({
  contribution,
  currencyCode,
  onDelete,
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
