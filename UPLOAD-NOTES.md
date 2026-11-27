# Training directory and training assistant

Adds `/training/` with course listings (fees, accreditation and grants) and its own AI training assistant. This package includes the jobs board files it builds on, so upload the jobs board package first if you haven't.

## New files (copy straight in)
- `public/training/` (page, script, styles, `courses.json` course list)
- `netlify/lib/training-assistant.mts` (the assistant's instructions are in `buildSystem` here)
- `netlify/functions/training-assistant.mts` (`/api/training-assistant`)
- `netlify/database/migrations/20261127185420_training_assistant/` (lets the stats count training assistant use)
- `tests/training.test.mts`, `tests/training-assistant.test.mts`

## Changed files (these also contain the jobs board changes)
If you've already uploaded the jobs board package and haven't edited these since, overwrite them:
- `db/schema.ts`, `netlify/lib/usage.mts`, `tests/usage.test.mts`: training assistant counters and daily cap
- `public/admin/stats.html`: shows "Training assistant uses"
- `public/privacy.html`: new training assistant section
- `public/jobs/index.html`: "Training" button in the header
- `scripts/build.mjs`: adds `/training/` to the sitemap
- `package.json`: typecheck covers the new files
- `README.md`: training section
- `public/md.js`: unchanged from the jobs board package; included in case you need it

## Settings
Nothing new is required. It uses the same `ANTHROPIC_API_KEY`. Optional: `TRAINING_ASSISTANT_DAILY_CAP` (default 150) and `TRAINING_CLAUDE_MODEL`.

## Updating courses
Edit `public/training/courses.json` and run `npm test`. Copy fees exactly as providers list them, say which run they're from, list only accreditation the provider states, and describe who qualifies for each grant. The assistant reads the same file, so it updates with the page.
