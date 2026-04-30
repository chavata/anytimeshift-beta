# AnytimeShift Beta — Setup

One-time setup to deploy this with Supabase as the data layer + the admin dashboard.

## 1. Create Supabase project

1. Go to https://supabase.com and create a new project (free tier is fine).
2. Pick a strong DB password and store it in your password manager (you won't need it for the app, but Supabase asks for it).
3. Wait ~2 minutes for the project to provision.

## 2. Run the schema

1. In Supabase, open **SQL Editor** → **New query**.
2. Copy/paste the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Click **Run**. You should see "Success. No rows returned."

## 3. Grab the API keys

1. In Supabase, go to **Project Settings → API**.
2. Copy two values:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** secret (NOT the `anon` key) → this is `SUPABASE_SERVICE_ROLE_KEY`

⚠️ The `service_role` key bypasses RLS. Treat it like a database password. **Never commit it. Never expose it to the browser.**

## 4. Set Netlify env vars

In your Netlify project: **Site configuration → Environment variables → Add a variable** for each of:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | from step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 3 |
| `ADMIN_PASSWORD` | your choice — use something strong |
| `ADMIN_SECRET` | any random 32+ character string (e.g. `openssl rand -hex 32`) |
| `EMAIL_PASS` | should already be set from before — keep it |

Trigger a redeploy after setting these (or push a commit).

## 5. Test the signup flow

1. Open your live site, fill out the signup form.
2. Check your email — you should get the welcome message.
3. In Supabase: **Table Editor → beta_testers** → you should see the row.

## 6. Test the admin dashboard

1. Go to `https://your-site.netlify.app/admin`
2. Enter your `ADMIN_PASSWORD`.
3. You should see the dashboard with your test signup.

## 7. Wait for the feedback cron

After ~5 minutes, the scheduled function runs and emails the feedback link to anyone who opted in. Check **Functions → sendFeedbackEmails-scheduled** in Netlify for logs.

---

## Local development (optional)

```bash
npm install
npm install -g netlify-cli
netlify login
netlify link              # link to your Netlify project
netlify dev               # runs locally with env vars from Netlify
```

Open http://localhost:8888 — both the static site and functions are served together.

## What lives where

- `index.html` + `signup-client.js` — beta signup form
- `feedback.html` — feedback form (loaded via emailed link with `?token=...`)
- `admin/index.html` + `admin/admin.js` — admin dashboard (password-protected)
- `netlify/functions/signup.js` — handles signup POST
- `netlify/functions/submitFeedback.js` — handles feedback POST
- `netlify/functions/sendFeedbackEmails-scheduled.js` — cron job, every 5 min
- `netlify/functions/adminLogin.js` / `adminLogout.js` / `adminData.js` — admin endpoints
- `netlify/functions/_lib/` — shared helpers (Supabase client, auth, rate limit, app link config)
- `supabase/schema.sql` — DB schema
