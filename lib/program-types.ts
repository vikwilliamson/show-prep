export const PROGRAM_TYPES = ["physique_prep", "weight_loss", "general_coaching"] as const;

export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  physique_prep: "Physique Prep",
  weight_loss: "Weight Loss",
  general_coaching: "General Coaching",
};

export function programTypeLabel(programType: string): string {
  return PROGRAM_TYPE_LABELS[programType as ProgramType] ?? programType.replace(/_/g, " ");
}
