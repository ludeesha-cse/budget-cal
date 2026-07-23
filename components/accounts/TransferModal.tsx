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
import { fieldErrorStyle } from '../../utils/formFieldStyle';
import type { UseTransferResult } from '../../hooks/useTransfer';
import { sharedFormStyles as styles } from './sharedFormStyles';

type Props = {
  state: UseTransferResult;
};

// Reads an account type the way the Accounts screen labels it, so the
// message below names the same thing the user is looking at.
const TYPE_LABELS: Record<string, string> = {
  Bank: 'bank',
  Cash: 'cash',
  CryptoWallet: 'crypto wallet',
};

// What to say when the source picker has nothing in it.
//
// WHY THIS IS NOT ONE FIXED STRING: the Withdraw shortcut narrows the
// source list to Bank accounts only, but this used to report the
// unnarrowed message — "No Bank, Cash, or Crypto Wallet accounts
// available" — even when the user had several cash accounts sitting
// right behind the sheet. That is an actively false statement, and a
// costly one: it reads as "the account you just made did not save",
// when the real situation was "the account you made is typed Cash, and
// this shortcut only accepts Bank". Naming the filtered type turns an
// apparent data-loss bug into a two-second fix the user can act on.
function emptySourceMessage(fromTypeFilter: string | null): string {
  if (!fromTypeFilter) {
    return 'No Bank, Cash, or Crypto Wallet accounts available.';
  }
  const label = TYPE_LABELS[fromTypeFilter] ?? fromTypeFilter;
  return `No ${label} accounts available. This shortcut only moves money out of ${label} accounts — check that the account you want is set to that type on the Accounts screen, or use Transfer instead.`;
}

// Transfers are a free-tier feature (Stage 11) — no PremiumGate anywhere
// in here, unlike PayOffCardModal's credit-card row.
function TransferModal({ state }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    visible,
    title,
    fromOptions,
    fromTypeFilter,
    fromAccountId,
    setFromAccountId,
    fromCurrencyOptions,
    currencyId,
    setCurrencyId,
    toOptions,
    toAccountId,
    setToAccountId,
    toCurrencyOptions,
    toCurrencyId,
    setToCurrencyId,
    amount,
    setAmount,
    convertedAmount,
    setConvertedAmount,
    isCrossCurrency,
    rateHint,
    date,
    setDate,
    canSave,
    isMissing,
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
        <EmptyState message={emptySourceMessage(fromTypeFilter)} />
      ) : (
        <CollapsiblePicker
          displayLabel={labelForId(fromOptions, fromAccountId, 'name', 'Select account')}
          selectedValue={fromAccountId}
          onValueChange={setFromAccountId}
          items={fromOptions.map(a => ({
            label: `${a.name} (${a.type})`,
            value: String(a.id),
          }))}
          label="From"
          invalid={isMissing('fromAccountId')}
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
              label="Currency"
              invalid={isMissing('currencyId')}
            />
          )}
        </>
      ) : null}

      {currencyId ? (
        <>
          <Text style={[styles.label, { color: colors.text }]}>To</Text>
          {toOptions.length === 0 ? (
            <EmptyState message="No account is able to receive a transfer yet." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(toOptions, toAccountId, 'name', 'Select account')}
              selectedValue={toAccountId}
              onValueChange={setToAccountId}
              // The source account appears in this list too, which is
              // how an in-place conversion (BOC USD -> BOC LKR) is
              // expressed. The currency picker below then refuses to
              // offer the same currency back, so the one pairing that
              // moves nothing is unreachable rather than rejected on
              // save.
              items={toOptions.map(a => ({
                label:
                  String(a.id) === fromAccountId
                    ? `${a.name} (same account — convert)`
                    : `${a.name} (${a.type})`,
                value: String(a.id),
              }))}
              label="To"
              invalid={isMissing('toAccountId')}
            />
          )}
        </>
      ) : null}

      {toAccountId ? (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            Receive as
          </Text>
          {toCurrencyOptions.length === 0 ? (
            <EmptyState message="This account holds no other currency to receive into. Add the currency to the account first." />
          ) : (
            <CollapsiblePicker
              displayLabel={labelForId(
                toCurrencyOptions.map(b => ({ ...b, id: b.currencyId })),
                toCurrencyId,
                'currencyCode',
                'Select currency',
              )}
              selectedValue={toCurrencyId}
              onValueChange={setToCurrencyId}
              items={toCurrencyOptions.map(b => ({
                label: `${b.currencyCode} — ${b.currencyName}`,
                value: String(b.currencyId),
              }))}
              label="Receive as"
              invalid={isMissing('toCurrencyId')}
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
          fieldErrorStyle(colors, isMissing('amount')),
        ]}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        returnKeyType="done"
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
      />

      {isCrossCurrency && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>
            Converted amount
          </Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
              fieldErrorStyle(colors, isMissing('convertedAmount')),
            ]}
            value={convertedAmount}
            onChangeText={setConvertedAmount}
            keyboardType="numeric"
            returnKeyType="done"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />
          {/* The rate is a starting point, not a rule — banks differ
              from each other and from any published figure, so this
              line says which rate produced the number above and the
              field stays editable. Whatever is in it when Transfer is
              tapped is what gets stored. */}
          {rateHint && (
            <Text style={[styles.modalCurrent, { color: colors.textSecondary }]}>
              {rateHint}
            </Text>
          )}
        </>
      )}

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
