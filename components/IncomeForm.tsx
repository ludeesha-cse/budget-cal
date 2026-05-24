import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Check } from 'lucide-react-native';
import { formatDateString } from '../utils/date';
import { getAccountBalances, getAccounts, getTags } from '../db/queries';
import Card from './Card';
import CollapsiblePicker from './CollapsiblePicker';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from './NumericInputAccessory';
import { useTheme } from '../contexts/ThemeContext';
import { scaleFont, typography } from '../theme/typography';

// Same exclusion as TransactionForm — Liability/Receivable accounts only
// ever move through the loan flows, and Income never gets posted to a
// closed account.
const NON_TRANSACTABLE_ACCOUNT_TYPES = ['Liability', 'Receivable'];

export type IncomeFormSubmitValues = {
  date: string; // 'YYYY-MM-DD'
  amount: number;
  accountId: number;
  currencyId: number;
  description: string;
  tagIds: number[]; // Stage 15 — the caller passes this straight to setTransactionTags after the transaction itself is saved
  excludeFromBudget: boolean; // Stage 16a — real income that shouldn't count toward budgets or reports
};

type IncomeFormProps = {
  onSubmit: (values: IncomeFormSubmitValues) => void;
  submitLabel?: string;
};

// Deliberately no category field anywhere in this component — Income
// entries carry no category at all (transactions.categoryId is nullable
// specifically so this form never has to pick one).
function IncomeForm({
  onSubmit,
  submitLabel = 'Save',
}: IncomeFormProps): React.JSX.Element {
  const { colors } = useTheme();
  const [date, setDate] = useState(formatDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof getAccounts>>>(
    [],
  );
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountBalances, setAccountBalances] = useState<
    Awaited<ReturnType<typeof getAccountBalances>>
  >([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [tags, setTags] = useState<Awaited<ReturnType<typeof getTags>>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getAccounts().then(rows => {
        const selectable = rows.filter(
          a => a.active && !NON_TRANSACTABLE_ACCOUNT_TYPES.includes(a.type),
        );
        setAccounts(selectable);
        setAccountId(current =>
          current != null && selectable.some(a => a.id === current)
            ? current
            : selectable[0]?.id ?? null,
        );
      });
      getTags().then(setTags);
    }, []),
  );

  const toggleTag = (tagId: number) => {
    setSelectedTagIds(current =>
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId],
    );
  };

  // Same reset-on-switch behavior as TransactionForm: a new account
  // always re-derives its currency choice rather than keeping a stale one.
  useEffect(() => {
    if (accountId == null) {
      setAccountBalances([]);
      setCurrencyId(null);
      return;
    }
    let cancelled = false;
    getAccountBalances(accountId).then(balances => {
      if (cancelled) {
        return;
      }
      setAccountBalances(balances);
      setCurrencyId(balances.length === 1 ? balances[0].currencyId : null);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setDate(formatDateString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
  };

  const handleSubmit = () => {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount)) {
      setError('Enter a valid amount');
      return;
    }
    if (accountId == null) {
      setError('Select an account');
      return;
    }
    if (currencyId == null) {
      setError('Select a currency');
      return;
    }
    setError(null);
    onSubmit({
      date,
      amount: parsedAmount,
      accountId,
      currencyId,
      description,
      tagIds: selectedTagIds,
      excludeFromBudget,
    });
  };

  const selectedAccountName =
    accounts.find(a => a.id === accountId)?.name ?? 'Select account';

  const canSave =
    amount.trim() !== '' &&
    !Number.isNaN(Number(amount)) &&
    accountId != null &&
    currencyId != null;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        ACCOUNT
      </Text>
      <CollapsiblePicker
        displayLabel={selectedAccountName}
        selectedValue={accountId != null ? String(accountId) : ''}
        onValueChange={value => setAccountId(Number(value))}
        items={accounts.map(a => ({ label: a.name, value: String(a.id) }))}
      />

      {accountBalances.length > 1 && (
        <>
          <Text
            style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
            CURRENCY
          </Text>
          <CollapsiblePicker
            displayLabel={
              accountBalances.find(b => b.currencyId === currencyId)
                ?.currencyCode ?? 'Select currency'
            }
            selectedValue={currencyId != null ? String(currencyId) : ''}
            onValueChange={value => setCurrencyId(Number(value))}
            items={accountBalances.map(b => ({
              label: `${b.currencyCode} — ${b.currencyName}`,
              value: String(b.currencyId),
            }))}
          />
        </>
      )}

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        DATE
      </Text>
      <Button
        title={date}
        color={colors.primary}
        onPress={() => {
          Keyboard.dismiss();
          setShowDatePicker(true);
        }}
      />
      {Platform.OS === 'android' ? (
        showDatePicker && (
          <DateTimePicker
            value={new Date(date)}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )
      ) : (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowDatePicker(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}>
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
              <Button
                title="Done"
                color={colors.primary}
                onPress={() => setShowDatePicker(false)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        AMOUNT
      </Text>
      <TextInput
        style={[
          typography.amountLarge,
          styles.amountInput,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />
      <NumericInputAccessory />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        DESCRIPTION
      </Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
        ]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
        placeholderTextColor={colors.textSecondary}
      />

      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        TAGS
      </Text>
      {tags.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          No tags yet — add some from Settings.
        </Text>
      ) : (
        <View style={styles.tagRow}>
          {tags.map(tag => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <Pressable
                key={tag.id}
                style={[
                  styles.tagChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => toggleTag(tag.id)}>
                {selected && <Check size={12} color={colors.primaryText} strokeWidth={3} />}
                <Text
                  style={[
                    styles.tagChipText,
                    { color: colors.text },
                    selected && { color: colors.primaryText },
                  ]}>
                  {tag.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Card colors={colors} style={styles.checkboxCard}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setExcludeFromBudget(current => !current)}>
          <View
            style={[
              styles.checkboxBox,
              { borderColor: colors.primary },
              excludeFromBudget && { backgroundColor: colors.primary },
            ]}>
            {excludeFromBudget && (
              <Check size={13} color={colors.primaryText} strokeWidth={3} />
            )}
          </View>
          <View style={styles.checkboxLabelArea}>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>
              Exclude from budget
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Still real income, but won't count toward budgets or reports.
            </Text>
          </View>
        </Pressable>
      </Card>

      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}

      <Pressable
        disabled={!canSave}
        style={[
          styles.submitButton,
          { backgroundColor: !canSave ? colors.neutralSoft : colors.primary },
        ]}
        onPress={handleSubmit}>
        <Text
          style={[
            styles.submitButtonText,
            { color: !canSave ? colors.textSecondary : colors.primaryText },
          ]}>
          {submitLabel}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  amountInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    marginTop: 12,
  },
  hint: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tagChipText: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  checkboxCard: {
    padding: 14,
    marginTop: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabelArea: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    marginBottom: 2,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  submitButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
});

export default IncomeForm;
