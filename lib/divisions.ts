import { classicPhysiqueWeightCap, type WeightCapResult } from "./classic-physique";

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

// Only divisions with a real, sourced weight-cap chart go here. Today
// that's just Classic Physique (lib/classic-physique.ts). Add another
// division's chart here when one gets sourced — the Dashboard tile picks
// it up automatically.
export const DIVISION_WEIGHT_CAPS: Partial<
  Record<Division, (heightIn: number) => WeightCapResult>
> = {
  classic_physique: classicPhysiqueWeightCap,
};
