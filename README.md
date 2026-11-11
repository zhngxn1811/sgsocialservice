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

Category ids are `crisis`, `mental`, `addictions`, `substance`, `trauma`, `violence`, `financial`, `family`, `youth`, `seniors`, `disability`, `migrant` and `legal`.

## Costs
- **Netlify:** the free plan should cover a site like this at the start. Check netlify.com/pricing for current limits on function calls.
- **Anthropic:** usage is billed by tokens, including automatic continuations for longer answers. Longer answers cost more. Your spend limit caps the total.

## Troubleshooting
- **The assistant cannot finish:** check function logs and AI Gateway usage for provider errors or exhausted credits.
- **Response length:** the assistant has no application word-count or service-count cap. It automatically continues when a generation reaches the per-request token budget, streaming the continuation into the same answer. Provider context, rate and account limits, and Netlify execution-time and response-size limits still apply; truly unlimited output is not possible. If a connection drops, the displayed partial answer is preserved; try again or request a more focused answer.
- **Too many requests:** Netlify's rate limit is set to 10 assistant calls per person per minute. Change `rateLimit` in the function files to adjust it.
- **Function logs:** in Netlify, go to *Logs → Functions*. Case text is never logged.
