import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import { labelForId } from '../../utils/pickerLabels';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import type { UseSavingsGoalFormResult } from '../../hooks/useSavingsGoalForm';
import type { SavingsGoalCurrencyRow } from '../../hooks/useSavingsGoalsData';

type Props = {
  form: UseSavingsGoalFormResult;
  currencies: SavingsGoalCurrencyRow[];
};

// The full Add/Edit Goal form body — rendered inside a BottomSheetModal by
// the screen orchestrator, same split InstallmentFormFields/LoanFormFields
// use for their own screens.
function GoalFormFields({ form, currencies }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { values, error } = form;

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
        placeholder="e.g. Emergency Fund"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Target amount</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={values.targetAmount}
        onChangeText={form.setTargetAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
      {currencies.length === 0 ? (
        <EmptyState message="No currencies available." />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(currencies, values.currencyId, 'code', 'Select currency')}
          selectedValue={values.currencyId != null ? String(values.currencyId) : ''}
          onValueChange={value => form.setCurrencyId(Number(value))}
          items={currencies.map(c => ({
            label: `${c.code} — ${c.name}`,
            value: String(c.id),
          }))}
          label="Currency"
        />
      )}

      {/* REQUIRED, and listed straight after the currency because the
          two are one decision: an account can only back a goal in a
          currency it already holds, so changing the currency above can
          empty this list (and clears an account that no longer
          qualifies). A goal with no account has nowhere for its money to
          be, which is why this is not optional. */}
      <Text style={[styles.label, { color: colors.text }]}>Saved in</Text>
      {form.accountOptions.length === 0 ? (
        <EmptyState
          message={
            values.currencyId == null
              ? 'Pick a currency first.'
              : 'No open Bank, Cash, or Crypto Wallet account holds this currency. Add it to an account first, or choose another currency.'
          }
        />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(
            form.accountOptions,
            values.accountId,
            'name',
            'Select account',
          )}
          selectedValue={values.accountId != null ? String(values.accountId) : ''}
          onValueChange={value => form.setAccountId(Number(value))}
          items={form.accountOptions.map(a => ({
            label: `${a.name} (${a.type})`,
            value: String(a.id),
          }))}
          label="Saved in"
        />
      )}
      <Text style={[styles.helpText, { color: colors.textSecondary }]}>
        This goal can never show more than this account actually holds. Spend
        from it and the goal drops; put money back and it recovers.
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Target date (optional)</Text>
      <View style={styles.rowActions}>
        <DateField
          value={values.targetDate}
          onChange={form.setTargetDate}
          placeholder="No target date"
          renderTrigger={(label, onPress) => (
            <Pressable style={[styles.smallPillButton, { borderColor: colors.border }]} onPress={onPress}>
              <Text style={[styles.smallPillButtonText, { color: colors.text }]}>{label}</Text>
            </Pressable>
          )}
        />
        {values.targetDate && (
          <Pressable
            style={[styles.smallPillButton, { borderColor: colors.dangerSoft }]}
            onPress={() => form.setTargetDate(null)}>
            <Text style={[styles.smallPillButtonText, { color: colors.danger }]}>Clear</Text>
          </Pressable>
        )}
      </View>

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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
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
  helpText: {
    fontSize: scaleFont(12),
    lineHeight: scaleFont(17),
    marginTop: 6,
  },
  error: {
    marginTop: 12,
  },
});

export default GoalFormFields;
