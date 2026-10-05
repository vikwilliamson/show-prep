CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"waist_in" real,
	"strength_trend" text,
	"digestion" text,
	"change_requests" text,
	"manual_notes" text,
	"data_answers" jsonb,
	"ai_analysis" text,
	"generated_draft" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"local_date" date NOT NULL,
	"steps" integer,
	"active_calories" real,
	"total_calories" real
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'coach_protocol' NOT NULL,
	"source_type" text NOT NULL,
	"original_filename" text,
	"content_text" text NOT NULL,
	"embedded_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hydration_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"local_date" date NOT NULL,
	"volume_ml" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"local_date" date NOT NULL,
	"meal_type" text NOT NULL,
	"calories" real NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real DEFAULT 0 NOT NULL,
	"fat_g" real DEFAULT 0 NOT NULL,
	"fiber_g" real,
	"sugar_g" real,
	"sodium_mg" real,
	"saturated_fat_g" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"effective_from" date NOT NULL,
	"calories" integer,
	"protein_g" integer,
	"carbs_g" integer,
	"fat_g" integer,
	"cardio_plan" text,
	"notes" text,
	"extracted_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"show_name" text,
	"show_date" date,
	"division" text DEFAULT 'classic_physique' NOT NULL,
	"next_competition_note" text,
	"target_stage_weight_lbs" real,
	"height_inches" real,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"checkin_template" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleep_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_min" real NOT NULL,
	"stages" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text NOT NULL,
	"record_count" integer NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"water_ml_min" integer DEFAULT 3000 NOT NULL,
	"sleep_hours_min" real DEFAULT 7 NOT NULL,
	"workouts_per_week_min" integer DEFAULT 3 NOT NULL,
	"cardio_sessions_per_week" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"weight_lbs" real NOT NULL,
	"body_fat_pct" real
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"hc_uid" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"exercise_type" text DEFAULT 'strength' NOT NULL,
	"is_cardio" boolean DEFAULT false NOT NULL,
	"calories_burned" real,
	"title" text
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_week_idx" ON "check_ins" USING btree ("week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_hc_uid_idx" ON "daily_activity" USING btree ("hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_local_date_idx" ON "daily_activity" USING btree ("local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "hydration_hc_uid_idx" ON "hydration_entries" USING btree ("hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_hc_uid_idx" ON "nutrition_entries" USING btree ("hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "sleep_hc_uid_idx" ON "sleep_sessions" USING btree ("hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_hc_uid_idx" ON "weight_entries" USING btree ("hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_hc_uid_idx" ON "workouts" USING btree ("hc_uid");