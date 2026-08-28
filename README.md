# Wheel Fitment Log

A mobile-friendly fitment logging app, replacing the old Google Form.

- **Reads** the live wheel catalogue from your published CSV export (no credentials needed).
- **Writes** each submission as a new row in a dedicated Google Sheet, via a Google service account.

## What's in here

- `public/` — the front-end (plain HTML/CSS/JS, no build step, no frameworks)
- `api/submit.js` — a serverless function that appends each submission to the Google Sheet
- `data/manufacturers.json` — cleaned car manufacturer/model dataset (bundled, no API)
- `data/countries.json` — UK + European countries

## One-time setup already done for you

- A new Google Sheet called **"Wheel Fitment Submissions"** has been created in your Drive and shared (Editor access) with the service account.
- **Before first use**, add a header row to that sheet's first tab (it's called `Sheet1` by default) with these 12 columns, in order:

  `Timestamp | Country | Manufacturer | Model | Year | Brand | Design | Size | Colour/Finish | Staggered | Stockcode | Logged By`

  (If you already had an 11-column header without "Logged By", just add that heading as the next column — existing rows are unaffected, it'll just be blank for anything logged before this was added.)

  "Logged By" is filled in automatically from a one-time name prompt each computer sees on its first visit (stored locally in the browser, not tied to any login) — see "Who's logging what" below.

## Who's logging what

Since everyone shares the same login, the app can't tell people apart from the password alone — so it uses a small one-time-per-device trick instead:

- The first time the app is opened on a given computer/browser, a popup asks "Who's logging fitments on this computer?" and takes a name.
- That name is saved locally in that browser (`localStorage`) — not sent anywhere until the next actual submission — and every submission from that device from then on is tagged with it automatically in the "Logged By" column.
- Nobody has to type or pick their name again after that. A small "Logging as [Name] · not you?" line appears above the form as a reminder; clicking "not you?" lets someone correct it (e.g. a shared machine, or it was set up wrong).
- This is purely for attribution/convenience, not a security feature — anyone can click "not you?" and change it. It just answers "who logged this fitment" without adding individual logins.
- Next to the badge is a **"recent uploads"** link — it opens a small dropdown showing the last few fitments that person logged, read live from the actual sheet (via `api/recent.js`, which reuses the same service account as the write side, read-only). It's there so someone can double-check they actually submitted something, without leaving the app or scrolling through the sheet.

## Deploying (Vercel, free tier)

**Option A — via GitHub (recommended, no command line needed after initial push):**

1. Create a new empty repository on GitHub (e.g. `wheel-fitment-log`).
2. Push this folder's contents to it.
3. Go to vercel.com → "Add New" → "Project" → import that GitHub repo → Deploy.
4. In the Vercel project's Settings → Environment Variables, add:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `wheel-fitment-writer@b2b-inventory-2026.iam.gserviceaccount.com`
   - `GOOGLE_SERVICE_ACCOUNT_KEY` = the `private_key` value from your service account JSON file (paste it exactly as it appears, including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines and `\n` sequences)
   - `GOOGLE_SUBMISSIONS_SHEET_ID` = `1U2Taj-O53XMqIqJNZhGviSbyO6iiEb9biLSVl_fvaHk`
   - `GOOGLE_SUBMISSIONS_SHEET_NAME` = `Sheet1`
   - `SITE_PASSWORD` = the shared team password (choose one — this is what colleagues will be prompted for before the app loads)
   - `SITE_USERNAME` = (optional) a shared username; defaults to `team` if you skip this
5. Redeploy (Vercel prompts you to after adding env vars). You'll get a live `https://your-project.vercel.app` link.

**Option B — Vercel CLI (if you have Node.js installed):**

```bash
npm i -g vercel
cd wheel-fitment-log
vercel
# follow the prompts, then set the same 4 env vars via:
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL
vercel env add GOOGLE_SERVICE_ACCOUNT_KEY
vercel env add GOOGLE_SUBMISSIONS_SHEET_ID
vercel env add GOOGLE_SUBMISSIONS_SHEET_NAME
vercel env add SITE_PASSWORD
vercel env add SITE_USERNAME
vercel --prod
```

## Access

Once `SITE_PASSWORD` is set, the whole app (including the submit endpoint) is behind a browser login prompt — anyone opening the link is asked for a username/password before they see anything. Colleagues sign in once per browser and it's remembered after that. Leave `SITE_PASSWORD` unset and the app behaves exactly like the old Google Form (open link, no login).

## Pinning it as a desktop app (no browser chrome)

Once it's deployed and you have a live URL, in Edge or Chrome:

1. Open the URL.
2. Click the **"…"** menu (or the install icon in the address bar) → **Apps** → **Install this site as an app**.
3. It'll install using the custom wheel icon and "Fitment Log" name baked into the app, and offer to pin it to the Start menu/taskbar/desktop.

From then on it opens in its own window — no address bar, no tabs — just like a normal Windows program.

## Security notes

- The service account JSON key is never included in this repo — it only lives in Vercel's encrypted environment variables.
- The app itself needs no login for colleagues — same access level as the current Google Form.
- Only the write-back function touches Google credentials; the catalogue read is a plain public fetch.
