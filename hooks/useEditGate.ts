import { useCallback, useState } from 'react';

// Reusable "read-only until you tap Edit" gate for any screen that lets
// someone bulk-edit a set of values in place (CategoryBudgetsScreen's
// per-category amounts today; any future screen shaped the same way —
// a list of fields with one shared Save, rather than a single-entity
// BottomSheetModal form, which already gets this for free since opening
// the sheet IS the edit action). Deliberately generic over the value
// shape T rather than tied to any one screen's state.
//
// Behavior: fields start non-editable. Tapping Edit snapshots the
// current value as the "baseline" and flips isEditing on. From there,
// Save should only be enabled once the live value has actually diverged
// from that baseline (isDirty) — until then, only Cancel makes sense to
// offer, since there's nothing to save yet. Cancel restores the baseline
// via onChange and exits edit mode; the caller calls finishEdit() itself
// once its own save mutation succeeds (this hook has no idea what
// "saving" means for T, only what "changed" means).
export interface UseEditGateConfig<T> {
  // The live, currently-displayed value (e.g. a screen's own amounts
  // record) — read once when Edit is tapped to capture the baseline, and
  // compared against on every render to compute isDirty.
  value: T;
  // How to put the baseline back when the user cancels — almost always a
  // screen's own setState function.
  onChange: (value: T) => void;
  // Structural equality for T. Defaults to a JSON.stringify compare,
  // which is fine for the plain string/number-keyed records this hook is
  // meant for; pass a custom one for anything where two structurally
  // different objects should still count as "unchanged" (or vice versa).
  isEqual?: (a: T, b: T) => boolean;
}

export interface UseEditGateResult {
  isEditing: boolean;
  // False while not editing at all — there's nothing to compare yet, and
  // a screen shouldn't be able to enable Save from a fully read-only
  // state.
  isDirty: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  // Call after a successful save — exits edit mode without touching the
  // live value (unlike cancelEdit, which overwrites it with the
  // baseline). The screen's own reload should already reflect the just-
  // saved values by the time this runs.
  finishEdit: () => void;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useEditGate<T>({
  value,
  onChange,
  isEqual = defaultIsEqual,
}: UseEditGateConfig<T>): UseEditGateResult {
  const [isEditing, setIsEditing] = useState(false);
  const [baseline, setBaseline] = useState<T | null>(null);

  const startEdit = useCallback(() => {
    setBaseline(value);
    setIsEditing(true);
  }, [value]);

  const cancelEdit = useCallback(() => {
    if (baseline != null) {
      onChange(baseline);
    }
    setIsEditing(false);
    setBaseline(null);
  }, [baseline, onChange]);

  const finishEdit = useCallback(() => {
    setIsEditing(false);
    setBaseline(null);
  }, []);

  const isDirty = isEditing && baseline != null && !isEqual(baseline, value);

  return { isEditing, isDirty, startEdit, cancelEdit, finishEdit };
}
