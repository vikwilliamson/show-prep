CREATE TABLE "webhook_deliveries" (
	"message_id" text PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "aggregator_user_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_aggregator_user_id_unique" UNIQUE("aggregator_user_id");--> statement-breakpoint
-- hc_uid -> provider_uid on the five non-nutrition ingest tables. Pure renames
-- (never drop/add) so existing rows keep their IDs; drizzle-kit's generated
-- drop+add for hydration_entries/sleep_sessions was replaced by hand.
ALTER TABLE "weight_entries" RENAME COLUMN "hc_uid" TO "provider_uid";--> statement-breakpoint
ALTER TABLE "hydration_entries" RENAME COLUMN "hc_uid" TO "provider_uid";--> statement-breakpoint
ALTER TABLE "workouts" RENAME COLUMN "hc_uid" TO "provider_uid";--> statement-breakpoint
ALTER TABLE "sleep_sessions" RENAME COLUMN "hc_uid" TO "provider_uid";--> statement-breakpoint
ALTER TABLE "daily_activity" RENAME COLUMN "hc_uid" TO "provider_uid";--> statement-breakpoint
ALTER INDEX "weight_entries_hc_uid_idx" RENAME TO "weight_entries_provider_uid_idx";--> statement-breakpoint
ALTER INDEX "hydration_entries_hc_uid_idx" RENAME TO "hydration_entries_provider_uid_idx";--> statement-breakpoint
ALTER INDEX "workouts_hc_uid_idx" RENAME TO "workouts_provider_uid_idx";--> statement-breakpoint
ALTER INDEX "sleep_sessions_hc_uid_idx" RENAME TO "sleep_sessions_provider_uid_idx";--> statement-breakpoint
ALTER INDEX "daily_activity_hc_uid_idx" RENAME TO "daily_activity_provider_uid_idx";
