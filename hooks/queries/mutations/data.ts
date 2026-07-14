import { importData, wipeAllData } from '../../../db/queries';
import { invalidates, useDbMutation } from '../invalidation';

// A wipe or an import can change literally any row in the database, so
// both clear the whole cache rather than pretending to have a blast
// radius worth enumerating.

export function useWipeAllData() {
  return useDbMutation(wipeAllData, invalidates.everything);
}

export function useImportData() {
  return useDbMutation(importData, invalidates.everything);
}
