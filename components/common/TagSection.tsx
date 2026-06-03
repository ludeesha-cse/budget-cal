import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TagPicker, { type TagOption } from './TagPicker';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';

type Props = {
  tags: TagOption[];
  selectedIds: number[];
  onChange: React.Dispatch<React.SetStateAction<number[]>>;
};

// The "TAGS" label + TagPicker, shared by TransactionForm and IncomeForm.
// Owns the toggle logic itself (byte-identical in both forms) so callers
// only need to hold the selectedIds state.
function TagSection({ tags, selectedIds, onChange }: Props): React.JSX.Element {
  const { colors } = useTheme();

  const toggleTag = (tagId: number) => {
    onChange(current =>
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId],
    );
  };

  return (
    <>
      <Text
        style={[typography.eyebrow, styles.label, { color: colors.textSecondary }]}>
        TAGS
      </Text>
      <TagPicker tags={tags} selectedIds={selectedIds} onToggle={toggleTag} />
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 16,
    marginBottom: 6,
  },
});

export default TagSection;
