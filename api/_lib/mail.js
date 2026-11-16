// Email alerts for the client portal, sent through Resend (https://resend.com) from this server code only.
//
// Settings (Vercel environment variables):
//   RESEND_API_KEY       turns email on. Without it nothing is sent and the portal works as before.
//   PORTAL_MAIL_FROM     sender, e.g. "HazPack Compliance <portal@hazpackcompliance.com>". Its domain must be verified in Resend.
//   PORTAL_STAFF_EMAIL   where HazPack's own alerts go (new requests, client uploads, messages, quote answers).
//   PORTAL_URL           link put in each email. Defaults to this preview's branch link, or the live site.
//
// Every staff notification is emailed to PORTAL_STAFF_EMAIL. Only some client notifications are emailed (see clientKind):
// each goes to every person at that company who has email alerts on and can see the job (admins see every job).
// Invoices also copy the company's accounts email. Sample addresses (.example, .test, .invalid, localhost) are skipped.

const DEFAULT_FROM = 'HazPack Compliance <lax-dgr@hazpackcompliance.com>';
const API = () => process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const FAKE = /\.(example|test|invalid|localhost)$|@(example\.(com|org|net)|localhost)$/i;

export const mailOn = () => Boolean(process.env.RESEND_API_KEY);
const staffInbox = () => process.env.PORTAL_STAFF_EMAIL || 'lax-dgr@hazpackcompliance.com';
const portalUrl = () => {
  if (process.env.PORTAL_URL) return process.env.PORTAL_URL;
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}/portal`;
  return 'https://hazpackcompliance.com/portal';
};
const realAddress = (a) => typeof a === 'string' && EMAIL.test(a.trim()) && !FAKE.test(a.trim());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Notifications name jobs by HazPack's internal number; emails use the client's own reference instead.
const refText = (org, text) => String(text).replace(/HP-\d{4}-\d{3}/g, (id) => org.jobs.find((j) => j.id === id)?.ref || id);
const canSee = (rep, job) => rep.admin || (job && job.rep === rep.id);

// Snapshot of notification ids per company, taken before a change, so the new ones can be found afterwards.
export const notifIds = (db) => new Map(db.orgs.map((o) => [o.id, new Set(o.notifs.map((n) => n.id))]));

// Which client email a notification is, read from the wording the portal gives each notification (portal/app.js).
// Only these send an email; every other client notification (a job step done, a correction resolved, a quote sent to a
// company with no job yet) stays inside the portal. Staff alerts are all emailed.
export function clientKind(n) {
  const t = String(n.text || '');
  if (/^HazPack received your request and opened job /.test(t)) return 'opened';
  if (/ needs a correction before it can be cleared to ship\.$/.test(t)) return 'fix';
  if (/^HazPack sent a message on /.test(t)) return 'message';
  const doc = /^HazPack (added|updated) .+ \((invoice|quote)\)/.exec(t);
  if (doc) {
    if (!n.job) return null; // a quote for work with no job yet: no email
    return doc[2] + (doc[1] === 'updated' ? 'Updated' : '');
  }
  if (/^HazPack added .+ to \S+\.$/.test(t)) return 'file';
  return null;
}

// The emails for every notification added since `before`. Built inside the database change, sent after it is saved.
export function newMail(db, before) {
  const out = [];
  for (const org of db.orgs) {
    const had = before.get(org.id) || new Set();
    for (const n of org.notifs) {
      if (had.has(n.id)) continue;
      const job = n.job ? org.jobs.find((j) => j.id === n.job) : null;
      if (n.to === 'staff') {
        const text = refText(org, n.text);
        out.push({ to: [staffInbox()], subject: `${org.name}: ${text}`.slice(0, 150), text, staff: true, org: org.name });
        continue;
      }
      if (n.to !== 'client') continue;
      const kind = clientKind(n);
      if (!kind || !job) continue;
      const ref = job.ref || job.id;
      const subject = CLIENT[kind].subject(ref).slice(0, 150);
      const people = org.reps.filter((r) => r.notify && realAddress(r.email) && canSee(r, job));
      const cc = n.acct && realAddress(org.accountsEmail) ? [org.accountsEmail.trim()] : [];
      people.forEach((r, i) => out.push({ to: [r.email.trim()], cc: i === 0 ? cc.filter((c) => c.toLowerCase() !== r.email.trim().toLowerCase()) : [], subject, kind, ref, name: r.name }));
      if (!people.length && cc.length) out.push({ to: cc, cc: [], subject, kind, ref, name: '' });
    }
  }
  return out.filter((m) => m.to.every(realAddress));
}

// Client emails, worded as HazPack wrote them (EMAIL TEMPLATES folder): greeting, one line, "Thank you," and the signature.
const CLIENT = {
  opened: { subject: (r) => `Request accepted: ${r}`, line: (r) => `We have accepted your request for ${r}.` },
  fix: { subject: (r) => `Correction needed: ${r}`, line: (r) => `Please see the correction needed for ${r} in the client portal.` },
  message: { subject: (r) => `New message: ${r}`, line: (r) => `You have received a message in the client portal for ${r}.` },
  file: { subject: (r) => `Files uploaded: ${r}`, line: (r) => `Files for ${r} have been uploaded to the client portal.` },
  quote: { subject: (r) => `Quote for ${r}`, line: (r) => `A quote for ${r} is waiting for your approval. Please open the client portal to review.` },
  quoteUpdated: { subject: (r) => `Updated quote for ${r}`, line: (r) => `A quote for ${r} is waiting for your approval. Please open the client portal to review.` },
  invoice: { subject: (r) => `Invoice for ${r}`, line: (r) => `Here is the invoice for ${r}. Please let us know if you have any questions!` },
  invoiceUpdated: { subject: (r) => `Updated invoice for ${r}`, line: (r) => `Here is the updated invoice for ${r}. Please let us know if you have any questions!` },
};

// "Good morning" before noon in Los Angeles, "Good afternoon" from noon on.
export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Los_Angeles' }).format(now));
  return h < 12 ? 'Good morning' : 'Good afternoon';
}

// Staff alerts: logo on top, the update in a highlighted box, an orange button. Client emails: plain, like a personal email,
// ending with a signature laid out like the team's email signature (logo, orange bar, navy name, orange title, grey labels).
// Tables and inline styles only, so they hold up in Outlook and Gmail. The logo is served from the live site.
const SITE = 'https://hazpackcompliance.com';
// Signature logo: the logo on a solid white background (email-logo.png), so it reads the same in dark mode, where mail apps darken the page but never change images.
const SIG_LOGO = `${SITE}/email-logo.png`;
const LOGO = `${SITE}/assets/logo.png`; // /logo.png redirects here (vercel.json), so point at the final address
const NAVY = '#1B2A4A', ORANGE = '#E8792B', INK = '#1f2937', GREY = '#6b7280', LIGHT = '#9ca3af';
const SIG = {
  name: 'Alexander Walsh',
  title: ['Dangerous Goods Specialist', 'IATA DGR Certified'],
  rows: [['Tel', '+1 310-425-3712', 'tel:+13104253712'], ['Mob', '+1 310-387-1473', 'tel:+13103871473'], ['Email', 'lax-dgr@hazpackcompliance.com', 'mailto:lax-dgr@hazpackcompliance.com'], ['Web', 'www.hazpackcompliance.com', SITE]],
  services: ['Dangerous Goods Packaging', 'Regulatory Compliance', 'Certification & Documentation'],
};
const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const MAIL_FONT = 'font-family:Aptos,Calibri,Arial,Helvetica,sans-serif;';

export function render(m, now = new Date()) {
  return m.staff ? renderStaff(m) : renderClient(m, now);
}

function renderClient(m, now) {
  const hello = `${greeting(now)}${m.name ? ', ' + m.name.trim().split(/\s+/)[0] : ''},`;
  const line = CLIENT[m.kind].line(m.ref);
  const url = portalUrl();
  const text = [hello, '', line, '', `Open the client portal: ${url}`, '', 'Thank you,', '', '--', SIG.name, SIG.title.join(' | '), 'HazPack Compliance Solutions', ...SIG.rows.map(([k, v]) => `${k}: ${v}`), SIG.services.join(' · ')].join('\n');

  const p = (t) => `<p style="margin:0 0 18px;${MAIL_FONT}font-size:15px;line-height:1.5;color:#111111">${t}</p>`;
  const brk = (v) => esc(v).replace('@', '@<wbr>').replace(/^www\./, 'www.<wbr>');
  const sig =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr>` +
    `<td class="hp-logo" width="160" valign="middle" style="width:160px;padding:0 22px 0 0;vertical-align:middle">` +
      `<a href="${SITE}"><img class="hp-logo-img" src="${SIG_LOGO}" width="160" height="61" alt="HazPack Compliance" style="display:block;border:0;width:160px;height:auto"></a></td>` +
    `<td class="hp-det" valign="middle" style="border-left:3px solid ${ORANGE};padding:4px 0 4px 20px;vertical-align:middle">` +
      `<div class="hp-name" style="${FONT}font-size:18px;font-weight:bold;color:${NAVY};line-height:1.3">${esc(SIG.name)}</div>` +
      `<div class="hp-title" style="${FONT}font-size:14px;font-weight:bold;color:${ORANGE};line-height:1.45;margin:4px 0 16px">${esc(SIG.title[0])}<span class="hp-sep">&nbsp; |&nbsp; </span><span class="hp-t2" style="white-space:nowrap">${esc(SIG.title[1])}</span></div>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
      SIG.rows.map(([k, v, href]) => `<tr><td class="hp-lab" style="${FONT}font-size:14px;color:${GREY};padding:4px 16px 4px 0;vertical-align:top;width:44px">${k}</td><td class="hp-val" style="${FONT}font-size:14px;padding:4px 0"><a href="${esc(href)}" style="color:${NAVY};text-decoration:none">${brk(v)}</a></td></tr>`).join('') +
      `</table>` +
      `<div class="hp-svc" style="${FONT}font-size:12.5px;color:${LIGHT};line-height:1.7;margin-top:16px">${SIG.services.map(esc).join(' &nbsp;&middot;&nbsp; ')}</div>` +
    `</td></tr></table>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<style>@media only screen and (max-width:480px){.hp-sep{display:none!important}.hp-t2{display:block!important}` +
    `.hp-logo{width:84px!important;padding-right:12px!important}.hp-logo-img{width:84px!important}.hp-det{padding-left:12px!important}` +
    `.hp-name{font-size:16px!important}.hp-title{font-size:12.5px!important}.hp-lab,.hp-val{font-size:13px!important}` +
    `.hp-lab{width:34px!important;padding-right:8px!important}.hp-svc{font-size:11.5px!important}}</style>` +
    `<title>${esc(m.subject || 'HazPack')}</title></head>` +
    `<body style="margin:0;padding:0;background:#ffffff">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(line)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff"><tr><td style="padding:20px 16px">` +
    `<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px"><tr><td>` +
      p(esc(hello)) + p(esc(line)) + p(`<a href="${esc(url)}" style="color:${NAVY};font-weight:bold;text-decoration:underline">Open the client portal</a>`) + p('Thank you,') + sig +
    `</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

function renderStaff(m) {
  const url = portalUrl();
  const lead = `From the client portal (${m.org}):`;
  const foot = 'This is an automatic alert from the HazPack client portal.';
  const text = [lead, '', m.text, '', `Sign in to see it: ${url}`, '', foot].join('\n');
  const p = (t, extra = '') => `<p style="margin:0 0 14px;${FONT}font-size:15px;line-height:1.55;color:${INK};${extra}">${t}</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<style>@media only screen and (max-width:480px){.hp-pad{padding-left:20px!important;padding-right:20px!important}}</style>` +
    `<title>${esc(m.subject || 'HazPack client portal')}</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f3f6">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.text)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f6"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;border-top:4px solid ${ORANGE}">` +
      `<tr><td class="hp-pad" style="padding:24px 32px 18px;border-bottom:1px solid #e5e7eb">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td><a href="${SITE}"><img src="${LOGO}" width="150" height="47" alt="HazPack Compliance" style="display:block;border:0;width:150px;height:auto"></a></td>` +
        `<td align="right" style="${FONT}font-size:12px;color:${GREY};letter-spacing:.5px;text-transform:uppercase">Client portal</td>` +
        `</tr></table></td></tr>` +
      `<tr><td class="hp-pad" style="padding:28px 32px 32px">` +
        p(esc(lead), `color:${GREY}`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr>` +
        `<td style="background:#f6f7f9;border-left:4px solid ${ORANGE};border-radius:4px;padding:14px 18px;${FONT}font-size:15px;line-height:1.5;color:${NAVY};font-weight:bold">${esc(m.text)}</td></tr></table>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${ORANGE}" style="border-radius:6px">` +
        `<a href="${esc(url)}" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">Open the client portal</a></td></tr></table>` +
        `<p style="margin:14px 0 0;${FONT}font-size:12px;line-height:1.5;color:${LIGHT}">Or copy this link: <a href="${esc(url)}" style="color:${GREY}">${esc(url)}</a></p>` +
      `</td></tr>` +
    `</table>` +
    `<p style="max-width:560px;margin:16px auto 0;${FONT}font-size:12px;line-height:1.5;color:${LIGHT};text-align:center">${esc(foot)}</p>` +
    `</td></tr></table></body></html>`;
  return { text, html };
}

// Sends each email; a failure is logged and never undoes the change the person made. Returns how many were accepted.
export async function sendMail(list) {
  if (!mailOn() || !list.length) return 0;
  const from = process.env.PORTAL_MAIL_FROM || DEFAULT_FROM;
  const results = await Promise.allSettled(list.slice(0, 40).map(async (m) => {
    const body = { from, to: m.to, subject: m.subject, ...render(m) };
    if (m.cc?.length) body.cc = m.cc;
    if (!m.staff) body.reply_to = staffInbox();
    const res = await fetch(API(), {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`email refused (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }));
  for (const r of results) if (r.status === 'rejected') console.error('[portal mail]', r.reason?.message || r.reason);
  return results.filter((r) => r.status === 'fulfilled').length;
}
