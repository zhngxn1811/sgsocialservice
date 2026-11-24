ALTER TABLE "jobs" DROP CONSTRAINT "jobs_apply_url_https";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "link_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "link_missing_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "link_missing_code" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_application_url" CHECK ("apply_url" like 'https://%' or "apply_url" like 'mailto:%');