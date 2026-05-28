import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';

export type ActionButtonTone = 'default' | 'danger' | 'success' | 'warning' | 'primary';

export type ActionButtonItem = {
  key: string;
  icon?: LucideIcon;
  label?: string;
  tone?: ActionButtonTone;
  onPress: () => void;
  // Filled/solid button (e.g. Installment Plans' "Pay Next") instead of the
  // default bordered outline pill. 'pill' variant only.
  solid?: boolean;
  // flex:1 on just this one item, so it stretches while its siblings stay
  // fixed-width (e.g. "Pay Next" grows, Edit/Delete don't). Distinct from
  // `equalWidth` on the row, which flexes every item evenly.
  grow?: boolean;
};

type Props = {
  items: ActionButtonItem[];
  // 'pill' = bordered icon+label button (edit/delete/toggle rows). 'icon' =
  // compact icon-only button (single-line list rows like Tags/Categories).
  variant?: 'pill' | 'icon';
  // Every item gets flex:1 + centered content, splitting the row evenly —
  // matches Recurring Rules' 3-way Edit/Deactivate/Delete split.
  equalWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

function ActionButtons({
  items,
  variant = 'pill',
  equalWidth = false,
  style,
}: Props): React.JSX.Element {
  const { colors } = useTheme();

  const toneColor = (tone: ActionButtonTone = 'default'): string => {
    switch (tone) {
      case 'danger':
        return colors.danger;
      case 'success':
        return colors.success;
      case 'warning':
        return colors.warning;
      case 'primary':
        return colors.primary;
      default:
        return colors.text;
    }
  };

  const toneBorder = (tone: ActionButtonTone = 'default'): string => {
    switch (tone) {
      case 'danger':
        return colors.dangerSoft;
      case 'success':
        return colors.success;
      case 'warning':
        return colors.warning;
      case 'primary':
        return colors.primary;
      default:
        return colors.border;
    }
  };

  if (variant === 'icon') {
    return (
      <View style={[styles.iconRow, style]}>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              hitSlop={8}
              style={styles.iconButton}
              onPress={item.onPress}>
              {Icon && <Icon size={16} color={toneColor(item.tone)} />}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.pillRow, style]}>
      {items.map(item => {
        const Icon = item.icon;
        const color = item.solid ? colors.primaryText : toneColor(item.tone);
        return (
          <Pressable
            key={item.key}
            style={[
              styles.pillButton,
              (equalWidth || item.grow) && styles.pillButtonGrow,
              (equalWidth || item.grow) && styles.pillButtonCentered,
              item.solid
                ? { backgroundColor: colors.primary }
                : {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: toneBorder(item.tone),
                  },
            ]}
            onPress={item.onPress}>
            {Icon && <Icon size={14} color={color} />}
            {item.label && (
              <Text style={[styles.pillButtonText, { color }]}>{item.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  iconRow: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    padding: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pillButtonGrow: {
    flex: 1,
  },
  pillButtonCentered: {
    justifyContent: 'center',
  },
  pillButtonText: {
    fontSize: scaleFont(12.5),
    fontWeight: '600',
  },
});

export default ActionButtons;
