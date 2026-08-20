DROP INDEX "activity_hc_uid_idx";--> statement-breakpoint
DROP INDEX "activity_local_date_idx";--> statement-breakpoint
DROP INDEX "hydration_hc_uid_idx";--> statement-breakpoint
DROP INDEX "sleep_hc_uid_idx";--> statement-breakpoint
DROP INDEX "weight_hc_uid_idx";--> statement-breakpoint
DROP INDEX "workout_hc_uid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "activity_hc_uid_idx" ON "daily_activity" USING btree ("account_id","hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_local_date_idx" ON "daily_activity" USING btree ("account_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "hydration_hc_uid_idx" ON "hydration_entries" USING btree ("account_id","hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "sleep_hc_uid_idx" ON "sleep_sessions" USING btree ("account_id","hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_hc_uid_idx" ON "weight_entries" USING btree ("account_id","hc_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_hc_uid_idx" ON "workouts" USING btree ("account_id","hc_uid");