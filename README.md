# HazPack Compliance Solutions website

Static site (HTML/CSS/JS, no build step) for HazPackCompliance.com.

## Before you go live

1. **Quote form key.** Already added (Web3Forms). In your Web3Forms dashboard, make sure the allowed website is hazpackcompliance.com, then submit one test request after launch to confirm it reaches your inbox.
2. **Check the flyer-based wording.** Some content (service names, "IATA DGR certified / IMDG trained / 49 CFR compliant", contact details) comes from your flyer. Keep only what is currently true.
3. **Photos.** The flyer's photos (Canva) are not used on the site. If you want photos later, confirm your Canva license covers web use or use your own.

4. **Resources pages.** The seven pages in `resources/` are general educational overviews. Have someone who knows the current regulations read them before launch, especially Lithium Batteries, Dangerous Goods Declarations and Enforcement and Penalties (no penalty dollar amounts are quoted on purpose). To edit one, change its `.html` file directly.
5. **About section.** Confirm the wording for "mobile" (we come to you) and "in-house" services.

## Deploy to Vercel

Option A: GitHub (recommended, auto-updates on every change)
1. Create a free GitHub account and a new repository, e.g. `hazpack-site`. Upload all files in this folder.
2. At https://vercel.com sign up with GitHub, click **Add New > Project**, import the repo.
3. Framework Preset: **Other**. Leave build settings empty. Click **Deploy**.

Option B: Vercel CLI
```
npm i -g vercel
cd hazpack-site
vercel --prod
```

## Point the GoDaddy domain at Vercel

1. In Vercel: Project > **Settings > Domains**, add `hazpackcompliance.com`. Also add `www.hazpackcompliance.com` (choose to redirect one to the other).
2. Vercel will show the exact DNS records it wants. Use the values shown on that screen. Typically:
   - **A** record, Name `@`, Value `76.76.21.21`
   - **CNAME** record, Name `www`, Value `cname.vercel-dns.com` (Vercel may show a project-specific value; use that if so)
3. In GoDaddy: **My Products > Domains > hazpackcompliance.com > DNS**.
   - Delete the existing `@` A record that points to GoDaddy's parked page ("WebsiteBuilder Site" / Parked).
   - Delete the existing `www` CNAME if it points to something else, and remove any Domain Forwarding under the domain's settings.
   - Add the A and CNAME records from step 2. TTL: default is fine.
   - Do NOT touch MX, TXT or other records if you use email on this domain.
4. Wait a few minutes (can take up to a few hours). Vercel shows a green check when valid and issues the HTTPS certificate automatically.
5. If you use Microsoft 365 / GoDaddy email on the domain, leave those MX records alone.

## Pages

Each tab is its own page. With `cleanUrls` on in `vercel.json`, Vercel serves them without `.html`:

| Page | File | URL |
|---|---|---|
| Home | `index.html` | `/` |
| Services | `services.html` | `/services` |
| Who We Serve | `who-we-serve.html` | `/who-we-serve` |
| Request a Quote (form + contact) | `quote.html` | `/quote` |
| Resources hub | `resources/index.html` | `/resources` |
| Seven resource guides | `resources/*.html` | `/resources/<name>` |

**Editing the menu or footer.** The header and footer are repeated in every page's HTML (there is no build step). To change a menu item, phone number or email, search the project for the old text and change it in each file. Phone and email also appear on `quote.html`, the resource pages' side boxes and the footer.

**Package builder (Home page) and inspection walkthrough (Services page).** The Home steps are in `index.html` (section `id="builder"`); the inspection steps are in `services.html` (section `id="inspection-demo"`). The animation logic is at the bottom of `script.js` and its styles at the bottom of `styles.css`. You can reword the step text freely. Adding or removing a step also means changing the drawing: each piece of artwork has a `data-min` number saying which step it appears at.

**Previewing locally.** Links start with `/` (for example `/services`), so double-clicking a file will not follow them. Preview with `npx serve .` from this folder (it understands clean URLs), or just push to GitHub and use Vercel's preview link.

## Files

- `index.html`, `services.html`, `who-we-serve.html`, `quote.html`: the main pages
- `assets/`: `styles.css` and `script.js` (shared styling, menu and quote form behavior)
- `resources/`: the Resources hub and seven resource pages (linked from the Resources menu)
- `assets/`: `logo.svg`, `logo.png`, `favicon.svg`, `apple-touch-icon.png` (brand assets)
- `docs/PORTAL.md`: how the client portal works and what is left before launch
- `vercel.json`, `robots.txt`, `sitemap.xml`: hosting and SEO
