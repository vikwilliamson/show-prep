import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

// Embedding dimension must match lib/ai/embeddings.ts (voyage-4, output_dimension 1024)
export const EMBEDDING_DIM = 1024;

// ---------------------------------------------------------------------------
// Documents & RAG
// ---------------------------------------------------------------------------

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // coach_protocol: macro/cardio/peak-week docs from coach
  // division_rules: NPC rules & guidelines
  // other: anything else worth chatting with
  category: text("category", {
    enum: ["coach_protocol", "division_rules", "other"],
  })
    .notNull()
    .default("coach_protocol"),
  sourceType: text("source_type", {
    enum: ["pdf", "txt", "email_paste"],
  }).notNull(),
  originalFilename: text("original_filename"),
  contentText: text("content_text").notNull(),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
});

// ---------------------------------------------------------------------------
// Protocols (extracted prescriptions; confirmed ones become "active")
// ---------------------------------------------------------------------------

export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  status: text("status", {
    enum: ["pending", "active", "superseded", "rejected"],
  })
    .notNull()
    .default("pending"),
  effectiveFrom: date("effective_from").notNull(),
  calories: integer("calories"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  cardioPlan: text("cardio_plan"),
  notes: text("notes"),
  // Full extraction payload from Claude (confidence, source quotes, etc.)
  extractedJson: jsonb("extracted_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Ingested health data
// All tables carry hc_uid (Health Connect provenance, upsert key) + source.
// ---------------------------------------------------------------------------

export const nutritionEntries = pgTable(
  "nutrition_entries",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"), // myfitnesspal | samsung_health | csv_backfill | manual
    localDate: date("local_date").notNull(),
    mealType: text("meal_type", {
      enum: ["breakfast", "lunch", "dinner", "snack", "other"],
    }).notNull(),
    calories: real("calories").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    fiberG: real("fiber_g"),
    sugarG: real("sugar_g"),
    sodiumMg: real("sodium_mg"),
    saturatedFatG: real("saturated_fat_g"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("nutrition_hc_uid_idx").on(t.hcUid)],
);

export const weightEntries = pgTable(
  "weight_entries",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    localDate: date("local_date").notNull(),
    weightLbs: real("weight_lbs").notNull(),
    bodyFatPct: real("body_fat_pct"),
  },
  (t) => [uniqueIndex("weight_hc_uid_idx").on(t.hcUid)],
);

export const hydrationEntries = pgTable(
  "hydration_entries",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"),
    localDate: date("local_date").notNull(),
    volumeMl: real("volume_ml").notNull(),
  },
  (t) => [uniqueIndex("hydration_hc_uid_idx").on(t.hcUid)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"),
    localDate: date("local_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    exerciseType: text("exercise_type").notNull().default("strength"),
    isCardio: boolean("is_cardio").notNull().default(false),
    caloriesBurned: real("calories_burned"),
    title: text("title"),
  },
  (t) => [uniqueIndex("workout_hc_uid_idx").on(t.hcUid)],
);

export const sleepSessions = pgTable(
  "sleep_sessions",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"),
    localDate: date("local_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationMin: real("duration_min").notNull(),
    stages: jsonb("stages"),
  },
  (t) => [uniqueIndex("sleep_hc_uid_idx").on(t.hcUid)],
);

export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: serial("id").primaryKey(),
    hcUid: text("hc_uid"),
    source: text("source").notNull().default("manual"),
    localDate: date("local_date").notNull(),
    steps: integer("steps"),
    activeCalories: real("active_calories"),
    totalCalories: real("total_calories"),
  },
  (t) => [
    uniqueIndex("activity_hc_uid_idx").on(t.hcUid),
    uniqueIndex("activity_local_date_idx").on(t.localDate),
  ],
);

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deviceId: text("device_id").notNull(),
  recordCount: integer("record_count").notNull(),
  acceptedCount: integer("accepted_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  status: text("status").notNull(),
});

// ---------------------------------------------------------------------------
// Weekly targets (configurable thresholds for check-in questions)
// ---------------------------------------------------------------------------

export const weeklyTargets = pgTable("weekly_targets", {
  id: serial("id").primaryKey(),
  waterMlMin: integer("water_ml_min").notNull().default(3000), // per day
  sleepHoursMin: real("sleep_hours_min").notNull().default(7), // per night
  workoutsPerWeekMin: integer("workouts_per_week_min").notNull().default(3),
  cardioSessionsPerWeek: integer("cardio_sessions_per_week").notNull().default(0), // 0 = not prescribed
});

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export const checkIns = pgTable(
  "check_ins",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(), // Monday of the week the check-in covers
    // Subjective, manually entered answers
    waistIn: real("waist_in"),
    strengthTrend: text("strength_trend"),
    digestion: text("digestion"),
    changeRequests: text("change_requests"),
    manualNotes: text("manual_notes"),
    // Data-backed answers snapshot (computed at generation time)
    dataAnswers: jsonb("data_answers"),
    // AI outputs
    aiAnalysis: text("ai_analysis"),
    generatedDraft: text("generated_draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("checkin_week_idx").on(t.weekStart)],
);

// ---------------------------------------------------------------------------
// App settings (single row, id = 1). Includes the coach check-in template.
// ---------------------------------------------------------------------------

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  showName: text("show_name"),
  showDate: date("show_date"),
  divisions: text("divisions")
    .array()
    .notNull()
    .default(sql`ARRAY['classic_physique']::text[]`),
  nextCompetitionNote: text("next_competition_note"),
  targetStageWeightLbs: real("target_stage_weight_lbs"),
  heightInches: real("height_inches"), // for Classic Physique weight-cap calc
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  // Coach's check-in template: array of { key, question, type: "data" | "manual" }
  checkinTemplate: jsonb("checkin_template").notNull(),
});

// ---------------------------------------------------------------------------
// Chat (RAG over documents)
// ---------------------------------------------------------------------------

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  // [{ documentId, title, chunkIndex }] for assistant messages
  sources: jsonb("sources"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type Protocol = typeof protocols.$inferSelect;
export type NutritionEntry = typeof nutritionEntries.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type HydrationEntry = typeof hydrationEntries.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type SleepSession = typeof sleepSessions.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type WeeklyTargets = typeof weeklyTargets.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
