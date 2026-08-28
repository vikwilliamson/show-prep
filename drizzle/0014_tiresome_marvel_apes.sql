ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_activity" DROP CONSTRAINT "daily_activity_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "document_chunks_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "hydration_entries" DROP CONSTRAINT "hydration_entries_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "nutrition_entries" DROP CONSTRAINT "nutrition_entries_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "protocols" DROP CONSTRAINT "protocols_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "sleep_sessions" DROP CONSTRAINT "sleep_sessions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_log" DROP CONSTRAINT "sync_log_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "weekly_targets" DROP CONSTRAINT "weekly_targets_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "weight_entries" DROP CONSTRAINT "weight_entries_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activity" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hydration_entries" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "protocols" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sleep_sessions" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_log" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_targets" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "weight_entries" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydration_entries" ADD CONSTRAINT "hydration_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_targets" ADD CONSTRAINT "weekly_targets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;