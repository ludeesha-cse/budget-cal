import { useCallback } from 'react';
import { Alert } from 'react-native';
import { reportError } from '../utils/appErrors';
import type { ErrorContext } from '../utils/appErrors';

export type AsyncActionOptions = Omit<ErrorContext, 'operation'> & {
  // Called INSTEAD of the Alert when the error belongs to one form field
  // (an AppError with `field` set — e.g. 'account' for "Insufficient
  // balance"), so the form can show the sentence next to that control.
  // Leave it out and the field error is shown as an Alert like any other.
  onFieldError?: (field: string, message: string) => void;
};

export type RunAsyncAction = (
  action: () => Promise<void>,
  errorTitle: string,
  options?: AsyncActionOptions,
) => Promise<boolean>;

// Every mutation handler in this app (save, delete, undo, settle, ...)
// hand-rolled the same shape: run the mutation, reload the list, and on
// failure show an Alert with the same error-message extraction. This hook
// is just that shape, factored out once, so call sites only ever supply
// the action itself and the title to show if it fails.
//
// The message shown is ALWAYS the one toUserMessage produces (see
// utils/appErrors.ts): an AppError's own sentence, or a plain-language
// one for a recognised SQLite failure, or a safe fallback — never raw
// SQLite / JavaScript text. The technical cause is logged under
// `errorTitle`, so it is still there for debugging.
//
// Resolves to true when the action succeeded, false when it failed —
// existing callers that ignore the result keep working unchanged.
export function useAsyncAction(): RunAsyncAction {
  return useCallback(
    async (
      action: () => Promise<void>,
      errorTitle: string,
      options: AsyncActionOptions = {},
    ) => {
      try {
        await action();
        return true;
      } catch (e) {
        const { onFieldError, ...context } = options;
        const appError = reportError(e, { ...context, operation: errorTitle });
        if (appError.field && onFieldError) {
          onFieldError(appError.field, appError.message);
        } else {
          Alert.alert(errorTitle, appError.message);
        }
        return false;
      }
    },
    [],
  );
}
