import { z } from "zod";

// The coach's weekly check-in template, stored as app config (settings.checkin_template).
// Each question is either data-backed (pre-filled from ingested data) or manual
// (subjective, entered by the client and saved on the check_ins row).

export const CheckinQuestionSchema = z.object({
  key: z.string().min(1),
  question: z.string().min(1),
  type: z.enum(["data", "manual", "mixed"]),
  // For "mixed" questions, which parts come from data vs manual entry.
  note: z.string().optional(),
});

export type CheckinQuestion = z.infer<typeof CheckinQuestionSchema>;
export type CheckinQuestionType = CheckinQuestion["type"];

export const DEFAULT_CHECKIN_TEMPLATE: CheckinQuestion[] = [
  {
    key: "macro_adherence",
    question:
      "How well did you follow meal/macro plan this week (MyFitnessPal)?",
    type: "data",
  },
  {
    key: "bodyweight_waist",
    question: "What is your current bodyweight & waist measurement?",
    type: "mixed",
    note: "Bodyweight from Health Connect; waist entered manually.",
  },
  {
    key: "water",
    question: "Did you get your water in (minimum 3 Liters)?",
    type: "data",
  },
  {
    key: "sleep",
    question: "How was your sleep (7 hours minimum)?",
    type: "data",
  },
  {
    key: "workouts_cardio",
    question:
      "Workouts (3 days/week minimum) & Cardio sessions (if prescribed)?",
    type: "data",
  },
  {
    key: "strength",
    question: "Noticing any increase/decrease in strength?",
    type: "manual",
  },
  {
    key: "digestion",
    question: "How is digestion (i.e. pooping regular)?",
    type: "manual",
  },
  {
    key: "next_target",
    question: "What is your next goal or target date?",
    type: "data",
    note: "Pulled from target settings.",
  },
  {
    key: "change_requests",
    question: "Anything you would like to see changed on the current plan?",
    type: "manual",
  },
];
