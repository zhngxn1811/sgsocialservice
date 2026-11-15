CREATE TABLE "usage_daily" (
	"day" date,
	"source" text DEFAULT 'web',
	"metric" text,
	"key" text DEFAULT '',
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_pkey" PRIMARY KEY("day","source","metric","key"),
	CONSTRAINT "usage_daily_metric" CHECK ("metric" in ('visit', 'pageview', 'search', 'search_no_results', 'filter', 'assistant')),
	CONSTRAINT "usage_daily_count_positive" CHECK ("count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "usage_daily_day_idx" ON "usage_daily" ("day");