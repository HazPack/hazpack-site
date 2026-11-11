# HazPack client portal (work in progress)

Lives on the `client-portal` branch. **It is not live**: `main` is what hazpackcompliance.com serves, and nothing here
reaches `main` until the pull request is merged. The main site does not link to the portal, and every portal page and
API response says `noindex` so search engines skip it.

## What is built

The portal screen is the design prototype (`portal/app.js`, `portal/portal.css`) connected to the back end in `api/`.

- `/portal`: company sign-in (organization ID + password), then pick a person and enter their 4-digit PIN. HazPack staff use the
  "HazPack staff sign-in" link on the same page (staff key).
- Client side: dashboard, jobs, files, invoices, team, job requests (with DGD upload), messages, notifications, accepting or declining quotes.
  Admins see every job in the company; members see only their own jobs and files (the server filters this, not the page).
- Staff side: home ("Needs attention"), jobs table and job workspace, billing (quotes and invoices, rates, PDF, send to client), clients.
- The server (`api/_lib/portal.js`) holds companies, people, jobs, files, notifications, quotes/invoices and the rate card.
  Clients can only run the actions listed in `CLIENT_ACTIONS` (request a job, withdraw it, message, upload, answer a quote, set a route,
  mark notifications read, manage their team). Staff changes are saved company by company with a revision check, so two people never overwrite each other.
- Files are only served through `/api/portal-file` after the sign-in check, and a member can only open files on their own jobs.
- Records are removed 5 months after they are created (`/api/portal-purge`, run daily by the cron in `vercel.json`).
- Passwords and PINs are stored only as salted hashes. Five wrong attempts lock that company or person for 15 minutes.
- Libraries the page needs (pdf.js, html2canvas, jsPDF, JSZip) are served from `portal/vendor/`, never from another site.

## Try it on your computer

```
npm run dev      # http://localhost:4321/portal   (staff: the link on that page, key "dev")
npm test         # automated checks (sign-in, access rules, uploads, staff saves, clean-up)
npm run seed     # start the sample data over
```

Sample logins are printed when the server starts. All sample companies, people and documents are made up and are
marked "sample" on screen. They exist only locally (the `data/` folder is not committed) or on a preview with `PORTAL_DEMO=1`.

## Before real clients can use it (not done yet)

1. **Real storage (Supabase).** Done in code (`api/_lib/store.js`). When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
   (Vercel's Supabase integration adds them, for Production and Preview), records live in one Supabase table and files in a
   private Storage bucket called `portal-files`. Without them the portal uses local files (development only).
   One-time set-up: in Supabase open **SQL Editor** and run this once. It creates the table and closes it to Supabase's public web API:

   ```sql
   create table if not exists portal_state (
     id integer primary key,
     rev integer not null default 0,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table portal_state enable row level security;
   ```

   The portal creates the empty first row and the file bucket itself. With Supabase connected there is no sample data:
   create companies from the staff screen (Clients, Add company). Preview and Production share one Supabase project until
   you split them, so delete test companies before going live.
2. **Vercel environment variables** (Production): `PORTAL_SESSION_SECRET` (a long random string),
   `PORTAL_STAFF_KEY` (the staff password), `CRON_SECRET` (a long random string).
3. **Uploads** go through the function as base64 and are limited to 3 MB. Switch to direct-to-storage uploads if bigger photos are needed.
4. **Content Security Policy.** The portal's inline styles need `style-src 'unsafe-inline'` (scripts stay `'self'` only). Review once before launch.
5. **The "Client Portal" button is in the site menu** (between Resources and Request a Quote, on every page). Merging this branch to `main` makes it live, so only merge when everything above is done.
6. Bank numbers on invoices are placeholders ("Added when live"). Put the real ones in before sending real invoices.
7. Quote and invoice PDFs are page images (text is not selectable). Replace with real text PDFs before launch.
8. Confirm the retention rule (each record is kept 5 months from when it was created) and who should see the staff page.

## Email alerts

Every portal notification is also emailed, through [Resend](https://resend.com), once these are set in Vercel
(Settings, Environment Variables; tick **Preview** to try it on the client-portal link, and **Production** for launch):

| Variable | What to put |
| --- | --- |
| `RESEND_API_KEY` | An API key from Resend (API Keys, Create, "Sending access"). Without it nothing is emailed. |
| `PORTAL_MAIL_FROM` | The sender, e.g. `HazPack Compliance <portal@hazpackcompliance.com>`. |
| `PORTAL_STAFF_EMAIL` | Where HazPack's alerts go. Defaults to lax-dgr@hazpackcompliance.com. |
| `PORTAL_URL` | Optional. The link in each email. Defaults to the preview's branch link, or the live portal. |

Before the first email: in Resend, **Domains, Add domain**, enter `hazpackcompliance.com`, and add the DNS records it shows
where the domain's DNS is managed. Resend only sends from a verified domain.

Who gets what:
- **Clients:** each person at the company with email alerts on (Team page) who can see the job; admins see every job.
  Covers files and documents HazPack adds, quotes and invoices sent, job steps, corrections and messages from HazPack.
  Invoices also copy the company's accounts email. Replies go to `PORTAL_STAFF_EMAIL`.
- **HazPack:** new job requests, withdrawn requests, client uploads and messages, and quotes accepted or declined.
- Emails name jobs by the client's reference. Sample addresses (`.example`, `.test`) are never emailed, so the demo data is safe.
- The portal's email previews say "Email sent" when email is on, and "not set up yet" when it is off.

## Keeping it off the live site while testing

- Work only on this branch. Vercel builds branches as separate preview links, not on hazpackcompliance.com.
- To try a preview with sample data, set `PORTAL_DEMO=1`, `PORTAL_SESSION_SECRET` and `PORTAL_STAFF_KEY` for the **Preview**
  environment only (never Production). Preview data lives in temporary storage and resets often.
- This repository is public, so never commit real client data, passwords, keys or screenshots of real records.
