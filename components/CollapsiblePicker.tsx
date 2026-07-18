import React, { useContext, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { BottomSheetPickerContext } from './BottomSheetModal';
import { typography, scaleFont } from '../theme/typography';
import { fieldErrorStyle } from '../utils/formFieldStyle';

export type CollapsiblePickerOption = {
  label: string;
  value: string;
};

type CollapsiblePickerProps = {
  displayLabel: string;
  selectedValue: string;
  onValueChange: (value: string) => void;
  items: CollapsiblePickerOption[];
  // The field's own name (e.g. "Currency", "Account type") — shown as the
  // picker's title, whether it hands off to a parent BottomSheetModal (see
  // below) or opens its own standalone one.
  label?: string;
  // True when this is a required field the user has left unset AND they
  // have tried to submit — see hooks/useFieldErrors. Draws the same red
  // outline a text input gets, so "what's missing?" reads the same way
  // whatever kind of control the answer is.
  invalid?: boolean;
};

function CollapsiblePicker({
  displayLabel,
  selectedValue,
  onValueChange,
  items,
  label,
  invalid = false,
}: CollapsiblePickerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const pickerHost = useContext(BottomSheetPickerContext);

  // Selecting an option always collapses the list, even when it's the
  // option already selected — a native Picker's onValueChange only fires
  // on an actual change, so re-tapping the current value wouldn't close it.
  const handleSelect = (value: string) => {
    onValueChange(value);
    setExpanded(false);
  };

  const handlePress = () => {
    if (pickerHost) {
      pickerHost.openPicker({
        title: label ?? 'Select',
        items,
        selectedValue,
        onSelect: onValueChange,
      });
      return;
    }
    setExpanded(true);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.button,
          { backgroundColor: colors.surface, borderColor: colors.border },
          fieldErrorStyle(colors, invalid),
        ]}
        onPress={handlePress}>
        <Text style={[styles.buttonText, { color: colors.text }]}>
          {displayLabel}
        </Text>
      </Pressable>
      {!pickerHost && (
        <Modal
          transparent
          visible={expanded}
          animationType="slide"
          onRequestClose={() => setExpanded(false)}>
          <View style={styles.modalFill}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setExpanded(false)}
            />
            <View
              style={[
                styles.modalSheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              {label && (
                <Text
                  style={[typography.cardTitle, styles.modalTitle, { color: colors.text }]}>
                  {label}
                </Text>
              )}
              <ScrollView showsVerticalScrollIndicator={false}>
                {items.map((item, index) => (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.option,
                      { borderBottomColor: colors.border },
                      index === items.length - 1 && styles.optionLast,
                    ]}
                    onPress={() => handleSelect(item.value)}>
                    <Text
                      style={[
                        styles.optionText,
                        { color: colors.text },
                        item.value === selectedValue && styles.optionTextSelected,
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: {
    fontSize: 16,
  },
  modalFill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalTitle: {
    marginBottom: 12,
  },
  option: {
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionText: {
    fontSize: scaleFont(16),
  },
  optionTextSelected: {
    fontWeight: '700',
  },
});

export default CollapsiblePicker;
