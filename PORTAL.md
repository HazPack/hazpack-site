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

1. **Real storage.** `api/_lib/store.js` keeps data in a local file, which is fine for building but not for real client
   records. Replace it with a database plus *private* file storage that offers the same functions
   (`readDb`, `withDb`, `putFile`, `getFile`, `delFile`). Until then the production site answers "not set up yet" on purpose.
2. **Vercel environment variables** (Production): `PORTAL_SESSION_SECRET` (a long random string),
   `PORTAL_STAFF_KEY` (the staff password), `CRON_SECRET` (a long random string).
3. **Uploads** go through the function as base64 and are limited to 3 MB. Switch to direct-to-storage uploads if bigger photos are needed.
4. **Content Security Policy.** The portal's inline styles need `style-src 'unsafe-inline'` (scripts stay `'self'` only). Review once before launch.
5. **Add the "Client Portal" link** to the site menu only when everything above is done.
6. Bank numbers on invoices are placeholders ("Added when live"). Put the real ones in before sending real invoices.
7. Quote and invoice PDFs are page images (text is not selectable). Replace with real text PDFs before launch.
8. Confirm the retention rule (each record is kept 5 months from when it was created) and who should see the staff page.

## Keeping it off the live site while testing

- Work only on this branch. Vercel builds branches as separate preview links, not on hazpackcompliance.com.
- To try a preview with sample data, set `PORTAL_DEMO=1`, `PORTAL_SESSION_SECRET` and `PORTAL_STAFF_KEY` for the **Preview**
  environment only (never Production). Preview data lives in temporary storage and resets often.
- This repository is public, so never commit real client data, passwords, keys or screenshots of real records.
