ALTER TABLE "submissions" ADD COLUMN "submitter_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "submitter_org_type" text DEFAULT '' NOT NULL;