import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import SegmentedToggle, {
  type SegmentedToggleOption,
} from '../common/SegmentedToggle';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { formatAmount } from '../../utils/formatAmount';
import { labelForId } from '../../utils/pickerLabels';
import type { InstallmentMode, UseInstallmentFormResult } from '../../hooks/useInstallmentForm';
import type {
  InstallmentCategoryRow,
  InstallmentCurrencyRow,
} from '../../hooks/useInstallmentPlansData';

const MODE_OPTIONS: SegmentedToggleOption<InstallmentMode>[] = [
  { key: 'principal', label: 'Principal + Rate' },
  { key: 'monthly', label: 'Fixed Monthly' },
];

type Props = {
  form: UseInstallmentFormResult;
  categories: InstallmentCategoryRow[];
  currencies: InstallmentCurrencyRow[];
};

// The full Add/Edit Plan form body — rendered inside a BottomSheetModal by
// the screen orchestrator, same split AccountFormModal uses elsewhere
// (there the modal wrapper and fields live in one file; here the task
// only calls for the fields themselves, so the wrapper stays with the
// screen).
function InstallmentFormFields({
  form,
  categories,
  currencies,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { values, error, preview } = form;

  const categoryLabel = (id: string) =>
    labelForId(categories, id, 'name', 'Select category');
  const currencyLabel = (id: string) =>
    labelForId(
      currencies.map(c => ({ ...c, displayLabel: `${c.code} — ${c.name}` })),
      id,
      'displayLabel',
      'Select currency',
    );
  const currencyCodeFor = (id: string) => labelForId(currencies, id, 'code', '');

  return (
    <>
      <Text style={[styles.label, { color: colors.text }]}>Name</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.name}
        onChangeText={form.setName}
        placeholder="e.g. New Phone"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Mode</Text>
      <SegmentedToggle options={MODE_OPTIONS} value={values.mode} onChange={form.setMode} />

      {values.mode === 'principal' ? (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            Principal amount
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.principalAmount}
            onChangeText={form.setPrincipalAmount}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="100000"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>
            Interest rate (%)
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.interestRatePercent}
            onChangeText={form.setInterestRatePercent}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="10"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            Monthly amount
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.monthlyAmountInput}
            onChangeText={form.setMonthlyAmountInput}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="5000"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      )}

      <Text style={[styles.label, { color: colors.text }]}>Number of months</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.numberOfMonths}
        onChangeText={form.setNumberOfMonths}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="12"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>
        Due date (day of month)
      </Text>
      <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
        Optional — e.g. 25 for the 25th of every month. When an
        installment is due within a few days, it'll show as a reminder on
        the Dashboard.
      </Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.dueDayOfMonth}
        onChangeText={form.setDueDayOfMonth}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="e.g. 25"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Category</Text>
      <CollapsiblePicker
        displayLabel={values.categoryId ? categoryLabel(values.categoryId) : 'Select category'}
        selectedValue={values.categoryId}
        onValueChange={form.setCategoryId}
        items={categories.map(c => ({ label: c.name, value: String(c.id) }))}
      />

      <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
      <CollapsiblePicker
        displayLabel={currencyLabel(values.currencyId)}
        selectedValue={values.currencyId}
        onValueChange={form.setCurrencyId}
        items={currencies.map(c => ({
          label: `${c.code} — ${c.name}`,
          value: String(c.id),
        }))}
      />

      <Text style={[styles.label, { color: colors.text }]}>Start date</Text>
      <DateField value={values.startDate} onChange={form.setStartDate} />

      {/* Live preview — the whole point of showing this is letting the
          user see the real numbers before they ever commit to anything,
          so it renders directly from the same pure math the DB layer
          will run, not from a stored/fetched value. */}
      {preview && (
        <View
          style={[
            styles.previewBox,
            { backgroundColor: colors.background, borderColor: colors.primary },
          ]}>
          <Text style={[styles.previewTitle, { color: colors.primary }]}>Preview</Text>
          <Text style={{ color: colors.text }}>
            Total repayable: {formatAmount(preview.totalRepayable, currencyCodeFor(values.currencyId))}
          </Text>
          <Text style={{ color: colors.text }}>
            Monthly amount: {formatAmount(preview.monthlyAmount, currencyCodeFor(values.currencyId))}
          </Text>
          {preview.finalInstallmentAmount !== preview.monthlyAmount && (
            <Text style={{ color: colors.text }}>
              Final installment: {formatAmount(preview.finalInstallmentAmount, currencyCodeFor(values.currencyId))}
            </Text>
          )}
        </View>
      )}

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  previewBox: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 10,
  },
  previewTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  error: {
    marginTop: 12,
  },
});

export default InstallmentFormFields;
