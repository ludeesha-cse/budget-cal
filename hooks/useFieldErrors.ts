import { useCallback, useMemo, useState } from 'react';

export interface UseFieldErrorsResult {
  // Which required fields are still empty, right now. Derived from the
  // form's current values on every render, never stored — so a field
  // stops being flagged the instant it is filled in, without anything
  // needing to clear it.
  missingFields: string[];
  // Whether the user has actually TRIED to submit yet. Nothing is
  // highlighted before that: outlining every empty field the moment a
  // blank form opens would be shouting at someone who has not done
  // anything wrong.
  revealed: boolean;
  // True only when both hold — the field is missing AND the user has
  // tried to submit. This is what a control passes to fieldErrorStyle.
  isMissing: (field: string) => boolean;
  // Call from the submit handler when validation fails.
  reveal: () => void;
  // Call when the form opens or resets.
  reset: () => void;
}

// The shared half of "the save button stays muted until the form is
// valid, and pressing it anyway shows you what is missing".
//
// THE TENSION THIS RESOLVES: a genuinely disabled button gives no
// feedback at all — the user taps, nothing happens, and nothing on
// screen says why. A fully enabled one that fails on submit lets them
// get further than they should. So the button here is muted (it looks
// unavailable) but still PRESSABLE, and pressing it while the form is
// incomplete is what turns the missing fields red. The user gets the
// "not yet" signal from the colour and the "here's why" from the press,
// without either being a dead end.
//
// `computeMissing` is called on every render against current values, so
// this hook holds exactly one piece of state: whether to show anything
// at all.
export function useFieldErrors(missingFields: string[]): UseFieldErrorsResult {
  const [revealed, setRevealed] = useState(false);

  // Membership test built once per render rather than an indexOf scan
  // per control — forms are small, but this also gives isMissing a
  // stable dependency for the components that memoise on it.
  const missingSet = useMemo(() => new Set(missingFields), [missingFields]);

  const isMissing = useCallback(
    (field: string) => revealed && missingSet.has(field),
    [revealed, missingSet],
  );

  const reveal = useCallback(() => setRevealed(true), []);
  const reset = useCallback(() => setRevealed(false), []);

  return { missingFields, revealed, isMissing, reveal, reset };
}
