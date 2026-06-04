import React from 'react';
import { Text, TextInput, View } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
import CollapsiblePicker from '../CollapsiblePicker';
import DateField from '../common/DateField';
import EmptyState from '../common/EmptyState';
import NumericInputAccessory, {
  NUMERIC_KEYBOARD_ACCESSORY_ID,
} from '../NumericInputAccessory';
import { useTheme } from '../../contexts/ThemeContext';
import { labelForId } from '../../utils/pickerLabels';
import type { UseTransferResult } from '../../hooks/useTransfer';
import { sharedFormStyles as styles } from './sharedFormStyles';

type Props = {
  state: UseTransferResult;
};

// Transfers are a free-tier feature (Stage 11) — no PremiumGate anywhere
// in here, unlike PayOffCardModal's credit-card row.
function TransferModal({ state }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    visible,
    title,
    fromOptions,
    fromAccountId,
    setFromAccountId,
    fromCurrencyOptions,
    currencyId,
    setCurrencyId,
    toOptions,
    toAccountId,
    setToAccountId,
    amount,
    setAmount,
    date,
    setDate,
    canSave,
    summaryText,
    close,
    handleTransferSubmit,
  } = state;

  return (
    <BottomSheetModal
      visible={visible}
      onClose={close}
      onSave={handleTransferSubmit}
      canSave={canSave}
      title={title}
      saveLabel={title === 'Withdraw to Cash' ? 'Withdraw' : 'Transfer'}>
      <Text style={[styles.label, { color: colors.text }]}>From</Text>
      {fromOptions.length === 0 ? (
        <EmptyState message="No Bank, Cash, or Crypto Wallet accounts available." />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(fromOptions, fromAccountId, 'name', 'Select account')}
          selectedValue={fromAccountId}
          onValueChange={setFromAccountId}
          items={fromOptions.map(a => ({
            label: `${a.name} (${a.type})`,
            value: String(a.id),
          }))}
        />
      )}

      {fromAccountId ? (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Currency</Text>
          {fromCurrencyOptions.length === 0 ? (
            <EmptyState message="This account has no currency balances yet." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(
                fromCurrencyOptions.map(b => ({ ...b, id: b.currencyId })),
                currencyId,
                'currencyCode',
                'Select currency',
              )}
              selectedValue={currencyId}
              onValueChange={setCurrencyId}
              items={fromCurrencyOptions.map(b => ({
                label: `${b.currencyCode} — ${b.currencyName}`,
                value: String(b.currencyId),
              }))}
            />
          )}
        </>
      ) : null}

      {currencyId ? (
        <>
          <Text style={[styles.label, { color: colors.text }]}>To</Text>
          {toOptions.length === 0 ? (
            <EmptyState message="No other account holds this currency yet." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(toOptions, toAccountId, 'name', 'Select account')}
              selectedValue={toAccountId}
              onValueChange={setToAccountId}
              items={toOptions.map(a => ({
                label: `${a.name} (${a.type})`,
                value: String(a.id),
              }))}
            />
          )}
        </>
      ) : null}

      {summaryText && (
        <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
          {summaryText}
        </Text>
      )}

      <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
      <TextInput
        style={[
          styles.input,
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

      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <View style={styles.payOffDateRow}>
        <View style={styles.dueDateButton}>
          <DateField value={date} onChange={setDate} />
        </View>
      </View>

      <NumericInputAccessory />
    </BottomSheetModal>
  );
}

export default TransferModal;
