import { useState } from 'react';
import { Alert } from 'react-native';
import {
  getContributions,
} from '../db/queries';
import { getCurrentDateString } from '../utils/date';
import { useConfirmDelete } from './useConfirmDelete';
import { useAsyncAction } from './useAsyncAction';
import {
  useAddContribution as useAddContributionMutation,
  useDeleteContribution as useDeleteContributionMutation,
  useUpdateContribution as useUpdateContributionMutation,
} from './queries';

export type SavingsContributionRow = Awaited<
  ReturnType<typeof getContributions>
>[number];

export interface UseContributionFormResult {
  // Add-contribution mini-form, one goal at a time.
  addingContributionFor: number | null;
  contributionAmount: string;
  setContributionAmount: (value: string) => void;
  contributionDate: string;
  setContributionDate: (value: string) => void;
  contributionNote: string;
  setContributionNote: (value: string) => void;
  openAddContribution: (goalId: number) => void;
  closeAddContribution: () => void;
  submitAddContribution: (goalId: number) => Promise<void>;

  // Edit-contribution inline form, one row at a time.
  editingContributionId: number | null;
  editAmount: string;
  setEditAmount: (value: string) => void;
  editDate: string;
  setEditDate: (value: string) => void;
  editNote: string;
  setEditNote: (value: string) => void;
  startEditContribution: (contribution: SavingsContributionRow) => void;
  cancelEditContribution: () => void;
  submitEditContribution: (goalId: number) => Promise<void>;

  handleDeleteContribution: (
    goalId: number,
    contribution: SavingsContributionRow,
  ) => void;
}

// Combines the add-mini-form and the edit-inline-form for a goal's
// contributions, plus delete — all three mutations funnel through the
// same `onSaved?.(goalId)` callback so the caller can refresh both the
// goals list (totals) and that one goal's own contribution cache
// together, mirroring the original screen's
// `Promise.all([load(), reloadContributionsFor(goalId)])`.
export function useContributionForm(
  // Optional since the TanStack Query refactor: a caller used to pass
  // its screen's load() here purely to re-read the database after a
  // successful write. The mutation hooks now invalidate every affected
  // query themselves, so that job is done — this is left for callers
  // that still need to do something ELSE once a save lands (reset
  // local UI state, navigate away).
  onSaved?: (goalId: number) => Promise<void>,
): UseContributionFormResult {
  // Write paths go through the caching layer's mutation hooks: each
  // one runs the same db/queries function as before and then
  // invalidates every query its write can affect (see
  // hooks/queries/invalidation.ts). The call sites below are
  // unchanged — these hooks take the wrapped function's own arguments.
  const addContribution = useAddContributionMutation();
  const deleteContribution = useDeleteContributionMutation();
  const updateContribution = useUpdateContributionMutation();
  const confirmDelete = useConfirmDelete();
  const runAction = useAsyncAction();

  const [addingContributionFor, setAddingContributionFor] = useState<
    number | null
  >(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(
    getCurrentDateString(),
  );
  const [contributionNote, setContributionNote] = useState('');

  const [editingContributionId, setEditingContributionId] = useState<
    number | null
  >(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');

  const openAddContribution = (goalId: number) => {
    setAddingContributionFor(goalId);
    setContributionAmount('');
    setContributionDate(getCurrentDateString());
    setContributionNote('');
  };

  const closeAddContribution = () => setAddingContributionFor(null);

  const submitAddContribution = async (goalId: number) => {
    const parsedAmount = Number(contributionAmount);
    if (
      !contributionAmount ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      Alert.alert(
        'Invalid amount',
        'Enter a contribution amount greater than zero.',
      );
      return;
    }
    await runAction(async () => {
      await addContribution({
        savingsGoalId: goalId,
        amount: parsedAmount,
        date: contributionDate,
        note: contributionNote.trim() || undefined,
      });
      setAddingContributionFor(null);
      await onSaved?.(goalId);
    }, 'Could not add contribution');
  };

  const startEditContribution = (contribution: SavingsContributionRow) => {
    setEditingContributionId(contribution.id);
    setEditAmount(String(contribution.amount));
    setEditDate(contribution.date);
    setEditNote(contribution.note ?? '');
  };

  const cancelEditContribution = () => setEditingContributionId(null);

  const submitEditContribution = async (goalId: number) => {
    if (editingContributionId == null) {
      return;
    }
    const parsedAmount = Number(editAmount);
    if (!editAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Enter a contribution amount greater than zero.',
      );
      return;
    }
    await runAction(async () => {
      await updateContribution(editingContributionId, {
        amount: parsedAmount,
        date: editDate,
        note: editNote.trim() || undefined,
      });
      setEditingContributionId(null);
      await onSaved?.(goalId);
    }, 'Could not update contribution');
  };

  const handleDeleteContribution = (
    goalId: number,
    contribution: SavingsContributionRow,
  ) => {
    confirmDelete(
      'Delete contribution',
      `Delete this ${contribution.date} contribution? This cannot be undone.`,
      'Delete',
      () =>
        runAction(async () => {
          await deleteContribution(contribution.id);
          await onSaved?.(goalId);
        }, 'Could not delete contribution'),
    );
  };

  return {
    addingContributionFor,
    contributionAmount,
    setContributionAmount,
    contributionDate,
    setContributionDate,
    contributionNote,
    setContributionNote,
    openAddContribution,
    closeAddContribution,
    submitAddContribution,
    editingContributionId,
    editAmount,
    setEditAmount,
    editDate,
    setEditDate,
    editNote,
    setEditNote,
    startEditContribution,
    cancelEditContribution,
    submitEditContribution,
    handleDeleteContribution,
  };
}
