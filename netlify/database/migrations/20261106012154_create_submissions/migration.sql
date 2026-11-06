CREATE TABLE "submissions" (
	"id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"kind" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"org" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"web" text DEFAULT '' NOT NULL,
	"service_id" text DEFAULT '' NOT NULL,
	"details" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	CONSTRAINT "submissions_kind" CHECK ("kind" in ('recommend', 'update')),
	CONSTRAINT "submissions_status" CHECK ("status" in ('new', 'done', 'rejected')),
	CONSTRAINT "submissions_details_required" CHECK (length(trim("details")) > 0),
	CONSTRAINT "submissions_name_required" CHECK ("kind" <> 'recommend' or length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE INDEX "submissions_created_at_idx" ON "submissions" ("created_at");