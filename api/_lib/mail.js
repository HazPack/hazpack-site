// Email alerts for the client portal, sent through Resend (https://resend.com) from this server code only.
//
// Settings (Vercel environment variables):
//   RESEND_API_KEY       turns email on. Without it nothing is sent and the portal works as before.
//   PORTAL_MAIL_FROM     sender, e.g. "HazPack Compliance <portal@hazpackcompliance.com>". Its domain must be verified in Resend.
//   PORTAL_STAFF_EMAIL   where HazPack's own alerts go (new requests, client uploads, messages, quote answers).
//   PORTAL_URL           link put in each email. Defaults to this preview's branch link, or the live site.
//
// Every new portal notification becomes one email per person: a client notification goes to each person at that company
// who has email alerts on and can see the job (admins see every job); a staff notification goes to PORTAL_STAFF_EMAIL.
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
  return 'https://www.hazpackcompliance.com/portal';
};
const realAddress = (a) => typeof a === 'string' && EMAIL.test(a.trim()) && !FAKE.test(a.trim());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Notifications name jobs by HazPack's internal number; emails use the client's own reference instead.
const refText = (org, text) => String(text).replace(/HP-\d{4}-\d{3}/g, (id) => org.jobs.find((j) => j.id === id)?.ref || id);
const canSee = (rep, job) => rep.admin || (job && job.rep === rep.id);

// Snapshot of notification ids per company, taken before a change, so the new ones can be found afterwards.
export const notifIds = (db) => new Map(db.orgs.map((o) => [o.id, new Set(o.notifs.map((n) => n.id))]));

// The emails for every notification added since `before`. Built inside the database change, sent after it is saved.
export function newMail(db, before) {
  const out = [];
  for (const org of db.orgs) {
    const had = before.get(org.id) || new Set();
    for (const n of org.notifs) {
      if (had.has(n.id)) continue;
      const job = n.job ? org.jobs.find((j) => j.id === n.job) : null;
      const text = refText(org, n.text);
      if (n.to === 'staff') {
        out.push({ to: [staffInbox()], subject: `${org.name}: ${text}`.slice(0, 150), text, staff: true, org: org.name });
        continue;
      }
      if (n.to !== 'client') continue;
      const people = org.reps.filter((r) => r.notify && realAddress(r.email) && (job ? canSee(r, job) : r.admin));
      const cc = n.acct && realAddress(org.accountsEmail) ? [org.accountsEmail.trim()] : [];
      people.forEach((r, i) => out.push({ to: [r.email.trim()], cc: i === 0 ? cc.filter((c) => c.toLowerCase() !== r.email.trim().toLowerCase()) : [], subject: `HazPack: ${text}`.slice(0, 150), text, name: r.name }));
      if (!people.length && cc.length) out.push({ to: cc, cc: [], subject: `HazPack: ${text}`.slice(0, 150), text, name: '' });
    }
  }
  return out.filter((m) => m.to.every(realAddress));
}

// Branded layout, matching HazPack's email signature: logo on top, the update in a highlighted box, an orange button,
// then a signature block (orange bar, navy name, orange title, grey labels). Tables and inline styles only, so it holds up
// in Outlook and Gmail. The logo is served from the live site, so it shows once the site has it (it does from launch).
const SITE = 'https://www.hazpackcompliance.com';
const LOGO = `${SITE}/assets/logo.png`;
const NAVY = '#1B2A4A', ORANGE = '#E8792B', INK = '#1f2937', GREY = '#6b7280', LIGHT = '#9ca3af';
const SIG = {
  name: 'HazPack Compliance Solutions',
  title: 'Dangerous Goods Specialists  |  IATA DGR Certified',
  rows: [['Tel', '+1 310-425-3712', 'tel:+13104253712'], ['Email', 'lax-dgr@hazpackcompliance.com', 'mailto:lax-dgr@hazpackcompliance.com'], ['Web', 'www.hazpackcompliance.com', SITE]],
  services: 'Dangerous Goods Packaging  ·  Regulatory Compliance  ·  Certification & Documentation',
};
const FONT = 'font-family:Arial,Helvetica,sans-serif;';

