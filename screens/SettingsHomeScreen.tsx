import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import RNFS from 'react-native-fs';
import {
  pick,
  keepLocalCopy,
  types,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import {
  ChevronRight,
  CircleUser,
  CreditCard,
  Download,
  FolderTree,
  HandCoins,
  ListChecks,
  PiggyBank,
  Receipt,
  Repeat,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Tags as TagsIcon,
  Upload,
  Wallet,
  Banknote,
  LifeBuoy,
} from 'lucide-react-native';
import type { SettingsStackParamList } from '../navigation/types';
import { useDevEntitlementToggle } from '../hooks/useEntitlement';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import { typography, scaleFont } from '../theme/typography';
import {
  getAllDataForExport,
  importData,
  type ImportMode,
} from '../db/queries';
import { exportDataToExcel } from '../utils/excelExport';
import {
  validateExcelFile,
  type ValidationError,
  type ValidationResult,
} from '../utils/excelImport';

type SettingsHomeNavigationProp = NativeStackNavigationProp<
  SettingsStackParamList,
  'SettingsHome'
>;

type Props = {
  navigation: SettingsHomeNavigationProp;
};

// The flat "one long list" this screen used to be became hard to scan once
// it grew past a handful of destinations — grouping into labeled sections
// (same eyebrow-label-over-card language every other screen already uses,
// see DashboardScreen's "By Category"/"Cash & Debt" sections) gives the
// list actual structure without inventing a new visual pattern. Icons are
// purely a scan aid — every row's real behavior lives in its own onPress.
type IconComponent = React.ComponentType<{ color: string; size: number }>;

type SettingsRow = {
  key: string;
  label: string;
  subtitle?: string;
  icon: IconComponent;
  onPress: () => void;
  loading?: boolean;
};

type SettingsSection = {
  title: string;
  rows: SettingsRow[];
};

function SettingsHomeScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const confirmDelete = useConfirmDelete();
  // null outside __DEV__ (or if the provider is somehow missing), so
  // this row simply doesn't render in anything but a debug build —
  // there is no separate flag to remember to flip before shipping.
  const devEntitlement = useDevEntitlementToggle();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const formatErrors = (errors: ValidationError[]): string => {
    const MAX_SHOWN = 8;
    const lines = errors
      .slice(0, MAX_SHOWN)
      .map(e => `• [${e.sheet} row ${e.row}] ${e.message}`);
    if (errors.length > MAX_SHOWN) {
      lines.push(`…and ${errors.length - MAX_SHOWN} more.`);
    }
    return lines.join('\n');
  };

  const formatRowCounts = (
    rowCounts: Partial<Record<string, number>>,
  ): string => {
    const lines = Object.entries(rowCounts)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([sheet, count]) => `${sheet}: ${count}`);
    return lines.length > 0 ? lines.join('\n') : 'No rows found in this file.';
  };

  // Runs the actual apply step (Phase 2) once the user has confirmed —
  // separated out so both the MERGE and REPLACE confirmation paths below
  // call the exact same code.
  const runImport = async (
    data: Parameters<typeof importData>[0],
    mode: ImportMode,
  ) => {
    setImporting(true);
    try {
      const result = await importData(data, mode);
      Alert.alert(
        'Import complete',
        `${
          mode === 'replace' ? 'Restore' : 'Merge'
        } finished successfully.\n\n${formatRowCounts(result)}`,
      );
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setImporting(false);
    }
  };

  const pickAndValidate = async (mode: ImportMode) => {
    let picked;
    try {
      // pick() always resolves to an array, even with multi-select off.
      [picked] = await pick({ type: [types.xlsx] });
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      Alert.alert(
        'Could not open file picker',
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    // What the picker hands back on Android is a content:// uri owned by
    // whichever provider the user browsed (Drive, Files, an SD card...),
    // and it isn't readable as a plain path. keepLocalCopy pulls the bytes
    // into our own cache directory and gives back a file:// uri that
    // RNFS.readFile can open. Cheaper than it sounds — these workbooks are
    // small, and the copy is discarded by the OS with the rest of the cache.
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName: picked.name ?? 'import.xlsx' }],
      destination: 'cachesDirectory',
    });
    if (copy.status !== 'success') {
      Alert.alert('Could not read file', copy.copyError);
      return;
    }
    const path = copy.localUri;
    setImporting(true);
    let result: ValidationResult;
    try {
      const base64 = await RNFS.readFile(path, 'base64');
      result = await validateExcelFile(base64);
    } catch (error) {
      setImporting(false);
      Alert.alert(
        'Could not read file',
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    setImporting(false);

    if (!result.valid) {
      Alert.alert(
        `Import blocked — ${result.errors.length} problem${
          result.errors.length === 1 ? '' : 's'
        } found`,
        `Nothing has been imported. Fix these and try again:\n\n${formatErrors(
          result.errors,
        )}`,
      );
      return;
    }

    // Captured into a const right after the narrowing check above —
    // `result` itself is a `let` closed over by the Alert callbacks
    // below, and TypeScript can't retain "valid: true" narrowing through
    // that closure boundary, even though it can't actually change here.
    const parsedData = result.data;
    const summary = formatRowCounts(result.rowCounts);

    if (mode === 'merge') {
      Alert.alert(
        'Ready to import',
        `This will ADD the following records to your existing data:\n\n${summary}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => runImport(parsedData, 'merge'),
          },
        ],
      );
      return;
    }

    Alert.alert('Ready to restore', `This file contains:\n\n${summary}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          confirmDelete(
            'Delete everything and restore?',
            'This will PERMANENTLY DELETE every account, transaction, budget, and record currently in the app, then replace them with the contents of this file. This cannot be undone.',
            'Delete Everything and Restore',
            () => runImport(parsedData, 'replace'),
          );
        },
      },
    ]);
  };

  const handleImportPress = () => {
    if (importing) {
      return;
    }
    Alert.alert(
      'Import Data',
      'Merge adds the records in the file to what you already have — nothing existing is removed.\n\nReplace deletes everything currently in the app and restores it from the file exactly as exported. Use Replace to move your data to a new device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge (Add)', onPress: () => pickAndValidate('merge') },
        {
          text: 'Replace (Restore)',
          onPress: () => pickAndValidate('replace'),
        },
      ],
    );
  };

  const sections: SettingsSection[] = [
    {
      title: 'Budget',
      rows: [
        {
          key: 'budget',
          label: 'Monthly Budget',
          icon: SlidersHorizontal,
          onPress: () => navigation.navigate('BudgetSettings'),
        },
        {
          key: 'categoryBudgets',
          label: 'Category Budgets',
          icon: ListChecks,
          onPress: () => navigation.navigate('CategoryBudgets'),
        },
      ],
    },
    {
      title: 'Accounts & Balances',
      rows: [
        {
          key: 'accounts',
          label: 'Accounts',
          icon: Wallet,
          onPress: () => navigation.navigate('Accounts'),
        },
        {
          key: 'liabilities',
          label: 'Liabilities & Receivables',
          icon: HandCoins,
          onPress: () => navigation.navigate('LiabilitiesReceivables'),
        },
        {
          key: 'currencies',
          label: 'Currencies',
          icon: Banknote,
          onPress: () => navigation.navigate('Currencies'),
        },
      ],
    },
    {
      title: 'Transactions',
      rows: [
        {
          key: 'expensesByType',
          label: 'Expenses by Type',
          icon: Receipt,
          onPress: () => navigation.navigate('ExpensesByType'),
        },
        {
          key: 'categories',
          label: 'Categories',
          icon: FolderTree,
          onPress: () => navigation.navigate('Categories'),
        },
        {
          key: 'tags',
          label: 'Tags',
          icon: TagsIcon,
          onPress: () => navigation.navigate('Tags'),
        },
        {
          key: 'recurring',
          label: 'Recurring',
          icon: Repeat,
          onPress: () => navigation.navigate('RecurringRules'),
        },
        {
          key: 'installments',
          label: 'Installments',
          icon: CreditCard,
          onPress: () => navigation.navigate('InstallmentPlans'),
        },
      ],
    },
    {
      title: 'Goals',
      rows: [
        {
          key: 'savingsGoals',
          label: 'Savings Goals',
          icon: PiggyBank,
          onPress: () => navigation.navigate('SavingsGoals'),
        },
      ],
    },
    {
      title: 'Data',
      rows: [
        {
          key: 'export',
          label: 'Export Data',
          subtitle:
            'Saves every record to an Excel file you can use to restore on another device.',
          icon: Download,
          onPress: handleExport,
          loading: exporting,
        },
        {
          key: 'import',
          label: 'Import Data',
          subtitle:
            'Restore from a previously exported Excel file, or bulk-add transactions from one.',
          icon: Upload,
          onPress: handleImportPress,
          loading: importing,
        },
      ],
    },
    {
      title: 'App',
      rows: [
        {
          key: 'account',
          label: 'Account',
          icon: CircleUser,
          onPress: () => navigation.navigate('Account'),
        },
        {
          key: 'appSettings',
          label: 'App Settings',
          icon: SettingsIcon,
          onPress: () => navigation.navigate('AppSettings'),
        },
        {
          key: 'helpSupport',
          label: 'Help & Support',
          subtitle:
            'How everything works, plus a way to message us if it doesn\'t.',
          icon: LifeBuoy,
          onPress: () => navigation.navigate('HelpSupport'),
        },
      ],
    },
  ];

  return (
    <ScreenBackground colors={colors}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
          }
        >
          <Text style={[styles.devRowLabel, { color: colors.warning }]}>
            Dev: entitlement tier — {devEntitlement.tier}
          </Text>
          <Text style={[styles.devRowHint, { color: colors.warning }]}>
            Tap to flip
          </Text>
        </Pressable>
      )}

      {sections.map(section => (
        <View key={section.title}>
          <Text
            style={[
              typography.eyebrow,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}>
            {section.title}
          </Text>
          <Card colors={colors} style={styles.card}>
            {section.rows.map((row, index) => (
              <SettingsListRow
                key={row.key}
                row={row}
                colors={colors}
                isLast={index === section.rows.length - 1}
              />
            ))}
          </Card>
        </View>
      ))}
      </ScrollView>
    </ScreenBackground>
  );
}

function SettingsListRow({
  row,
  colors,
  isLast,
}: {
  row: SettingsRow;
  colors: ThemeColors;
  isLast: boolean;
}): React.JSX.Element {
  const Icon = row.icon;
  const disabled = row.loading === true;
  return (
    <Pressable
      style={[
        styles.row,
        !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
      disabled={disabled}
      onPress={row.onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <Icon color={colors.primary} size={18} />
      </View>
      <View style={styles.rowTextArea}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          {row.label}
        </Text>
        {row.subtitle && (
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            {row.subtitle}
          </Text>
        )}
      </View>
      {disabled ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <ChevronRight size={18} color={colors.chevron} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 60,
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTextArea: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: scaleFont(15),
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: scaleFont(12),
    marginTop: 3,
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
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  devRowHint: {
    fontSize: scaleFont(12),
  },
});

export default SettingsHomeScreen;
