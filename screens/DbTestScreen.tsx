import React, { useCallback, useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { addTransaction, getTransactions } from '../db/queries';

type TransactionRow = Awaited<ReturnType<typeof getTransactions>>[number];

function DbTestScreen(): React.JSX.Element {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    const rows = await getTransactions();
    setTransactions(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleAddSample = async () => {
    // Satisfy transactions.account_id's foreign key with a fixed dummy
    // account row, inserted once via a raw statement (drizzle has no
    // "insert if row with this id doesn't exist" helper for a fixed id).
    await db.run(
      sql`INSERT OR IGNORE INTO accounts (id, name, type, balance, created_at) VALUES (1, 'Sample Account', 'checking', 0, ${Date.now()})`,
    );
    await addTransaction({
      accountId: 1,
      amount: -12.5,
      category: 'Groceries',
      description: 'Sample transaction',
      date: Date.now(),
    });
    await loadTransactions();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DB Test Screen</Text>
      <Text style={styles.count}>
        {loading ? 'Loading...' : `Transaction count: ${transactions.length}`}
      </Text>
      <Button title="Add sample transaction" onPress={handleAddSample} />
      <FlatList
        style={styles.list}
        data={transactions}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Text style={styles.row}>
            #{item.id} · {item.category} · {item.amount}
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  count: {
    fontSize: 16,
    marginBottom: 16,
  },
  list: {
    marginTop: 16,
  },
  row: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
});

export default DbTestScreen;
