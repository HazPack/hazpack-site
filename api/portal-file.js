import { bad, handler } from './_lib/http.js';
import { fileFor } from './_lib/portal.js';
import { currentClient, isStaff } from './_lib/auth.js';

// Files are only ever served through here, after the sign-in check, never from a public address.
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '');
  let orgId = null;
  if (!isStaff(request)) {
    const c = await currentClient(request);
    if (!c || !c.profile) return bad('Please sign in.', 401);
    orgId = c.org.id;
  }
  const found = await fileFor(orgId, id);
  if (!found) return bad('File not found.', 404);
  const name = found.meta.name.replace(/[^A-Za-z0-9._ -]/g, '_');
  return new Response(found.buf, {
    headers: {
      'content-type': found.meta.type,
      'content-disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
});
