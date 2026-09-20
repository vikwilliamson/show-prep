ALTER TABLE "chat_messages" ADD COLUMN "sender_account_id" integer;--> statement-breakpoint
UPDATE "chat_messages" SET "sender_account_id" = "account_id" WHERE "sender_account_id" IS NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "sender_account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_account_id_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
