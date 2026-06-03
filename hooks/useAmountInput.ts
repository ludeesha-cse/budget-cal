import { useState } from 'react';

export interface UseAmountInputResult {
  amount: string;
  setAmount: React.Dispatch<React.SetStateAction<string>>;
  parsedAmount: number;
  isValid: boolean;
}

// The amount-field state + parsing + validity check duplicated in
// TransactionForm and IncomeForm's own handleSubmit/canSave. Kept as a
// plain string in state (never a number) so the field can hold
// in-progress input a number can't represent, like a bare "-" or a
// trailing ".". `isValid` only checks "is this parseable and non-blank" —
// neither form has ever required a positive amount here (unlike, say,
// InstallmentPlansScreen's payment amount), so that's preserved as-is
// rather than tightened.
export function useAmountInput(initial?: number): UseAmountInputResult {
  const [amount, setAmount] = useState(
    initial != null ? String(initial) : '',
  );
  const parsedAmount = Number(amount);
  const isValid = amount.trim() !== '' && !Number.isNaN(parsedAmount);

  return { amount, setAmount, parsedAmount, isValid };
}
