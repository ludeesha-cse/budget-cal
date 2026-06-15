import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import MonthYearPicker from '../MonthYearPicker';
import { useTheme } from '../../contexts/ThemeContext';
import { scaleFont } from '../../theme/typography';
import type { UseTransactionHistoryFiltersResult } from '../../hooks/useTransactionHistoryFilters';

type Props = {
  filters: UseTransactionHistoryFiltersResult;
};

// Search input + month/year picker + tag chips — the header (eyebrow/
// title) and the "Recent"/"Results" label above the list stay in the
// screen orchestrator, same pattern as every other section header on
// the other screens.
function SearchAndTagFilterBar({ filters }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const {
    month,
    setMonth,
    year,
    setYear,
    searchQuery,
    setSearchQuery,
    availableTags,
    activeTagFilterIds,
    toggleTagFilter,
    isSearchMode,
  } = filters;

  return (
    <View style={styles.searchArea}>
      <View style={[styles.searchInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search description, category, account..."
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Text style={[styles.clearSearchText, { color: colors.primary }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        {!isSearchMode || activeTagFilterIds.length === 0 ? (
          <MonthYearPicker
            month={month}
            year={year}
            onMonthChange={setMonth}
            onYearChange={setYear}
            includeAllMonths
          />
        ) : null}
        {availableTags.map(tag => {
          const active = activeTagFilterIds.includes(tag.id);
          return (
            <Pressable
              key={tag.id}
              style={[
                styles.tagChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => toggleTagFilter(tag.id)}>
              <Text
                style={[
                  styles.tagChipText,
                  { color: colors.text },
                  active && { color: colors.primaryText },
                ]}>
                {tag.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchArea: {
    gap: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: scaleFont(15),
    padding: 0,
  },
  clearSearchText: {
    fontWeight: '600',
    fontSize: scaleFont(13),
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tagChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagChipText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
  },
});

export default SearchAndTagFilterBar;
