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

function render(m) {
  const url = portalUrl();
  const hello = m.staff ? '' : m.name ? `Hi ${m.name.split(' ')[0]},` : 'Hello,';
  const lead = m.staff ? `From the client portal (${m.org}):` : 'There is an update for you in the HazPack client portal:';
  const foot = m.staff
    ? 'This is an automatic alert from the HazPack client portal.'
    : 'You get these emails because email alerts are on for you in the HazPack client portal. Your company admin can turn them off on the Team page.';
  const text = [hello, lead, '', m.text, '', `Sign in to see it: ${url}`, '', foot].filter((l, i) => l || i > 0).join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1b2433;max-width:560px">` +
    (hello ? `<p>${esc(hello)}</p>` : '') + `<p>${esc(lead)}</p>` +
    `<p style="padding:12px 16px;background:#f4f6fa;border-left:3px solid #F37A21;border-radius:4px"><b>${esc(m.text)}</b></p>` +
    `<p><a href="${esc(url)}" style="display:inline-block;background:#F37A21;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Open the client portal</a></p>` +
    `<p style="font-size:12.5px;color:#6b7686">${esc(foot)}</p></div>`;
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
