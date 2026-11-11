// Starts the local sample data over:  npm run seed
// Deletes data/ (sample logins, shipments, files) and writes a fresh set. Local development only.
import { resetAll, readDb } from '../api/_lib/store.js';
import { DEMO_LOGINS } from '../api/_lib/seed.js';

await resetAll();
const db = await readDb();
console.log(`Wrote ${db.orgs.length} sample companies, ${db.shipments.length} shipments, ${db.files.length} files.`);
for (const l of DEMO_LOGINS) console.log(`  ${l.slug} / ${l.password}   ${Object.entries(l.profiles).map(([n, p]) => `${n} ${p}`).join(', ')}`);
