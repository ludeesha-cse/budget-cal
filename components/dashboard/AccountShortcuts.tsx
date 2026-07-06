import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont, typography } from '../../theme/typography';
import { formatAmount } from '../../utils/formatAmount';
import type { ShortcutAccountRow } from '../../hooks/useAccountShortcuts';

const SHORTCUT_ACCOUNT_COUNT = 2;

type Props = {
  shortcutAccounts: ShortcutAccountRow[];
  balancesHidden: boolean;
};

// "Dashboard Shortcuts" card content — the section header (with its own
// Hide/Show and Manage links) stays in the screen orchestrator.
function AccountShortcuts({ shortcutAccounts, balancesHidden }: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (shortcutAccounts.length === 0) {
    return (
      <Card colors={colors} style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>No accounts yet.</Text>
      </Card>
    );
  }

  return (
    <>
      {shortcutAccounts.slice(0, SHORTCUT_ACCOUNT_COUNT).map(account => (
        <Card key={account.accountId} colors={colors} style={[styles.card, styles.shortcutRow]}>
          <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {account.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.listRowText}>
            <Text style={[styles.listRowTitle, { color: colors.text }]}>{account.name}</Text>
            <Text style={[typography.eyebrow, styles.shortcutCurrency, { color: colors.textSecondary }]}>
              {account.currencyCode}
            </Text>
          </View>
          <Text style={[typography.amountMono, styles.listRowPercent, { color: colors.text }]}>
            {balancesHidden
              ? '••••••'
              : `Rs. ${formatAmount(account.balance, account.currencyCode, {
                  decimals: 0,
                  hideCode: true,
                })}`}
          </Text>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  shortcutCurrency: {
    marginTop: 2,
  },
  listRowPercent: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
});

export default AccountShortcuts;
