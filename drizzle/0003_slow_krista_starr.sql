CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"passcode_hash" text NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "settings_id_seq" OWNED BY "settings"."id";--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "id" SET DEFAULT nextval('settings_id_seq');--> statement-breakpoint
SELECT setval('settings_id_seq', COALESCE((SELECT MAX(id) FROM "settings"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "hydration_entries" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "protocols" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "sleep_sessions" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "sync_log" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "weekly_targets" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydration_entries" ADD CONSTRAINT "hydration_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_targets" ADD CONSTRAINT "weekly_targets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;