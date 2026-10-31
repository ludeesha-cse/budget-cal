// Shared by the database integration tests: boots the app's real
// database layer (db/index.ts) against an in-memory SQLite, runs every
// migration and seed exactly as App.tsx does on launch, and keeps the
// query-hit logging quiet.
//
// Each test FILE gets its own fresh database: jest isolates module
// registries per file, so db/index.ts (and the client below) are created
// once per file.
import type { SqliteClient } from './sqliteClient';

let client: SqliteClient | null = null;

export function testClient(): SqliteClient {
  if (!client) {
    const { createSqliteClient } = require('./sqliteClient');
    client = createSqliteClient() as SqliteClient;
  }
  return client;
}

export async function bootDatabase(): Promise<void> {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const { runMigrations } = require('../../db');
  const { ensureDefaultAccount } = require('../../db/queries');
  await runMigrations();
  await ensureDefaultAccount();
}
