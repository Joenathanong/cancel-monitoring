import { autoSync } from '@/server/sync';
import { autoCancelSync } from '@/server/cancel-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Dipanggil Vercel Cron (header Authorization: Bearer <CRON_SECRET>) atau
 * layanan cron luar (cron-job.org) dengan ?key=<CRON_SECRET>.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ?only=pending | ?only=cancel memisahkan dua pekerjaan bila cron luar dipasang terpisah
  const only = url.searchParams.get('only');
  const pending = only === 'cancel' ? null : await autoSync('cron');
  const cancel = only === 'pending' ? null : await autoCancelSync('cron');
  return Response.json({ ok: true, pending, cancel });
}
