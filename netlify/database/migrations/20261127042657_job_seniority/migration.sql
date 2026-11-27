ALTER TABLE "jobs" ADD COLUMN "seniority" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_seniority" CHECK ("seniority" in ('entry', 'mid', 'senior'));