# HazPack client portal (work in progress)

Lives on the `client-portal` branch. **It is not live**: `main` is what hazpackcompliance.com serves, and nothing here
reaches `main` until the pull request is merged. The main site does not link to the portal, and every portal page and
API response says `noindex` so search engines skip it.

## What is built

- `/portal` company sign-in (company ID + password), then `/portal/profile` (pick a person, enter their PIN),
  then `/portal/dashboard` (that company's shipments, statuses, DGDs, invoices and packing photos).
- `/portal/staff` for the HazPack team: create companies, add/remove profiles and reset PINs/passwords, add shipments,
  set statuses (Cleared to ship, Needs correction, In progress, Completed), upload and delete files.
- Each company sees only its own records. Files are served only through `/api/portal-file` after sign-in, never from a public link.
- Records are removed 5 months after they are created (`/api/portal-purge`, run daily by the cron in `vercel.json`).
- Passwords and PINs are stored only as salted hashes. Five wrong attempts lock that company or profile for 15 minutes.

## Try it on your computer

```
npm run dev      # http://localhost:4321/portal   (staff page: /portal/staff, key "dev")
npm test         # 78 automated checks
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
4. **Add the "Client Portal" link** to the site menu only when everything above is done.
5. Confirm the retention rule (each record is kept 5 months from when it was created) and who should see the staff page.

## Keeping it off the live site while testing

- Work only on this branch. Vercel builds branches as separate preview links, not on hazpackcompliance.com.
- To try a preview with sample data, set `PORTAL_DEMO=1`, `PORTAL_SESSION_SECRET` and `PORTAL_STAFF_KEY` for the **Preview**
  environment only (never Production). Preview data lives in temporary storage and resets often.
- This repository is public, so never commit real client data, passwords, keys or screenshots of real records.
