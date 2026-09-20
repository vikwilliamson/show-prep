ALTER INDEX "nutrition_hc_uid_idx" RENAME TO "nutrition_entries_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "weight_hc_uid_idx" RENAME TO "weight_entries_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "hydration_hc_uid_idx" RENAME TO "hydration_entries_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "workout_hc_uid_idx" RENAME TO "workouts_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "sleep_hc_uid_idx" RENAME TO "sleep_sessions_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "activity_hc_uid_idx" RENAME TO "daily_activity_hc_uid_idx";
--> statement-breakpoint
ALTER INDEX "activity_local_date_idx" RENAME TO "daily_activity_local_date_idx";
--> statement-breakpoint
ALTER INDEX "checkin_account_week_idx" RENAME TO "check_ins_account_week_idx";
--> statement-breakpoint
ALTER INDEX "coach_brief_account_week_idx" RENAME TO "coach_briefs_account_week_idx";
