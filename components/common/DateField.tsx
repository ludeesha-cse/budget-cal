import React, { useState } from 'react';
import { Button, Keyboard, Modal, Platform, Pressable, StyleSheet } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDateString } from '../../utils/date';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MAX_SHEET_WIDTH } from '../../theme/layout';
import SafeAreaBottomSpacer from './SafeAreaBottomSpacer';

type Props = {

  value: string | null; // 'YYYY-MM-DD'
  onChange: (date: string) => void;
  placeholder?: string;
  // Latest selectable date, 'YYYY-MM-DD'. Opt-in rather than always
  // "today", because plenty of dates in this app are legitimately in the
  // future — a loan's due date, a savings goal's target, an installment
  // plan's start date. It is the dates that record something that ALREADY
  // HAPPENED — paying an installment, confirming a recurring entry — that
  // must not be settable ahead of today, and those pass maxDate={today}.
  maxDate?: string;
  renderTrigger?: (label: string, onPress: () => void) => React.ReactNode;
};

function DateField({
  value,
  onChange,
  placeholder = 'Select date',
  maxDate,
  renderTrigger,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const maximumDate = maxDate ? new Date(`${maxDate}T00:00:00`) : undefined;
  // A value already past the cap would otherwise open the picker on a
  // date the picker itself refuses to show, which reads as the spinner
  // silently jumping. Opening on the cap is the honest starting point.
  const pickerValue =
    maxDate && value && value > maxDate
      ? (maximumDate as Date)
      : value
        ? new Date(value)
        : new Date();

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      const picked = formatDateString(selectedDate);
      // iOS's spinner is bounded by maximumDate, but the belt-and-braces
      // clamp here also covers Android builds where the bound is only
      // advisory on some OEM pickers.
      onChange(maxDate && picked > maxDate ? maxDate : picked);
    }
    // Android's native dialog dismisses itself on pick/cancel; the iOS
    // popup modal (below) is closed explicitly via its Done button instead.
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
  };

  const openPicker = () => {
    Keyboard.dismiss();
    setShowPicker(true);
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(value ?? placeholder, openPicker)
      ) : (
        <Button title={value ?? placeholder} color={colors.primary} onPress={openPicker} />
      )}
      {Platform.OS === 'android' ? (
        showPicker && (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="default"
            maximumDate={maximumDate}
            onChange={handleChange}
          />
        )
      ) : (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}>
          <SafeAreaProvider>
            <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
              <Pressable
                style={[styles.modalCard, { backgroundColor: colors.surface }]}
                onPress={() => {}}>
                <DateTimePicker
                  value={pickerValue}
                  mode="date"
                  display="spinner"
                  maximumDate={maximumDate}
                  onChange={handleChange}
                />
                <Button title="Done" color={colors.primary} onPress={() => setShowPicker(false)} />
                <SafeAreaBottomSpacer />
              </Pressable>
            </Pressable>
          </SafeAreaProvider>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalCard: {
    width: '100%',
    maxWidth: MAX_SHEET_WIDTH,
    alignSelf: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 16,
  },
});

export default DateField;
