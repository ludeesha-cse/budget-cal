import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

export type TagOption = { id: number; name: string };

type Props = {
  tags: TagOption[];
  selectedIds: number[];
  onToggle: (tagId: number) => void;
  emptyMessage?: string;
};

// Multi-select tag chip row, shared by TransactionForm and IncomeForm — a
// plain hint line when there are no tags yet, otherwise a wrapping row of
// toggleable chips. Selection is fully controlled: the caller owns
// `selectedIds` and reacts to `onToggle`, same convention as every other
// shared form control in this app.
function TagPicker({
  tags,
  selectedIds,
  onToggle,
  emptyMessage = 'No tags yet — add some from Settings.',
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  if (tags.length === 0) {
    return (
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{emptyMessage}</Text>
    );
  }

  return (
    <View style={styles.tagRow}>
      {tags.map(tag => {
        const selected = selectedIds.includes(tag.id);
        return (
          <Pressable
            key={tag.id}
            style={[
              styles.tagChip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              selected && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onToggle(tag.id)}>
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
  );
}

const styles = StyleSheet.create({
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
});

export default TagPicker;