export function render(m) {
  const url = portalUrl();
  const hello = m.staff ? '' : m.name ? `Hi ${m.name.split(' ')[0]},` : 'Hello,';
  const lead = m.staff ? `From the client portal (${m.org}):` : 'There is an update for you in the HazPack client portal:';
  const foot = m.staff
    ? 'This is an automatic alert from the HazPack client portal.'
    : 'You get these emails because email alerts are on for you in the HazPack client portal. Your company admin can turn them off on the Team page.';
  const sigText = m.staff ? [] : ['--', SIG.name, SIG.title.replace(/\s+\|\s+/, ' | '), ...SIG.rows.map(([k, v]) => `${k}: ${v}`)];
  const text = [hello, lead, '', m.text, '', `Sign in to see it: ${url}`, '', ...sigText, ...(sigText.length ? [''] : []), foot].filter((l, i) => l || i > 0).join('\n');

  const p = (t, extra = '') => `<p style="margin:0 0 14px;${FONT}font-size:15px;line-height:1.55;color:${INK};${extra}">${t}</p>`;
  const sig = m.staff ? '' :
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr>` +
    `<td width="3" style="width:3px;background:${ORANGE};font-size:0;line-height:0">&nbsp;</td>` +
    `<td style="padding:2px 0 2px 18px">` +
      `<div style="${FONT}font-size:17px;font-weight:bold;color:${NAVY};line-height:1.3">${esc(SIG.name)}</div>` +
      `<div style="${FONT}font-size:13px;font-weight:bold;color:${ORANGE};line-height:1.4;margin:3px 0 12px">${esc(SIG.title).replace(/  /g, '&nbsp; ')}</div>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
      SIG.rows.map(([k, v, href]) => `<tr><td style="${FONT}font-size:13px;color:${GREY};padding:2px 18px 2px 0;vertical-align:top">${k}</td><td style="${FONT}font-size:13px;padding:2px 0"><a href="${esc(href)}" style="color:${NAVY};text-decoration:none">${esc(v)}</a></td></tr>`).join('') +
      `</table>` +
      `<div style="${FONT}font-size:12px;color:${LIGHT};line-height:1.5;margin-top:12px">${esc(SIG.services).replace(/  /g, '&nbsp; ')}</div>` +
    `</td></tr></table>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.subject || 'HazPack client portal')}</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f3f6">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.text)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f6"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;border-top:4px solid ${ORANGE}">` +
      `<tr><td style="padding:24px 32px 18px;border-bottom:1px solid #e5e7eb">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td><a href="${SITE}"><img src="${LOGO}" width="150" height="47" alt="HazPack Compliance" style="display:block;border:0;width:150px;height:auto"></a></td>` +
        `<td align="right" style="${FONT}font-size:12px;color:${GREY};letter-spacing:.5px;text-transform:uppercase">Client portal</td>` +
        `</tr></table></td></tr>` +
      `<tr><td style="padding:28px 32px 32px">` +
        (hello ? p(esc(hello), `color:${NAVY};font-weight:bold`) : '') + p(esc(lead), `color:${GREY}`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr>` +
        `<td style="background:#f6f7f9;border-left:4px solid ${ORANGE};border-radius:4px;padding:14px 18px;${FONT}font-size:15px;line-height:1.5;color:${NAVY};font-weight:bold">${esc(m.text)}</td></tr></table>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${ORANGE}" style="border-radius:6px">` +
        `<a href="${esc(url)}" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">Open the client portal</a></td></tr></table>` +
        `<p style="margin:14px 0 0;${FONT}font-size:12px;line-height:1.5;color:${LIGHT}">Or copy this link: <a href="${esc(url)}" style="color:${GREY}">${esc(url)}</a></p>` +
        sig +
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
