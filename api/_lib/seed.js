// Made-up sample data. Every company, person and document here is fake.
import { randomUUID } from 'node:crypto';
import { hashSecret } from './crypto.js';
import { RETENTION_MONTHS } from './config.js';
import { samplePdf, samplePng } from './samples.js';

export const DEMO_LOGINS = [
  { slug: 'demo-logistics', password: 'demo-password-1', profiles: { Gabe: '1234', Amy: '5678' } },
  { slug: 'sample-freight', password: 'sample-password-2', profiles: { Jordan: '2468' } },
];

const addMonths = (iso, n) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

export function buildDemo() {
  const db = { orgs: [], shipments: [], files: [], meta: { locks: {} } };
  const bytes = [];

  const org = (name, login) => {
    const o = {
      id: randomUUID(), slug: login.slug, name, demo: true, createdAt: daysAgo(40),
      passwordHash: hashSecret(login.password),
      profiles: Object.entries(login.profiles).map(([n, pin]) => ({ id: randomUUID(), name: n, pinHash: hashSecret(pin) })),
    };
    db.orgs.push(o);
    return o;
  };
  const ship = (o, reference, description, status, age) => {
    const createdAt = daysAgo(age);
    const s = { id: randomUUID(), orgId: o.id, reference, description, status, createdAt, updatedAt: createdAt, expiresAt: addMonths(createdAt, RETENTION_MONTHS) };
    db.shipments.push(s);
    return s;
  };
  const file = (s, kind, name, buf, type, age) => {
    const createdAt = daysAgo(age);
    const f = { id: randomUUID(), orgId: s.orgId, shipmentId: s.id, kind, name, type, size: buf.length, createdAt, expiresAt: addMonths(createdAt, RETENTION_MONTHS) };
    db.files.push(f);
    bytes.push({ id: f.id, buf });
  };

  const a = org('Demo Logistics Co. (sample)', DEMO_LOGINS[0]);
  const s1 = ship(a, 'DL-1001', 'Lithium batteries, UN3481, to Frankfurt (air)', 'Cleared to ship', 3);
  file(s1, 'DGD', 'DL-1001-DGD.pdf', samplePdf('Shipper\'s Declaration (sample)', ['Reference: DL-1001', 'UN3481 Lithium ion batteries packed with equipment']), 'application/pdf', 3);
  file(s1, 'Photo', 'DL-1001-packed-box.png', samplePng(360, 220, [24, 49, 82]), 'image/png', 3);
  const s2 = ship(a, 'DL-1002', 'Dry ice, UN1845, to Chicago (ground)', 'Needs correction', 6);
  file(s2, 'DGD', 'DL-1002-DGD.pdf', samplePdf('Shipper\'s Declaration (sample)', ['Reference: DL-1002', 'Needs correction: net quantity of dry ice missing']), 'application/pdf', 6);
  const s3 = ship(a, 'DL-1003', 'Aerosols, UN1950, to Phoenix (ground)', 'In progress', 1);
  file(s3, 'Photo', 'DL-1003-labels.png', samplePng(360, 220, [90, 40, 20]), 'image/png', 1);
  const s4 = ship(a, 'DL-0990', 'Paint, UN1263, to Seattle (ground)', 'Completed', 35);
  file(s4, 'DGD', 'DL-0990-DGD.pdf', samplePdf('Shipper\'s Declaration (sample)', ['Reference: DL-0990']), 'application/pdf', 35);
  file(s4, 'Invoice', 'INV-0990.pdf', samplePdf('Invoice INV-0990 (sample)', ['Inspection and packing: $0.00 (sample)']), 'application/pdf', 34);

  const b = org('Sample Freight LLC (sample)', DEMO_LOGINS[1]);
  const s5 = ship(b, 'SF-2001', 'Perfume, UN1266, to Tokyo (air)', 'In progress', 2);
  file(s5, 'DGD', 'SF-2001-DGD.pdf', samplePdf('Shipper\'s Declaration (sample)', ['Reference: SF-2001', 'This belongs to a different company']), 'application/pdf', 2);
  const s6 = ship(b, 'SF-2000', 'Batteries, UN3480, to Dallas (ground)', 'Completed', 20);
  file(s6, 'Invoice', 'INV-2000.pdf', samplePdf('Invoice INV-2000 (sample)'), 'application/pdf', 19);

  return { db, bytes };
}
