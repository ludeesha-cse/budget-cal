import { useCallback, useState } from 'react';

// The shape behind every "tap a row to act on it" sheet in this app —
// settle a loan, pay off a credit card, undo an installment payment,
// transfer between accounts. Unlike useEntityFormModal (which toggles
// between "adding" and "editing an id" against a list), these are driven
// by a single nullable *target* object: nothing is open while it's null,
// and opening always both sets the target and seeds the form's values
// from it in one step, so the two can never end up out of sync with each
// other (there's no separate "visible" flag to forget to flip).
//
// TTarget is whatever row/record the action applies to (a loan, a
// credit-card balance, ...); TValues is the shape of the form's own
// editable state for that action.
export interface UseTargetedModalConfig<TTarget, TValues> {
  // Called once, the moment open(target) runs, to seed the form's
  // starting values from whatever's already known about the target
  // (e.g. defaulting the paying account to the first eligible one).
  initialValues: (target: TTarget) => TValues;
  // Returns an error message if `values` isn't submittable yet for this
  // particular `target`, or null if it is. Drives both `canSave`
  // (real-time, as the user edits) and the `error` shown if submit()
  // runs anyway.
  validate: (values: TValues, target: TTarget) => string | null;
  onSubmit: (target: TTarget, values: TValues) => Promise<unknown>;
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: () => void | Promise<void>;
}

export interface UseTargetedModalResult<TTarget, TValues> {
  target: TTarget | null;
  values: TValues;
  setValues: React.Dispatch<React.SetStateAction<TValues>>;
  error: string | null;
  canSave: boolean;
  open: (target: TTarget) => void;
  close: () => void;
  submit: () => Promise<void>;
}

export function useTargetedModal<TTarget, TValues>(
  config: UseTargetedModalConfig<TTarget, TValues>,
): UseTargetedModalResult<TTarget, TValues> {
  const { initialValues, validate, onSubmit, onSaved } = config;

  // target and values are kept in one piece of state (rather than two
  // separate useState calls) specifically so they can never desync —
  // there's no render where a stale `values` from a previous target
  // could show up paired with a new one.
  const [state, setState] = useState<{
    target: TTarget;
    values: TValues;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    (target: TTarget) => {
      setState({ target, values: initialValues(target) });
      setError(null);
    },
    [initialValues],
  );

  const close = useCallback(() => {
    setState(null);
    setError(null);
  }, []);

  const setValues = useCallback<React.Dispatch<React.SetStateAction<TValues>>>(
    updater => {
      setState(prev => {
        if (!prev) {
          // Nothing targeted — setValues should never be called from a
          // form that isn't mounted, but no-op rather than throw if it
          // somehow is (e.g. a stray callback firing after close()).
          return prev;
        }
        const nextValues =
          typeof updater === 'function'
            ? (updater as (v: TValues) => TValues)(prev.values)
            : updater;
        return { ...prev, values: nextValues };
      });
    },
    [],
  );

  const target = state?.target ?? null;
  // Only ever read by consumer code while `target` is non-null (the
  // modal itself should be gated on that) — this cast just satisfies the
  // non-nullable return type for the brief window before the first
  // open() call, when no form exists yet to read it.
  const values = (state?.values ?? null) as TValues;

  const canSave = state !== null && validate(state.values, state.target) === null;

  const submit = useCallback(async () => {
    if (!state) {
      return;
    }
    const { target: currentTarget, values: currentValues } = state;
    const validationError = validate(currentValues, currentTarget);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await onSubmit(currentTarget, currentValues);
      setState(null);
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [state, validate, onSubmit, onSaved]);

  return { target, values, setValues, error, canSave, open, close, submit };
}
