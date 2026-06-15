import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getTags } from '../db/queries';
import { getCurrentMonthString, getCurrentYearString } from '../utils/date';

export type TagRow = Awaited<ReturnType<typeof getTags>>[number];

export interface UseTransactionHistoryFiltersResult {
  month: string;
  setMonth: (month: string) => void;
  year: string;
  setYear: (year: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  debouncedQuery: string;
  availableTags: TagRow[];
  activeTagFilterIds: number[];
  toggleTagFilter: (tagId: number) => void;
  isSearchMode: boolean;
}

// History's month/year selection plus its search + tag-filter state.
// searchQuery is what the TextInput shows; debouncedQuery is what
// actually drives the query, updated ~300ms after typing stops so a
// search doesn't refire on every keystroke. Neither one, nor
// activeTagFilterIds, ever resets month/year — that's what makes
// "clear the search" restore the previous month/year selection for
// free, with no special-case code needed anywhere.
export function useTransactionHistoryFilters(): UseTransactionHistoryFiltersResult {
  const [month, setMonth] = useState(getCurrentMonthString().slice(5));
  const [year, setYear] = useState(getCurrentYearString());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagRow[]>([]);
  const [activeTagFilterIds, setActiveTagFilterIds] = useState<number[]>([]);

  // Search mode kicks in the moment there's something to search or
  // filter by — a non-empty query OR at least one active tag chip —
  // regardless of which one triggered it.
  const isSearchMode =
    debouncedQuery.trim().length > 0 || activeTagFilterIds.length > 0;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      getTags().then(setAvailableTags);
    }, []),
  );

  const toggleTagFilter = (tagId: number) => {
    setActiveTagFilterIds(current =>
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId],
    );
  };

  return {
    month,
    setMonth,
    year,
    setYear,
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    availableTags,
    activeTagFilterIds,
    toggleTagFilter,
    isSearchMode,
  };
}
