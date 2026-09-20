CREATE TABLE "group_message_archives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "qq_user_id" varchar(32) NOT NULL,
  "sender_display_name" varchar(100),
  "external_message_id" varchar(128) NOT NULL,
  "content" text NOT NULL,
  "sent_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "group_message_archives_group_external_unique" ON "group_message_archives" ("group_id", "external_message_id");
CREATE INDEX "group_message_archives_group_sent_idx" ON "group_message_archives" ("group_id", "sent_at", "id");

CREATE TABLE "group_daily_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "summary_date" date NOT NULL,
  "timezone" varchar(64) NOT NULL,
  "source_message_count" integer NOT NULL,
  "source_latest_message_at" timestamptz NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "group_daily_summaries_group_date_unique" ON "group_daily_summaries" ("group_id", "summary_date");
