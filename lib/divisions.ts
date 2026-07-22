import { classicPhysiqueWeightCap, type WeightCapResult } from "./classic-physique";
import { bodybuildingWeightClass, type WeightClassResult } from "./bodybuilding";

export const DIVISIONS = [
  "classic_physique",
  "mens_physique",
  "bodybuilding",
  "wellness",
  "figure",
  "bikini",
] as const;

export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABELS: Record<Division, string> = {
  classic_physique: "Classic Physique",
  mens_physique: "Men's Physique",
  bodybuilding: "Bodybuilding",
  wellness: "Wellness",
  figure: "Figure",
  bikini: "Bikini",
};

export function divisionLabel(division: string): string {
  return DIVISION_LABELS[division as Division] ?? division.replace(/_/g, " ");
}

// Divisions with a hard maximum you must not exceed, keyed by height
// (lib/classic-physique.ts). Add another division's cap here if one gets
// sourced — the Dashboard tile picks it up automatically.
export const DIVISION_WEIGHT_CAPS: Partial<
  Record<Division, (heightIn: number) => WeightCapResult>
> = {
  classic_physique: classicPhysiqueWeightCap,
};

// Divisions judged in weight-based brackets (not a cap — there's no
// "over"; you're just judged against whoever else lands in your bracket
// that show), keyed by current bodyweight (lib/bodybuilding.ts).
export const DIVISION_WEIGHT_CLASSES: Partial<
  Record<Division, (weightLbs: number) => WeightClassResult>
> = {
  bodybuilding: bodybuildingWeightClass,
};
