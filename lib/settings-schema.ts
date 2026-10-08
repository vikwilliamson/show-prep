import { z } from "zod";
import { CheckinQuestionSchema } from "@/lib/checkin-template";
import { PROGRAM_TYPES } from "@/lib/program-types";

export const settingsPutSchema = z.object({
  settings: z
    .object({
      targetName: z.string().nullable().optional(),
      targetDate: z.iso.date().nullable().optional(),
      programType: z.enum(PROGRAM_TYPES).nullable().optional(),
      targetNote: z.string().nullable().optional(),
      targetWeightLbs: z.number().positive().nullable().optional(),
      heightInches: z.number().positive().nullable().optional(),
      targetCalories: z.number().int().positive().nullable().optional(),
      targetProteinG: z.number().int().nonnegative().nullable().optional(),
      targetCarbsG: z.number().int().nonnegative().nullable().optional(),
      targetFatG: z.number().int().nonnegative().nullable().optional(),
      timezone: z.string().optional(),
      checkinTemplate: z.array(CheckinQuestionSchema).min(1).optional(),
    })
    .optional(),
  targets: z
    .object({
      waterMlMin: z.number().int().positive().optional(),
      sleepHoursMin: z.number().positive().optional(),
      workoutsPerWeekMin: z.number().int().nonnegative().optional(),
      cardioSessionsPerWeek: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
