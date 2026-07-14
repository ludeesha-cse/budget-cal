import { useCallback, useRef, useState } from 'react';
import { useAsyncAction } from './useAsyncAction';

// Every "add/edit this kind of thing in a BottomSheetModal" screen in this
// app (Tags, Currencies, Categories, Savings Goals, Recurring Rules, ...)
// hand-rolled the same handful of pieces: a `visible` flag, an
// `editingId` that's null for "adding" and set for "editing", one piece
// of form state, a reset-then-open pair for Add/Edit, a canSave check
// derived from that state, and a submit that branches on editingId to
// call either a create or an update function, then closes the sheet and
// reloads. This hook is that shape, factored out once.
//
// TRow is whatever row shape the list this form edits already has
// (needs an `id` so openEdit can pull it out); TValues is the shape of
// the form's own editable state; TParams is whatever the create/update
// mutation functions actually expect once the form's raw strings have
// been parsed/trimmed/converted.
export interface UseEntityFormModalConfig<
  TRow extends { id: number },
  TValues,
  TParams,
> {
  initialValues: TValues;
  // Only ever called by openEdit — for add-only screens (no onUpdate)
  // this is still required by the type but never actually invoked.
  populateFromRow: (row: TRow) => TValues;
  // Returns an error message if `values` isn't submittable yet, or null
  // if it is. Drives both `canSave` (real-time, as the user types) and
  // the `error` surfaced if submit() somehow runs anyway.
  validate: (values: TValues) => string | null;
  toParams: (values: TValues) => TParams;
  onCreate: (params: TParams) => Promise<unknown>;
  // Omit entirely for an add-only screen (e.g. CurrenciesScreen, which
  // has no edit flow) — openEdit simply should never be called in that
  // case, so this is never reached.
  onUpdate?: (id: number, params: TParams) => Promise<unknown>;
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>;
  // Title shown on the Alert if onCreate/onUpdate rejects — kept
  // per-screen (rather than one generic string) so each entity keeps its
  // own exact wording ("Cannot save tag", "Cannot add currency", ...).
  errorTitle: string;
}

export interface UseEntityFormModalResult<TRow, TValues> {
  visible: boolean;
  editingId: number | null;
  values: TValues;
  setValues: React.Dispatch<React.SetStateAction<TValues>>;
  error: string | null;
  canSave: boolean;
  openAdd: () => void;
  openEdit: (row: TRow) => void;
  close: () => void;
  submit: () => Promise<void>;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
  // Wire straight into this form's <BottomSheetModal onFullyClosed=...>.
  // Fires once that sheet's real native Modal has actually finished
  // closing (later than `visible` going false).
  notifyFullyClosed: () => void;
  // Resolves the next time notifyFullyClosed() fires. Only an onCreate
  // that needs to present a second native Modal right after this one
  // closes (the free-tier paywall gating) should await this — awaiting
  // it without the sheet ever actually closing again would hang forever,
  // same as any unresolved promise.
  waitForFullyClosed: () => Promise<void>;
}

export function useEntityFormModal<
  TRow extends { id: number },
  TValues,
  TParams,
>(
  config: UseEntityFormModalConfig<TRow, TValues, TParams>,
): UseEntityFormModalResult<TRow, TValues> {
  const {
    initialValues,
    populateFromRow,
    validate,
    toParams,
    onCreate,
    onUpdate,
    onSaved,
    errorTitle,
  } = config;

  const runAction = useAsyncAction();
  const [visible, setVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [values, setValues] = useState<TValues>(initialValues);
  const [error, setError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setValues(initialValues);
    setError(null);
    setVisible(true);
  }, [initialValues]);

  const openEdit = useCallback(
    (row: TRow) => {
      setEditingId(row.id);
      setValues(populateFromRow(row));
      setError(null);
      setVisible(true);
    },
    [populateFromRow],
  );

  const close = useCallback(() => {
    setVisible(false);
    setEditingId(null);
    setValues(initialValues);
    setError(null);
  }, [initialValues]);

  const closeWaitersRef = useRef<Array<() => void>>([]);

  const notifyFullyClosed = useCallback(() => {
    const waiters = closeWaitersRef.current;
    closeWaitersRef.current = [];
    waiters.forEach(resolve => resolve());
  }, []);

  const waitForFullyClosed = useCallback(
    () =>
      new Promise<void>(resolve => {
        closeWaitersRef.current.push(resolve);
      }),
    [],
  );

  const canSave = validate(values) === null;

  const submit = useCallback(async () => {
    const validationError = validate(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const params = toParams(values);
    await runAction(async () => {
      if (editingId != null) {
        if (!onUpdate) {
          // Defensive only — an add-only screen (no onUpdate) should
          // never reach here since it never calls openEdit, so
          // editingId can never become non-null in the first place.
          throw new Error(
            'useEntityFormModal: editingId is set but no onUpdate was provided.',
          );
        }
        await onUpdate(editingId, params);
      } else {
        await onCreate(params);
      }
      close();
      await onSaved?.();
    }, errorTitle);
  }, [values, editingId, onUpdate, onCreate, onSaved, errorTitle, toParams, validate, runAction, close]);

  return {
    visible,
    editingId,
    values,
    setValues,
    error,
    canSave,
    openAdd,
    openEdit,
    close,
    submit,
    setVisible,
    notifyFullyClosed,
    waitForFullyClosed,
  };
}
