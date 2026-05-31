import { useCallback } from 'react';
import { Alert } from 'react-native';

// Every mutation handler in this app (save, delete, undo, settle, ...)
// hand-rolled the same shape: run the mutation, reload the list, and on
// failure show an Alert with the same error-message extraction. This hook
// is just that shape, factored out once, so call sites only ever supply
// the action itself and the title to show if it fails.
export function useAsyncAction(): (
  action: () => Promise<void>,
  errorTitle: string,
) => Promise<void> {
  return useCallback(async (action: () => Promise<void>, errorTitle: string) => {
    try {
      await action();
    } catch (e) {
      Alert.alert(errorTitle, e instanceof Error ? e.message : String(e));
    }
  }, []);
}
