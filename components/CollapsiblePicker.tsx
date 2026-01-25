import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export type CollapsiblePickerOption = {
  label: string;
  value: string;
};

type CollapsiblePickerProps = {
  displayLabel: string;
  selectedValue: string;
  onValueChange: (value: string) => void;
  items: CollapsiblePickerOption[];
};

function CollapsiblePicker({
  displayLabel,
  selectedValue,
  onValueChange,
  items,
}: CollapsiblePickerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Selecting an option always collapses the list, even when it's the
  // option already selected — a native Picker's onValueChange only fires
  // on an actual change, so re-tapping the current value wouldn't close it.
  const handleSelect = (value: string) => {
    onValueChange(value);
    setExpanded(false);
  };

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      <Pressable
        style={[
          styles.button,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setExpanded(current => !current)}>
        <Text style={[styles.buttonText, { color: colors.text }]}>
          {displayLabel}
        </Text>
      </Pressable>
      {expanded && (
        // Capped height + internal scroll so long option lists (e.g. many
        // currencies) don't overflow off-screen.
        <View
          style={[
            styles.optionsOverlay,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <ScrollView
            style={styles.optionsScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            {items.map((item, index) => (
              <Pressable
                key={item.value}
                style={[
                  styles.option,
                  { backgroundColor: colors.surface, borderBottomColor: colors.border },
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  containerExpanded: {
    zIndex: 10,
    elevation: 10,
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
  optionsOverlay: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 240,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 6,
  },
  optionsScroll: {
    maxHeight: 240,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionText: {
    fontSize: 16,
  },
  optionTextSelected: {
    fontWeight: '700',
  },
});

export default CollapsiblePicker;
