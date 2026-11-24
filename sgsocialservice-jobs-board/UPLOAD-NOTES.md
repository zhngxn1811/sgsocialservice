# Jobs board: how to add this to your GitHub repo

This folder has the same layout as your repo. Copy everything into the repo, commit and push, and Netlify will deploy it and create the `jobs` table by itself.

## 1. New files (copy straight in)

- `public/jobs/` (board page, styles, script), `public/md.js`, `public/admin/jobs.html`
- `netlify/functions/jobs.mts`, `job-page.mts`, `jobs-assistant.mts`, `jobs-sync-background.mts`, `jobs-sync-scheduled.mts`
- `netlify/lib/jobs.mts`, `jobs-sync.mts`, `job-page.mts`, `jobs-assistant.mts` (the jobs assistant's instructions are in `buildSystem` here), `hiring.mts`
- `netlify/database/migrations/20261123161613_jobs_board/`
- `content/job-org-types.json`, `content/hiring-now.json` (the "Hiring now" organisations)
- `tests/jobs.test.mts`, `tests/job-page.test.mts`, `tests/jobs-assistant.test.mts`, `tests/hiring.test.mts`, `tests/fixtures/mcf.mts`

## 2. Changed files (check before overwriting)

These already exist in your repo. If you haven't edited them since my last copy, just overwrite them. If you have, apply `jobs-board-changes.patch` instead (`git apply jobs-board-changes.patch` from the repo root), which only adds the jobs bits:

- `db/schema.ts`: adds the `jobs` table and two new usage counters
- `netlify/lib/usage.mts`: separate daily cap and counts for the jobs assistant
- `public/track.js`: counts board and job page views
- `public/admin/stats.html`: shows jobs assistant use
- `public/privacy.html`: new "jobs board and jobs assistant" section
- `scripts/build.mjs`: adds `/jobs/` to the sitemap
- `package.json`: typecheck covers the new files
- `tests/usage.test.mts`, `README.md`

`netlify/functions/assistant.mjs` (the directory assistant) is **not** touched.

## 3. Add a link from the homepage

`index.html` isn't included, so your current homepage stays as it is. Put this inside `<div class="header-actions">`, before the Dark mode button:

```html
<a class="btn" href="/jobs/">Jobs board</a>
```

## 4. After deploying

1. Check `ADMIN_KEY` and `ANTHROPIC_API_KEY` are set in Netlify (they already are if the directory works).
2. Open `/admin/jobs`, sign in, press **Refresh jobs now**, wait a few minutes and reload.
3. Open `/jobs/` and try the assistant.

From then on, jobs refresh every day at 6am.

## 5. Keeping "Hiring now" fresh

Open `content/hiring-now.json`. To add an organisation, copy an entry and change it. When you re-check an employer's careers page, change its `checked` date to today. Cards hide themselves 120 days after that date, so a forgotten entry never sits on the board for long.
