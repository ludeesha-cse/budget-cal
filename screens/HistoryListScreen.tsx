import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenBackground from '../components/ScreenBackground';
import type { HistoryStackParamList } from '../navigation/types';
import NumericInputAccessory from '../components/NumericInputAccessory';
import { MONTH_OPTIONS } from '../components/MonthYearPicker';
import EmptyState from '../components/common/EmptyState';
import LoadErrorState from '../components/common/LoadErrorState';
import SearchAndTagFilterBar from '../components/history/SearchAndTagFilterBar';
import LoanPaymentRow from '../components/history/LoanPaymentRow';
import LoanOriginationRow from '../components/history/LoanOriginationRow';
import TransferRow from '../components/history/TransferRow';
import TransactionRow from '../components/history/TransactionRow';
import EditTransferModal from '../components/history/EditTransferModal';
import EditLoanPaymentModal from '../components/history/EditLoanPaymentModal';
import { useTransactionHistoryFilters } from '../hooks/useTransactionHistoryFilters';
import { useTransactionHistoryData } from '../hooks/useTransactionHistoryData';
import { useEditTransferModal } from '../hooks/useEditTransferModal';
import { useEditLoanPaymentModal } from '../hooks/useEditLoanPaymentModal';
import { useTransactionActions } from '../hooks/useTransactionActions';
import { useTheme } from '../contexts/ThemeContext';
import { typography } from '../theme/typography';

function RowSeparator(): React.JSX.Element {
  const { colors } = useTheme();
  return <View style={[styles.separator, { backgroundColor: colors.border }]} />;
}

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

function HistoryListScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const filters = useTransactionHistoryFilters();
  const { month, year, isSearchMode, debouncedQuery, activeTagFilterIds } = filters;

  const { rows, loading, loadFailed, retry, tagsByTransactionId, defaultCurrencyId } =
    useTransactionHistoryData({
      month,
      year,
      isSearchMode,
      debouncedQuery,
      activeTagFilterIds,
    });

  const editTransferModal = useEditTransferModal();
  const editLoanPaymentModal = useEditLoanPaymentModal();
  const { handleDelete, handleDeleteTransfer, handleDeleteLoanPayment } =
    useTransactionActions();

  return (
    <ScreenBackground colors={colors} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[typography.eyebrow, styles.eyebrow, { color: colors.primary }]}>
            {isSearchMode
              ? 'Search'
              : month
                ? `${MONTH_OPTIONS.find(m => m.value === month)?.label ?? ''} ${year}`.toUpperCase()
                : `All ${year}`}
          </Text>
          <Text style={[typography.screenTitle, { color: colors.text }]}>History</Text>
        </View>

        <SearchAndTagFilterBar filters={filters} />

        <Text style={[typography.eyebrow, styles.recentLabel, { color: colors.textSecondary }]}>
          {isSearchMode ? 'Results' : 'Recent'}
        </Text>

        {loadFailed ? (
          <LoadErrorState
            what={isSearchMode ? 'your search results' : 'your history'}
            onRetry={retry}
          />
        ) : loading ? (
          <EmptyState message="Loading..." />
        ) : rows.length === 0 ? (
          <EmptyState message={isSearchMode ? 'No matches for your search.' : 'No transactions found.'} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={item => `${item.kind}-${item.data.id}`}
            style={styles.listCard}
            contentContainerStyle={[
              styles.listCardContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            ItemSeparatorComponent={RowSeparator}
            renderItem={({ item }) => {
              if (item.kind === 'loanPayment') {
                return (
                  <LoanPaymentRow
                    loanPayment={item.data}
                    onPress={() => editLoanPaymentModal.open(item.data)}
                    onDelete={() =>
                      handleDeleteLoanPayment(
                        item.data.id,
                        item.data.loanAccountType === 'Liability',
                      )
                    }
                  />
                );
              }

              if (item.kind === 'loanOrigination') {
                return <LoanOriginationRow origination={item.data} />;
              }

              if (item.kind === 'transfer') {
                return (
                  <TransferRow
                    transfer={item.data}
                    onPress={() => editTransferModal.open(item.data)}
                    onDelete={() => handleDeleteTransfer(item.data.id)}
                  />
                );
              }

              return (
                <TransactionRow
                  transaction={item.data}
                  tags={tagsByTransactionId[item.data.id] ?? []}
                  defaultCurrencyId={defaultCurrencyId}
                  onPress={() => navigation.navigate('EditTransaction', { id: item.data.id })}
                  onDelete={() => handleDelete(item.data.id)}
                />
              );
            }}
          />
        )}

        <EditTransferModal modal={editTransferModal} />
        <EditLoanPaymentModal modal={editLoanPaymentModal} />

        <NumericInputAccessory />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 12,
    marginBottom: 16,
  },
  eyebrow: {
    marginBottom: 4,
  },
  listCard: {
    flex: 1,
  },
  listCardContent: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 116,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  recentLabel: {
    marginTop: 18,
    marginBottom: 8,
  },
});

export default HistoryListScreen;
