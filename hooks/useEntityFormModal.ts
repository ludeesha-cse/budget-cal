import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAsyncAction } from './useAsyncAction';
import { useFieldErrors } from './useFieldErrors';

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
  // Which required fields are currently empty, by key. Optional: a form
  // that does not supply it still gets the summary message from
  // `validate`, just no per-field outlines. Keys are the form's own
  // choice of name — whatever the components pass to isMissing().
  //
  // Kept separate from `validate` rather than folded into it because the
  // two answer different questions: validate says "can this be
  // submitted, and if not what should the one message say", while this
  // says "which controls should turn red". A field can be present but
  // invalid (an amount of -5), which belongs in the message, not in an
  // outline that means "you left this blank".
  requiredFields?: (values: TValues) => string[];
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
  // Fields this form shows a save-time message UNDER (see fieldMessage).
  // A failure that names any other field — or none — is shown as an
  // Alert titled errorTitle, as before.
  inlineErrorFields?: string[];
  // Used to name a duplicate in the message ("A category called 'Food'
  // already exists.") when the database reports one.
  describeForErrors?: (values: TValues) => { entity?: string; name?: string };
}

export interface UseEntityFormModalResult<TRow, TValues> {
  visible: boolean;
  editingId: number | null;
  // The row openEdit was called with, or null while adding. Kept
  // alongside editingId (rather than expecting callers to look the row
  // up again in a list they may not have) for wrappers that need to
  // compare the form's new values against what the row said BEFORE the
  // edit — useSavingsGoalForm does exactly that to warn when moving a
  // goal to an account that cannot cover what it has saved.
  editingRow: TRow | null;
  values: TValues;
  setValues: React.Dispatch<React.SetStateAction<TValues>>;
  error: string | null;
  canSave: boolean;
  // True when this required field is empty AND the user has already
  // tried to submit. Pass straight to fieldErrorStyle / a picker's
  // `invalid` prop.
  isMissing: (field: string) => boolean;
  // The save-time message for one field, or null. Cleared as soon as any
  // value changes.
  fieldMessage: (field: string) => string | null;
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
    requiredFields,
    toParams,
    onCreate,
    onUpdate,
    onSaved,
    errorTitle,
    inlineErrorFields,
    describeForErrors,
  } = config;

  const runAction = useAsyncAction();
  const [visible, setVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<TRow | null>(null);
  const [values, setRawValues] = useState<TValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>(
    {},
  );
  // A save-time message is about the values that were saved; the moment
  // the user changes one of them it no longer applies.
  const setValues = useCallback<React.Dispatch<React.SetStateAction<TValues>>>(
    updater => {
      setFieldMessages(current =>
        Object.keys(current).length === 0 ? current : {},
      );
      setRawValues(updater);
    },
    [],
  );
  const fieldErrors = useFieldErrors(requiredFields ? requiredFields(values) : []);
  // Read through a ref inside the callbacks below so they can clear the
  // reveal without taking fieldErrors' identity as a dependency — which
  // changes on every keystroke, and would otherwise rebuild openAdd,
  // openEdit and close (and therefore every callback listing them) on
  // every render.
  const resetFieldErrorsRef = useRef(fieldErrors.reset);
  resetFieldErrorsRef.current = fieldErrors.reset;
  const revealFieldErrorsRef = useRef(fieldErrors.reveal);
  revealFieldErrorsRef.current = fieldErrors.reveal;

  const openAdd = useCallback(() => {
    setEditingId(null);
    setEditingRow(null);
    setValues(initialValues);
    setError(null);
    // A freshly opened blank form is not a form the user has got wrong
    // yet, so nothing is highlighted until they try to save.
    resetFieldErrorsRef.current();
    setVisible(true);
  }, [initialValues, setValues]);

  const openEdit = useCallback(
    (row: TRow) => {
      setEditingId(row.id);
      setEditingRow(row);
      setValues(populateFromRow(row));
      setError(null);
      resetFieldErrorsRef.current();
      setVisible(true);
    },
    [populateFromRow, setValues],
  );

  const close = useCallback(() => {
    setVisible(false);
    setEditingId(null);
    setEditingRow(null);
    setValues(initialValues);
    setError(null);
    resetFieldErrorsRef.current();
  }, [initialValues, setValues]);

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
      // The press that could not save is exactly the moment to say which
      // controls are why — see hooks/useFieldErrors.
      revealFieldErrorsRef.current();
      return;
    }
    setError(null);
    resetFieldErrorsRef.current();
    const params = toParams(values);
    setFieldMessages({});
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
    }, errorTitle, {
      ...describeForErrors?.(values),
      onFieldError: inlineErrorFields
        ? (field, message) => {
            if (inlineErrorFields.includes(field)) {
              setFieldMessages({ [field]: message });
            } else {
              Alert.alert(errorTitle, message);
            }
          }
        : undefined,
    });
  }, [values, editingId, onUpdate, onCreate, onSaved, errorTitle, toParams, validate, runAction, close, inlineErrorFields, describeForErrors]);

  const fieldMessage = useCallback(
    (field: string) => fieldMessages[field] ?? null,
    [fieldMessages],
  );

  return {
    visible,
    editingId,
    editingRow,
    isMissing: fieldErrors.isMissing,
    fieldMessage,
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
