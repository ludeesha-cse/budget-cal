import React, { useState } from 'react';
import { Button, Keyboard, Modal, Platform, Pressable, StyleSheet } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDateString } from '../../utils/date';

type Props = {
  // null is only meaningful for optional date fields (e.g. an installment
  // plan's due date) — the trigger falls back to `placeholder`, and the
  // picker itself opens on today's date rather than crashing on `new
  // Date(null)`. Screens that clear a date back to null keep their own
  // "Clear" affordance outside this component; DateField only opens/edits.
  value: string | null; // 'YYYY-MM-DD'
  onChange: (date: string) => void;
  placeholder?: string;
  // Most screens are fine with the default plain <Button> trigger. A couple
  // of inline/compact spots (e.g. a pill-styled date chip next to a
  // contribution row) need their own look — this hands back the resolved
  // label and open handler so the screen can render whatever trigger it
  // wants without duplicating the picker/Modal machinery below.
  renderTrigger?: (label: string, onPress: () => void) => React.ReactNode;
};

// Wraps @react-native-community/datetimepicker's two very different native
// presentations behind one component: Android shows its own dialog inline
// (no wrapper needed, and it dismisses itself on pick/cancel), while iOS has
// no built-in dismiss chrome, so it's shown inside a bottom-sheet-style
// Modal with an explicit Done button. Screens only ever see a plain
// 'YYYY-MM-DD' string in and out.
function DateField({
  value,
  onChange,
  placeholder = 'Select date',
  renderTrigger,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const pickerValue = value ? new Date(value) : new Date();

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      onChange(formatDateString(selectedDate));
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
            onChange={handleChange}
          />
        )
      ) : (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}>
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="spinner"
                onChange={handleChange}
              />
              <Button title="Done" color={colors.primary} onPress={() => setShowPicker(false)} />
            </Pressable>
          </Pressable>
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
});

export default DateField;
