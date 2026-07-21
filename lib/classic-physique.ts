// Deterministic NPC/NPC Worldwide Classic Physique height-to-weight-cap
// calculator. Chart transcribed from the official NPC News Online PDF
// ("NPC/NPC WORLDWIDE CLASSIC PHYSIQUE", 2023 update, effective Aug 2, 2023):
// https://npcnewsonline.com/wp-content/uploads/2023/08/NPC-NPCWW-Classic-Physique-4.pdf

export interface ClassicPhysiqueRow {
  /** Max height in inches, inclusive. Infinity for the "Over 6'7\"" row. */
  maxHeightIn: number;
  label: string;
  maxWeightLbs: number;
  maxWeightKg: number;
}

export const CLASSIC_PHYSIQUE_CHART: ClassicPhysiqueRow[] = [
  { maxHeightIn: 64, label: `Up to and including 5'4"`, maxWeightLbs: 167, maxWeightKg: 75.7 },
  { maxHeightIn: 65, label: `Up to and including 5'5"`, maxWeightLbs: 172, maxWeightKg: 78.0 },
  { maxHeightIn: 66, label: `Up to and including 5'6"`, maxWeightLbs: 177, maxWeightKg: 80.3 },
  { maxHeightIn: 67, label: `Up to and including 5'7"`, maxWeightLbs: 182, maxWeightKg: 82.6 },
  { maxHeightIn: 68, label: `Up to and including 5'8"`, maxWeightLbs: 187, maxWeightKg: 84.8 },
  { maxHeightIn: 69, label: `Up to and including 5'9"`, maxWeightLbs: 194, maxWeightKg: 88.0 },
  { maxHeightIn: 70, label: `Up to and including 5'10"`, maxWeightLbs: 202, maxWeightKg: 91.6 },
  { maxHeightIn: 71, label: `Up to and including 5'11"`, maxWeightLbs: 209, maxWeightKg: 94.8 },
  { maxHeightIn: 72, label: `Up to and including 6'0"`, maxWeightLbs: 217, maxWeightKg: 98.4 },
  { maxHeightIn: 73, label: `Up to and including 6'1"`, maxWeightLbs: 224, maxWeightKg: 101.6 },
  { maxHeightIn: 74, label: `Up to and including 6'2"`, maxWeightLbs: 232, maxWeightKg: 105.2 },
  { maxHeightIn: 75, label: `Up to and including 6'3"`, maxWeightLbs: 239, maxWeightKg: 108.4 },
  { maxHeightIn: 76, label: `Up to and including 6'4"`, maxWeightLbs: 246, maxWeightKg: 111.6 },
  { maxHeightIn: 77, label: `Up to and including 6'5"`, maxWeightLbs: 253, maxWeightKg: 114.8 },
  { maxHeightIn: 78, label: `Up to and including 6'6"`, maxWeightLbs: 260, maxWeightKg: 117.9 },
  { maxHeightIn: 79, label: `Up to and including 6'7"`, maxWeightLbs: 267, maxWeightKg: 121.1 },
  { maxHeightIn: Infinity, label: `Over 6'7"`, maxWeightLbs: 274, maxWeightKg: 124.3 },
];

export interface WeightCapResult {
  row: ClassicPhysiqueRow;
  maxWeightLbs: number;
  maxWeightKg: number;
}

/**
 * Weight cap for a competitor of the given height. Heights are bucketed
 * "up to and including" each whole inch, so fractional heights round up
 * to the next bracket (a 5'10.5" competitor falls in the 5'11" bracket).
 */
export function classicPhysiqueWeightCap(heightInches: number): WeightCapResult {
  if (!Number.isFinite(heightInches) || heightInches <= 0) {
    throw new Error(`Invalid height: ${heightInches}`);
  }
  const row = CLASSIC_PHYSIQUE_CHART.find(
    (r) => heightInches <= r.maxHeightIn,
  )!;
  return { row, maxWeightLbs: row.maxWeightLbs, maxWeightKg: row.maxWeightKg };
}

/** Formats 70 -> `5'10"`. */
export function formatHeight(heightInches: number): string {
  const ft = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  const inchStr = Number.isInteger(inches) ? `${inches}` : inches.toFixed(1);
  return `${ft}'${inchStr}"`;
}
