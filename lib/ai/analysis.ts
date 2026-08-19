import type { CheckinQuestion } from "../checkin-template";
import type { Settings } from "../db/schema";
import type { WeekStats } from "../stats";
import { getAnthropic, MODEL } from "./client";

// Plain-language weekly analysis + coach check-in draft. Both are grounded in
// the computed WeekStats snapshot — the model narrates the numbers, it never
// invents them.

function statsBrief(stats: WeekStats, settings: Settings): string {
  const p = stats.protocol;
  return JSON.stringify(
    {
      week: `${stats.weekStart} to ${stats.weekEnd}`,
      target: settings.targetDate
        ? { name: settings.targetName, date: settings.targetDate, programType: settings.programType }
        : null,
      target_weight_lbs: settings.targetWeightLbs,
      active_protocol: p
        ? {
            calories: p.calories,
            protein_g: p.proteinG,
            carbs_g: p.carbsG,
            fat_g: p.fatG,
            cardio_plan: p.cardioPlan,
            effective_from: p.effectiveFrom,
          }
        : null,
      nutrition: stats.nutrition,
      weight: stats.weight,
      water: stats.water,
      sleep: stats.sleep,
      training: stats.training,
    },
    null,
    2,
  );
}

export async function generateWeeklyAnalysis(
  stats: WeekStats,
  settings: Settings,
): Promise<string> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You are a knowledgeable coaching assistant writing a weekly analysis for a coaching client.",
      "Write 2-4 short paragraphs of plain language: how the week went vs the active protocol, weight trend vs target weight and time remaining, and one or two concrete focus points for next week.",
      "Only reference numbers present in the data. Note missing data (unlogged days) honestly. No headers, no bullet lists, no medical claims. Encouraging but straight.",
    ].join("\n"),
    messages: [{ role: "user", content: `Week data:\n${statsBrief(stats, settings)}` }],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export interface ManualAnswers {
  waistIn: number | null;
  strengthTrend: string | null;
  digestion: string | null;
  changeRequests: string | null;
  manualNotes: string | null;
}

/**
 * Deterministic pre-fill for the data-backed questions. Used both to show
 * the user what the data says and as grounding for the AI draft.
 */
export function dataAnswers(stats: WeekStats, settings: Settings) {
  const n = stats.nutrition;
  const w = stats.weight;

  const macroAdherence = !n.daysLogged
    ? "No nutrition data logged this week."
    : [
        `${n.daysLogged}/7 days logged.`,
        n.avg
          ? `Averages: ${n.avg.calories} kcal, ${n.avg.proteinG}P / ${n.avg.carbsG}C / ${n.avg.fatG}F.`
          : "",
        stats.protocol?.calories
          ? `Plan: ${stats.protocol.calories} kcal (${stats.protocol.proteinG ?? "?"}P / ${stats.protocol.carbsG ?? "?"}C / ${stats.protocol.fatG ?? "?"}F). ` +
            `Avg calories ${n.avgCaloriesDeltaPct! >= 0 ? "+" : ""}${n.avgCaloriesDeltaPct}% vs plan; ${n.onTargetDays}/${n.daysLogged} logged days on target.`
          : "No active protocol to compare against.",
      ]
        .filter(Boolean)
        .join(" ");

  const bodyweight = w.latest
    ? `${w.latest.weightLbs} lbs (${w.latest.date})` +
      (w.weeklyChangeLbs != null
        ? `, ${w.weeklyChangeLbs > 0 ? "+" : ""}${w.weeklyChangeLbs} lbs vs last week's average`
        : "")
    : "No weigh-ins recorded this week.";

  const water = stats.water.daysLogged
    ? `${stats.water.daysMet}/${stats.water.daysLogged} logged days hit ${stats.water.targetLiters}L (avg ${stats.water.avgLiters}L/day).`
    : "No water logged this week.";

  const sleep = stats.sleep.nightsLogged
    ? `Avg ${stats.sleep.avgHours}h; ${stats.sleep.nightsMet}/${stats.sleep.nightsLogged} nights ≥ ${stats.sleep.targetHours}h.`
    : "No sleep data this week.";

  const workouts =
    `${stats.training.strengthCount} lifting session${stats.training.strengthCount === 1 ? "" : "s"} ` +
    `(min ${stats.training.strengthTarget})` +
    (stats.training.cardioTarget > 0
      ? `; cardio ${stats.training.cardioCount}/${stats.training.cardioTarget} prescribed sessions.`
      : `; ${stats.training.cardioCount} cardio session${stats.training.cardioCount === 1 ? "" : "s"}.`);

  const nextCompetition = settings.targetDate
    ? `${settings.targetName ?? "Target"} — ${settings.targetDate}` +
      (settings.nextCompetitionNote ? ` (${settings.nextCompetitionNote})` : "")
    : (settings.nextCompetitionNote ?? "Not set.");

  return {
    macro_adherence: macroAdherence,
    bodyweight,
    water,
    sleep,
    workouts_cardio: workouts,
    next_competition: nextCompetition,
  };
}

export type DataAnswers = ReturnType<typeof dataAnswers>;

/**
 * Fills the coach's exact template. Data-backed answers come from ingested
 * data; subjective answers come from the user's manual entries verbatim
 * (lightly smoothed into sentences, never contradicted or embellished).
 */
export async function generateCheckinDraft(input: {
  template: CheckinQuestion[];
  stats: WeekStats;
  settings: Settings;
  manual: ManualAnswers;
}): Promise<string> {
  const { template, stats, settings, manual } = input;
  const prefill = dataAnswers(stats, settings);

  const client = getAnthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You draft a weekly check-in message from a coaching client to their coach.",
      "You are given the coach's exact question list, computed data answers, and the client's own subjective notes.",
      "Rules:",
      "- Answer every question in order. Repeat each question as a line starting with '> ', then the answer on the next lines.",
      "- Use the computed data answers for data-backed questions — keep every number exactly as given.",
      "- For subjective questions use the client's notes in first person, cleaned up but not embellished. If a note is missing, write '[fill in]'.",
      "- Waist: use the manually entered waist measurement with the bodyweight answer.",
      "- First person, plain text, friendly and direct. Start with a one-line greeting, end with a one-line sign-off. No markdown headers.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            questions: template.map((q) => q.question),
            data_answers: prefill,
            manual_answers: {
              waist_in: manual.waistIn,
              strength_trend: manual.strengthTrend,
              digestion: manual.digestion,
              change_requests: manual.changeRequests,
              extra_notes: manual.manualNotes,
            },
            week: `${stats.weekStart} to ${stats.weekEnd}`,
          },
          null,
          2,
        ),
      },
    ],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
