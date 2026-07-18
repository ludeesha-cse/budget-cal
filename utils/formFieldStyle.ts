import type { ThemeColors } from '../contexts/ThemeContext';

// The one place that decides what "this required field is empty" looks
// like, so a text input, a picker and a date button all highlight
// identically rather than each screen inventing its own red.
//
// WHY A BORDER AND NOT A MESSAGE PER FIELD: the forms in this app are
// short and the fields are self-describing ("Name", "Amount",
// "Currency"). A red outline points at the exact control that needs
// attention without adding a line of text under every one of them, which
// on a bottom sheet would push the save button off screen precisely when
// the user is trying to reach it. The sheet still shows one summary
// message; the outlines say where.
//
// Returned as a style object rather than just a colour so the width goes
// with it — a 1px hairline in danger red is easy to miss against a
// hairline in border grey, and matching the two would make the highlight
// read as a rendering artefact rather than a signal.
export function fieldErrorStyle(
  colors: ThemeColors,
  invalid: boolean,
): { borderColor: string; borderWidth: number } | undefined {
  if (!invalid) {
    return undefined;
  }
  return { borderColor: colors.danger, borderWidth: 1.5 };
}
