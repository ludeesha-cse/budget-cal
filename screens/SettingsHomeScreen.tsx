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
import type { SettingsStackParamList } from '../navigation/types';
import { useDevEntitlementToggle } from '../hooks/useEntitlement';
import { useTheme } from '../contexts/ThemeContext';
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

function SettingsHomeScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  // null outside __DEV__ (or if the provider is somehow missing), so
  // this row simply doesn't render in anything but a debug build —
  // there is no separate flag to remember to flip before shipping.
  const devEntitlement = useDevEntitlementToggle();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

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

  // Formats a validation-error list for an Alert body — Alert has no
  // scrollable custom view, so this shows the first handful of errors
  // (each already carrying its sheet name and 1-based row number from
  // utils/excelImport.ts) plus a "and N more" tail rather than trying to
  // cram every row's problem onto the screen at once.
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

  // Picks a file, reads it, and runs Phase 1 (validateExcelFile) —
  // nothing here writes to the database. Only once validation returns
  // { valid: true } does the confirmation step below hand the parsed
  // data to importData (Phase 2). Mixing the two phases together is
  // exactly what utils/excelImport.ts's own header comment warns
  // against, so this function only ever reads.
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

    // REPLACE requires a deliberate two-step confirmation, not a single
    // OK — the first step shows what's in the file, the second is a
    // standalone warning naming the permanent deletion explicitly, per
    // the Stage 17b spec.
    Alert.alert('Ready to restore', `This file contains:\n\n${summary}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          Alert.alert(
            'Delete everything and restore?',
            'This will PERMANENTLY DELETE every account, transaction, budget, and record currently in the app, then replace them with the contents of this file. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete Everything and Restore',
                style: 'destructive',
                onPress: () => runImport(parsedData, 'replace'),
              },
            ],
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

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
    >
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
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('BudgetSettings')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Monthly Budget
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Accounts')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>Accounts</Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('LiabilitiesReceivables')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Liabilities & Receivables
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Categories')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Categories
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('CategoryBudgets')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Category Budgets
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Currencies')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Currencies
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('InstallmentPlans')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Installments
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('RecurringRules')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>Recurring</Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('SavingsGoals')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Savings Goals
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Tags')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>Tags</Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('AppSettings')}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          App Settings
        </Text>
        <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={[
          styles.row,
          styles.exportRow,
          { borderBottomColor: colors.border },
        ]}
        disabled={exporting}
        onPress={handleExport}
      >
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
          <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
        )}
      </Pressable>
      <Pressable
        style={[
          styles.row,
          styles.exportRow,
          { borderBottomColor: colors.border },
        ]}
        disabled={importing}
        onPress={handleImportPress}
      >
        <View style={styles.exportTextArea}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>
            Import Data
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            Restore from a previously exported Excel file, or bulk-add
            transactions from one.
          </Text>
        </View>
        {importing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.chevron, { color: colors.chevron }]}>{'>'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
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
