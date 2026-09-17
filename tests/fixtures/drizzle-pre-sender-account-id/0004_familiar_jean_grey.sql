ALTER TABLE "settings" ALTER COLUMN "divisions" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "target_name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "program_type" text;