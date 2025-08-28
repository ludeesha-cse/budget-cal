import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
        style={styles.button}
        onPress={() => setExpanded(current => !current)}>
        <Text style={styles.buttonText}>{displayLabel}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.optionsOverlay}>
          {items.map((item, index) => (
            <Pressable
              key={item.value}
              style={[
                styles.option,
                index === items.length - 1 && styles.optionLast,
              ]}
              onPress={() => handleSelect(item.value)}>
              <Text
                style={[
                  styles.optionText,
                  item.value === selectedValue && styles.optionTextSelected,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
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
    borderColor: '#999',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 6,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
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
