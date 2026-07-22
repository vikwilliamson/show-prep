// NPC Bodybuilding weight classes (6-class format), the most common
// breakdown at regional NPC shows. Contests may run fewer/more classes
// (2–7) depending on entry count — this is NOT a hard cap like Classic
// Physique's height chart; a competitor is simply judged within whichever
// bracket their weigh-in falls into.
// Source: https://npcnewsonline.com/official-bodybuilding-rules/

export interface BodybuildingWeightClassRow {
  /** Max weight in lbs, inclusive. Infinity for the top ("Super Heavyweight") row. */
  maxWeightLbs: number;
  label: string;
}

export const BODYBUILDING_WEIGHT_CLASSES: BodybuildingWeightClassRow[] = [
  { maxWeightLbs: 143.25, label: "Bantamweight" },
  { maxWeightLbs: 154.25, label: "Lightweight" },
  { maxWeightLbs: 176.25, label: "Middleweight" },
  { maxWeightLbs: 198.25, label: "Light Heavyweight" },
  { maxWeightLbs: 225.25, label: "Heavyweight" },
  { maxWeightLbs: Infinity, label: "Super Heavyweight" },
];

export interface WeightClassResult {
  row: BodybuildingWeightClassRow;
  label: string;
  /** Lbs remaining before crossing into the next class up. Null at the top class. */
  toNextClassLbs: number | null;
}

/** Weight class for a competitor at the given bodyweight (6-class format). */
export function bodybuildingWeightClass(weightLbs: number): WeightClassResult {
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) {
    throw new Error(`Invalid weight: ${weightLbs}`);
  }
  const row = BODYBUILDING_WEIGHT_CLASSES.find((r) => weightLbs <= r.maxWeightLbs)!;
  return {
    row,
    label: row.label,
    toNextClassLbs: Number.isFinite(row.maxWeightLbs)
      ? Math.round((row.maxWeightLbs - weightLbs) * 10) / 10
      : null,
  };
}
