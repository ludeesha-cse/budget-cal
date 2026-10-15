// One reading of "what did the user type in an amount field", shared by
// the forms that need to tell three outcomes apart:
//
//   blank    -> the field gets a red outline (the user left it empty)
//   invalid  -> a message (the user typed something, but it is wrong)
//   ok       -> the parsed number
//
// That split is the app-wide form rule: an outline means "you skipped
// this", a message means "this is not right" — see hooks/useFieldErrors.

// Comfortably above any real personal balance or payment in any currency
// this app supports (a trillion LKR is roughly 3 billion USD), and well
// below the point where a float stops representing whole cents exactly.
export const MAX_AMOUNT = 999_999_999_999;

export type AmountCheck =
  | { kind: 'blank' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; value: number };

export type AmountRules = {
  // Zero is a real answer for an opening balance ("I have no cash right
  // now"), but never for a payment.
  allowZero?: boolean;
};

export function checkAmount(raw: string, rules: AmountRules = {}): AmountCheck {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { kind: 'blank' };
  }
  // Number() alone accepts things nobody typed on purpose ("0x10", "1e3",
  // " "), so the text has to look like a plain decimal first. A comma is
  // accepted as a thousands separator, since that is how amounts are
  // shown everywhere else in the app.
  const normalized = trimmed.replace(/,/g, '');
  if (!/^-?\d*\.?\d*$/.test(normalized) || !/\d/.test(normalized)) {
    return { kind: 'invalid', message: 'Enter a number, like 5000 or 12.50' };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { kind: 'invalid', message: 'Enter a number, like 5000 or 12.50' };
  }
  if (value < 0) {
    return { kind: 'invalid', message: "The amount can't be negative" };
  }
  if (value === 0 && !rules.allowZero) {
    return { kind: 'invalid', message: 'Enter an amount greater than 0' };
  }
  if (value > MAX_AMOUNT) {
    return {
      kind: 'invalid',
      message: 'That amount is too large — check for extra digits',
    };
  }
  return { kind: 'ok', value };
}
