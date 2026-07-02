import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Card from '../Card';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

type Props = {
  checked: boolean;
  onToggle: () => void;
  hint: string;
};

function ExcludeFromBudgetCheckbox({
  checked,
  onToggle,
  hint,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Card colors={colors} style={styles.checkboxCard}>
      <Pressable style={styles.checkboxRow} onPress={onToggle}>
        <View
          style={[
            styles.checkboxBox,
            { borderColor: colors.primary },
            checked && { backgroundColor: colors.primary },
          ]}>
          {checked && (
            <Check size={13} color={colors.primaryText} strokeWidth={3} />
          )}
        </View>
        <View style={styles.checkboxLabelArea}>
          <Text style={[styles.checkboxLabel, { color: colors.text }]}>
            Exclude from budget
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {hint}
          </Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
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
  hint: {
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
  },
});

export default ExcludeFromBudgetCheckbox;
