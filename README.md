# SG Social Services — Netlify version

```
public/                    the website
  index.html               main page
  admin.html               your submissions inbox (yoursite/admin)
  privacy.html             privacy page (add your contact email)
  services.json            THE DIRECTORY: edit this to add or update listings
netlify/functions/
  assistant.mjs            AI assistant API  (/api/assistant)
  submissions.mts          form + inbox API  (/api/submissions)
netlify/lib/cors.mjs       lets the mobile apps call the API
scripts/build.mjs          builds dist/: listings in the HTML, issue pages, sitemap
content/categories.json    search and preview text for each issue page
content/site.json          search and preview text for the home and privacy pages
scripts/seo.mjs            SEO rules and checks, plus the services.json safety check
scripts/seo-preview.mjs    builds the private /admin/seo preview page
.pages.yml                 Pages CMS editing forms
public/render.js           listing card renderer shared by the page and the build
public/site.css            shared styles for every page
netlify.toml               Netlify settings
package.json               dependencies (Netlify installs these for you)
```

Submissions are saved in **Netlify Database** (managed PostgreSQL). Each record stores the submission type, service name, organisation, category, phone, website, selected listing ID, details, and optional role, along with its ID, submission date and review status. Recommendations require a service name and details; updates require a selected listing and details. Other fields remain optional.

Netlify provisions the database and applies the migrations in `netlify/database/migrations` during deployment. The schema is defined in `db/schema.ts`; after schema changes, generate a migration with `npx drizzle-kit generate --name describe_change`. Do not apply migrations manually.

The existing `/admin` inbox reads and updates database records using the existing admin key. Opening the inbox also copies any older submissions from Netlify Blobs into the database without deleting the originals or overwriting reviewed database records.

---

## Important: don't use drag-and-drop

Netlify's drag-and-drop upload only handles static files. The AI assistant and the form run as Netlify Functions, and those need Netlify to install packages during the deploy. Use one of the two options below. **Option A is the easiest.**

---

## Option A: Deploy from GitHub (recommended)

### 1. Get your Anthropic key
1. Go to console.anthropic.com, sign up, and add credit (US$10 is plenty to start).
2. Create a key under *API Keys* and copy it somewhere safe.
3. Under *Limits*, **set a monthly spend limit**.

### 2. Put the code on GitHub
1. Make a free GitHub account, then click *New repository*. Name it `sg-social-services` and set it to **Private**.
2. On the repo page, click *uploading an existing file*.
3. Unzip this package. Open the `sg-social-services` folder and drag **everything inside it** into the upload box, including the `netlify` folder and `netlify.toml`.
4. Click *Commit changes*.

### 3. Connect to Netlify
1. Log in at app.netlify.com with your GitHub account.
2. Go to *Add new site → Import an existing project → GitHub* and pick `sg-social-services`.
3. Leave the build settings as they are, since `netlify.toml` handles them, and click **Deploy**.

### 4. Add your keys
1. Open your site, then go to *Site configuration → Environment variables → Add a variable*.
2. Add:
   - `ANTHROPIC_API_KEY`: your key from step 1
   - `ADMIN_KEY`: a long random password of your choice, used to open your inbox. Save it in a password manager.
3. Go to *Deploys → Trigger deploy → Deploy site*. Keys only take effect after a fresh deploy.

### 5. Test it
- Open your `something.netlify.app` URL and run the sample case through the assistant.
- Send a test recommendation through the form.
- Go to `/admin`, enter your `ADMIN_KEY`, and check that your test is there.

---

## Option B: Deploy from your computer (Netlify CLI)

You'll need Node.js 20 or newer (nodejs.org). In the unzipped folder, run:

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

Follow the prompts to create a new site, then add the two environment variables from step 4 above and run `npx netlify-cli deploy --prod` again.

---

## Custom domain

1. Buy your domain (e.g. `sgsocialservices.sg`) from a registrar like Vodien or Exabytes.
2. In Netlify, go to *Domain management → Add a domain* and follow the DNS instructions it gives you. You can either point your registrar's nameservers at Netlify (simplest) or add the records it lists.
3. HTTPS is set up automatically once DNS updates.

## Before you share it
- Put your contact email in `public/privacy.html`.
- Go through every listing in `public/services.json` and update the `"updated"` date.
- Submit the site to Google Search Console.

---

## Running it day to day

**Submissions:** open `yoursite/admin`, enter your key, then mark each one *done* or *rejected* once you've handled it.

**Editing the directory:** on GitHub, open `public/services.json`, click the pencil icon, edit, and commit. Netlify redeploys in about a minute. A listing looks like this:

```json
{
  "id": "unique-short-id",
  "name": "Service name",
  "org": "Organisation",
  "cats": ["violence", "family"],
  "h24": false,
  "desc": "One or two sentences on what they do and who for.",
  "phone": "6123 4567",
  "web": "https://...",
  "tags": ["Short", "Labels"]
}
```

Contact details become clickable automatically in the directory, including future edits. Use `phone` for calls and `web` for the website (a missing `https://` is added). In `other`, label each contact mode and separate entries with semicolons, for example:

