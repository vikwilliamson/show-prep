DROP INDEX "nutrition_hc_uid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_hc_uid_idx" ON "nutrition_entries" USING btree ("account_id","hc_uid");