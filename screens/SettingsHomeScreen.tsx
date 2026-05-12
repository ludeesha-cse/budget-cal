import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useDevEntitlementToggle } from '../hooks/useEntitlement';
import { useTheme } from '../contexts/ThemeContext';
import { getAllDataForExport } from '../db/queries';
import { exportDataToExcel } from '../utils/excelExport';

type SettingsHomeNavigationProp = NativeStackNavigationProp<
  SettingsStackParamList,
  'SettingsHome'
>;

type Props = {
  navigation: SettingsHomeNavigationProp;
};

function SettingsHomeScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  // null outside __DEV__ (or if the provider is somehow missing), so
  // this row simply doesn't render in anything but a debug build —
  // there is no separate flag to remember to flip before shipping.
  const devEntitlement = useDevEntitlementToggle();
  const [exporting, setExporting] = useState(false);

  // Export is a free-tier feature with no gating check here at all — see
  // the Stage 17a spec: it's the only way users get their data out, and
  // locking it behind entitlement would trap people away from their own
  // records.
  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const data = await getAllDataForExport();
      await exportDataToExcel(data);
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {devEntitlement && (
        <Pressable
          style={[
            styles.devRow,
            { backgroundColor: colors.surface, borderColor: colors.warning },
          ]}
          onPress={() =>
            devEntitlement.setDevTier(
              devEntitlement.tier === 'free' ? 'premium' : 'free',
            )
          }>
          <Text style={[styles.devRowLabel, { color: colors.warning }]}>
            Dev: entitlement tier — {devEntitlement.tier}
          </Text>
          <Text style={[styles.devRowHint, { color: colors.warning }]}>
            Tap to flip
          </Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('BudgetSettings')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Monthly Budget
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Accounts')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Accounts</Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('LiabilitiesReceivables')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Liabilities & Receivables
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Categories')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Categories
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('CategoryBudgets')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Category Budgets
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Currencies')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Currencies
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('InstallmentPlans')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Installments
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('RecurringRules')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Recurring
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('SavingsGoals')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Savings Goals
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Tags')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Tags</Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('AppSettings')}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          App Settings
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, styles.exportRow, { borderBottomColor: colors.border }]}
        disabled={exporting}
        onPress={handleExport}>
        <View style={styles.exportTextArea}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>
            Export Data
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            Saves every record to an Excel file you can use to restore on
            another device.
          </Text>
        </View>
        {exporting ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.chevron, { color: colors.chevron }]}>
            {'>'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  exportRow: {
    alignItems: 'center',
  },
  exportTextArea: {
    flex: 1,
    paddingRight: 12,
  },
  chevron: {
    fontSize: 16,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  devRowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  devRowHint: {
    fontSize: 12,
  },
});

export default SettingsHomeScreen;