```json
"other": "WhatsApp: 9123 4567; SMS: 70999; Email: support@example.org; Website: https://example.org/help"
```

Call numbers open the dialler, SMS numbers open messaging, email addresses open an email app, and WhatsApp numbers open a chat. Singapore eight-digit WhatsApp numbers automatically receive country code 65; include the country code for international WhatsApp numbers. `WhatsApp/SMS: 9123 4567` creates both contact options. Email, SMS, WhatsApp, SMS/WhatsApp, and Skype appear as labelled contact rows alongside Call and Website. Use `Skype: hotline_442` to create a Skype chat link. Keep operating hours and instructions alongside the details; they remain visible as text.

Category ids are `crisis`, `mental`, `addictions`, `substance`, `trauma`, `violence`, `financial`, `family`, `youth`, `seniors`, `disability`, `migrant` and `legal`.

## Costs
- **Netlify:** the free plan should cover a site like this at the start. Check netlify.com/pricing for current limits on function calls.
- **Anthropic:** usage is billed by tokens, including automatic continuations for longer answers. Longer answers cost more. Your spend limit caps the total.

## Troubleshooting
- **The assistant cannot finish:** check function logs and AI Gateway usage for provider errors or exhausted credits.
- **Response length:** the assistant has no application word-count or service-count cap. It automatically continues when a generation reaches the per-request token budget, streaming the continuation into the same answer. Provider context, rate and account limits, and Netlify execution-time and response-size limits still apply; truly unlimited output is not possible. If a connection drops, the displayed partial answer is preserved; try again or request a more focused answer.
- **Too many requests:** Netlify's rate limit is set to 10 assistant calls per person per minute. Change `rateLimit` in the function files to adjust it.
- **Function logs:** in Netlify, go to *Logs → Functions*. Case text is never logged.
- **Assistant or form fails in the mobile app only:** the apps are let in by `netlify/lib/cors.mjs` (tested in `tests/cors.test.mts`). To allow another origin, such as a staging site, add an `ALLOWED_ORIGINS` environment variable (comma-separated). Other websites are still blocked.

## Search and sharing

On every deploy, Netlify runs `scripts/build.mjs`, which copies `public/` into `dist/` and adds the parts search engines need:

- **Listings written into the HTML.** All of `services.json` is in the home page before any JavaScript runs. The page then filters and searches live as before. Built and live cards come from the same file (`public/render.js`), so they always match.
- **A page per presenting issue** at `/help/<slug>/`, e.g. `/help/domestic-family-violence/`. Each has its own title, Google description and intro, all in `content/categories.json`. Edit the wording there. Avoid changing a `slug` once Google has indexed the page, because it changes the address. A new category in `services.json` gets a page automatically, and categories with no listings are skipped.
- **`sitemap.xml`**, linked from `robots.txt`.
- **Share previews**: `public/og-image.png` shows when the site is posted on LinkedIn, WhatsApp or X.
- **Structured data** (JSON-LD) describing the site, each issue page and its services.
- **Icons**: favicon, iPhone home-screen icon and `site.webmanifest`, so "Add to Home Screen" looks like an app.

Links in the sitemap and share tags use your site's main address, which Netlify supplies automatically (your custom domain once it's set as primary). To override it, set a `SITE_URL` environment variable.

### Editing search and preview text (Pages CMS)

1. Go to **app.pagescms.org**, sign in with GitHub and choose this repository. It works on a phone.
2. You'll see three sections:
   - **Search & sharing: home and privacy** (`content/site.json`)
   - **Search & sharing: presenting-issue pages** (`content/categories.json`)
   - **Directory listings** (`public/services.json`)
3. Each page has a **Google title**, a **Google description**, and an optional **social title and description** for LinkedIn and WhatsApp. Leave the social fields empty to reuse the Google text.
4. Save. Netlify redeploys in about a minute.
5. Open **`/admin/seo`** on your site to see every page as it appears in Google and as a share card, with character counts and anything to fix.

The rules (in `scripts/seo.mjs`): titles up to 60 characters, descriptions between 70 and 155, social titles up to 70, and every page with its own title and description. The site name is added to a title only when it still fits. Anything outside the rules shows as a suggestion in the deploy log and on `/admin/seo`, but never stops a deploy.

**Safety net:** if an edit breaks `services.json` (a missing name, a category that doesn't exist, a duplicate ID, a bad link, or invalid formatting), the build stops with a clear message and the live site stays as it was. Fix the listing in Pages CMS and save again.

**Adding a new presenting issue:** add it under *Presenting issues* in Directory listings, then add a matching entry to `.pages.yml` in two places (the `issue-pages` list and the `cats` dropdown values). A test checks these stay in step.

**Never edit `dist/` by hand.** It's rebuilt from scratch on every deploy. To preview locally, run `npm run build` and open `dist/`.

**After deploying:** add the site to Google Search Console and Bing Webmaster Tools, then submit `https://<your-site>/sitemap.xml` in each.

## Mobile apps

The Android and iOS apps (a separate project) use this site's API: `/api/services` for listings, `/api/assistant` and `/api/submissions`. They need nothing else from this repo. Edits to `public/services.json` reach the apps automatically the next time they open, with no app update needed.
