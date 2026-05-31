import { useCallback } from 'react';
import { Alert } from 'react-native';

// Every destructive confirm in this app (delete account, delete category,
// undo a payment, skip an occurrence, ...) built the exact same two-button
// Alert shape by hand — Cancel/dismiss plus a single destructive-styled
// action. This hook is just that shape, factored out once, so call sites
// only ever supply the copy and the action.
export function useConfirmDelete(): (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
) => void {
  return useCallback(
    (
      title: string,
      message: string,
      confirmLabel: string,
      onConfirm: () => void | Promise<void>,
    ) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmLabel, style: 'destructive', onPress: onConfirm },
      ]);
    },
    [],
  );
}
