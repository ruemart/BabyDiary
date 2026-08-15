/**
 * What has to change about a feed's doses when its sheet is saved.
 *
 * The bottle sheet shows a tick per medicine, but a dose is an entry of its own — so
 * "save" is not a field being written, it is entries being added, removed and moved. All
 * three really happen: ticking adds one, unticking removes it, and correcting the time
 * of the feed has to take its doses along, otherwise the drops stay behind at three in
 * the morning while the bottle moves to half past two.
 *
 * A pure function, separate from the store that carries it out, because the decision is
 * the part that can be wrong and the writing is not. The move in particular is the case
 * nobody thinks to try by hand.
 */

export type DoseState = {
  id: string;
  medicineId: string | null;
  startedAt: string;
};

export type DoseChanges = {
  /** Doses whose tick was taken off. */
  remove: string[];
  /** Doses that stay but have to follow the feed's new time. */
  move: { id: string; startedAt: string }[];
  /** Medicines newly ticked — one dose to create for each. */
  create: string[];
};

export function planDoseChanges(
  existing: readonly DoseState[],
  selectedMedicineIds: readonly string[],
  startedAt: string,
): DoseChanges {
  const changes: DoseChanges = { remove: [], move: [], create: [] };

  for (const dose of existing) {
    if (!dose.medicineId || !selectedMedicineIds.includes(dose.medicineId)) {
      changes.remove.push(dose.id);
    } else if (dose.startedAt !== startedAt) {
      changes.move.push({ id: dose.id, startedAt });
    }
  }

  for (const id of selectedMedicineIds) {
    if (!existing.some((dose) => dose.medicineId === id)) changes.create.push(id);
  }

  return changes;
}
