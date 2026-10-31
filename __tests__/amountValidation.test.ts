import { MAX_AMOUNT, checkAmount } from '../utils/amountValidation';

describe('checkAmount', () => {
  test('blank means the field was skipped', () => {
    expect(checkAmount('')).toEqual({ kind: 'blank' });
    expect(checkAmount('   ')).toEqual({ kind: 'blank' });
  });

  test('plain numbers parse, with thousands separators allowed', () => {
    expect(checkAmount('5000')).toEqual({ kind: 'ok', value: 5000 });
    expect(checkAmount('12.50')).toEqual({ kind: 'ok', value: 12.5 });
    expect(checkAmount('5,000.25')).toEqual({ kind: 'ok', value: 5000.25 });
  });

  test('zero is only accepted when allowed', () => {
    expect(checkAmount('0', { allowZero: true })).toEqual({ kind: 'ok', value: 0 });
    expect(checkAmount('0')).toEqual({
      kind: 'invalid',
      message: 'Enter an amount greater than 0',
    });
  });

  test.each(['abc', '1e3', '0x10', '.', '-', '5000abc', '1.2.3'])(
    '"%s" is present but not a number',
    raw => {
      expect(checkAmount(raw).kind).toBe('invalid');
    },
  );

  test('negative and absurdly large values get a message', () => {
    expect(checkAmount('-5', { allowZero: true })).toEqual({
      kind: 'invalid',
      message: "The amount can't be negative",
    });
    expect(checkAmount(String(MAX_AMOUNT + 1))).toEqual({
      kind: 'invalid',
      message: 'That amount is too large — check for extra digits',
    });
    expect(checkAmount(String(MAX_AMOUNT))).toEqual({
      kind: 'ok',
      value: MAX_AMOUNT,
    });
  });
});
