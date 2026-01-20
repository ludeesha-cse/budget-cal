import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';

type SettingsHomeNavigationProp = NativeStackNavigationProp<
  SettingsStackParamList,
  'SettingsHome'
>;

type Props = {
  navigation: SettingsHomeNavigationProp;
};

function SettingsHomeScreen({ navigation }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('BudgetSettings')}>
        <Text style={styles.rowLabel}>Monthly Budget</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('Accounts')}>
        <Text style={styles.rowLabel}>Accounts</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('LiabilitiesReceivables')}>
        <Text style={styles.rowLabel}>Liabilities & Receivables</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('Categories')}>
        <Text style={styles.rowLabel}>Categories</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('CategoryBudgets')}>
        <Text style={styles.rowLabel}>Category Budgets</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('Currencies')}>
        <Text style={styles.rowLabel}>Currencies</Text>
        <Text style={styles.chevron}>{'>'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    color: '#999',
  },
});

export default SettingsHomeScreen;
