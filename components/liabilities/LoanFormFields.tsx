import React from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../NumericInputAccessory';
import CounterpartySuggestions from './CounterpartySuggestions';
import { useTheme } from '../../contexts/ThemeContext';
import { labelForId } from '../../utils/pickerLabels';
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import { formatAmount } from '../../utils/formatAmount';
import type { LoanAccountType } from '../../db/queries';
import type { UseLoanFormResult } from '../../hooks/useLoanForm';
import type { LoanAccountRow, LoanCurrencyRow } from '../../hooks/useLoanAccountsData';

const INTEREST_PERIODS = ['monthly', 'annual'] as const;

type Props = {
  form: UseLoanFormResult;
  type: LoanAccountType;
  currencies: LoanCurrencyRow[];
  counterpartAccounts: LoanAccountRow[];
};

// The Add / Reopen / Top-up / Edit Liability-Receivable form body —
// rendered inside a BottomSheetModal by the screen orchestrator, same
// split InstallmentFormFields uses for its own screen.
//
// One form, four modes (form.mode). What differs between them is only
// which fields make sense to ask for:
//
//   add / reopen — everything.
//   topUp        — an amount and the account it moves through, and
//                  nothing else: the counterparty is already chosen, the
//                  currency is fixed by the loan being added to (see
//                  topUpLoanAccount), and the due date and interest
//                  terms belong to that loan, which is what Edit is for.
//   edit         — everything except the name suggestions, since the
//                  name already belongs to a loan that exists.
function LoanFormFields({
  form,
  type,
  currencies,
  counterpartAccounts,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { values, error, isMissing, mode, topUpTarget } = form;
  const isTopUp = mode === 'topUp';
  const isEdit = mode === 'edit';

  const currencyLabel = (id: string) =>
    labelForId(
      currencies.map(c => ({ ...c, displayLabel: `${c.code} — ${c.name}` })),
      id,
      'displayLabel',
      'Select currency',
    );
  const counterpartLabel = (id: string) =>
    labelForId(counterpartAccounts, id, 'name', 'Select account');

  return (
    <>
      <Text style={[styles.label, { color: colors.text }]}>Counterparty name</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          fieldErrorStyle(colors, isMissing('counterpartyName')),
          // Read-only in top-up mode: the name IS the loan being added
          // to, so letting it be typed over would only reintroduce the
          // "which account did I mean?" ambiguity this mode exists to
          // remove. Editable everywhere else, renaming included.
          isTopUp && { color: colors.textSecondary },
        ]}
        value={values.counterpartyName}
        onChangeText={form.handleNameChange}
        editable={!isTopUp}
        placeholder={type === 'Liability' ? 'Borrowed from…' : 'Lended to…'}
        placeholderTextColor={colors.textSecondary}
      />
      <CounterpartySuggestions
        activeMatches={form.activeNameMatches}
        inactiveMatches={form.inactiveNameMatches}
        onPickSuggestion={form.handlePickSuggestion}
        onPickOpenLoan={form.handlePickOpenLoan}
      />
      {mode === 'reopen' && (
        <View
          style={[
            styles.reuseBanner,
            { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary },
          ]}>
          <Text style={[styles.reuseBannerText, { color: colors.primary }]}>
            Reopening the closed account for this counterparty.
          </Text>
          <Pressable onPress={form.clearReuse}>
            <Text style={[styles.reuseBannerClear, { color: colors.primary }]}>
              Create new instead
            </Text>
          </Pressable>
        </View>
      )}
      {isTopUp && topUpTarget && (
        <View
          style={[
            styles.reuseBanner,
            { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary },
          ]}>
          <Text style={[styles.reuseBannerText, { color: colors.primary }]}>
            Adding to the open{' '}
            {type === 'Liability' ? 'liability' : 'receivable'} with{' '}
            {topUpTarget.counterpartyName} ·{' '}
            {formatAmount(topUpTarget.currentBalance, topUpTarget.currencyCode)}{' '}
            outstanding.
          </Text>
          <Pressable onPress={form.clearTopUp}>
            <Text style={[styles.reuseBannerClear, { color: colors.primary }]}>
              Open a separate one instead
            </Text>
          </Pressable>
        </View>
      )}

      <Text style={[styles.label, { color: colors.text }]}>
        {isTopUp
          ? 'Amount to add'
          : isEdit
            ? 'Outstanding principal'
            : 'Principal'}
      </Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          fieldErrorStyle(colors, isMissing('principal')),
        ]}
        value={values.principal}
        onChangeText={form.setPrincipal}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />
      {isEdit && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Changing this corrects the account the money moves through by the
          same difference.
        </Text>
      )}

      {/* A loan account holds exactly one currency, so a top-up has no
          currency to choose — it is whatever the loan is already in.
          Shown as plain text rather than a disabled picker so there is
          nothing to tap that does nothing. */}
      <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
      {isTopUp ? (
        <Text style={[styles.readOnlyValue, { color: colors.textSecondary }]}>
          {currencyLabel(values.currencyId)} · fixed by this loan
        </Text>
      ) : (
        <CollapsiblePicker
          displayLabel={currencyLabel(values.currencyId)}
          selectedValue={values.currencyId}
          onValueChange={form.setCurrencyId}
          items={currencies.map(c => ({ label: `${c.code} — ${c.name}`, value: String(c.id) }))}
          label="Currency"
          invalid={isMissing('currencyId')}
        />
      )}

      <Text style={[styles.label, { color: colors.text }]}>
        {type === 'Liability' ? 'Deposit into' : 'Paid from'}
      </Text>
      <CollapsiblePicker
        displayLabel={counterpartLabel(values.counterpartAccountId)}
        selectedValue={values.counterpartAccountId}
        onValueChange={form.setCounterpartAccountId}
        items={counterpartAccounts.map(a => ({
          label: `${a.name} (${a.type})`,
          value: String(a.id),
        }))}
        label={type === 'Liability' ? 'Deposit into' : 'Paid from'}
        invalid={isMissing('counterpartAccountId')}
      />

      {/* Due date and interest describe the loan itself, not this
          particular hand-over of money, so a top-up leaves them alone —
          they are changed from Edit. */}
      {!isTopUp && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Due date (optional)</Text>
          <View style={styles.dueDateRow}>
            <View style={styles.dueDateButton}>
              <DateField value={values.dueDate} onChange={form.setDueDate} placeholder="Not set" />
            </View>
            {values.dueDate && (
              <Button title="Clear" color={colors.primary} onPress={() => form.setDueDate(null)} />
            )}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Interest rate % (optional)</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
            ]}
            value={values.interestRate}
            onChangeText={form.setInterestRate}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="e.g. 5.5"
            placeholderTextColor={colors.textSecondary}
          />

          {values.interestRate.trim().length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Interest period</Text>
              <CollapsiblePicker
                displayLabel={values.interestPeriod || 'Select period'}
                selectedValue={values.interestPeriod}
                onValueChange={form.setInterestPeriod}
                items={INTEREST_PERIODS.map(p => ({ label: p, value: p }))}
                label="Interest period"
                invalid={isMissing('interestPeriod')}
              />
            </>
          )}
        </>
      )}

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  readOnlyValue: {
    fontSize: 16,
    paddingVertical: 8,
  },
  reuseBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
  },
  reuseBannerText: {
    fontSize: 13,
  },
  reuseBannerClear: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dueDateButton: {
    flex: 1,
  },
  error: {
    marginTop: 12,
  },
});

export default LoanFormFields;
