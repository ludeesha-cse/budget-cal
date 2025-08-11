/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { runMigrations } from './db';
import DbTestScreen from './screens/DbTestScreen';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [migrationsReady, setMigrationsReady] = useState(false);
  const [migrationError, setMigrationError] = useState<Error | null>(null);

  useEffect(() => {
    runMigrations()
      .then(() => setMigrationsReady(true))
      .catch(setMigrationError);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {migrationError ? (
        <View style={styles.center}>
          <Text>Database setup failed: {migrationError.message}</Text>
        </View>
      ) : migrationsReady ? (
        <DbTestScreen />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Setting up database...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
});

export default App;
