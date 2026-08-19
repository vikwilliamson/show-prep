DROP INDEX "checkin_week_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_account_week_idx" ON "check_ins" USING btree ("account_id","week_start");