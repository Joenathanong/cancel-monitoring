import { apiUser, isResponse } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { cancelDashboard } from '@/server/cancel-query';
import { parseCancelFilter } from '@/lib/cancel-filter';

export const dynamic = 'force-dynamic';

/** Data dashboard Monitoring Cancel (JSON) — ?from=YYYY-MM-DD&to=…&area=&platform=&shop= */
export async function GET(req: Request) {
  const u = await apiUser();
  if (isResponse(u)) return u;
  const f = parseCancelFilter(new URL(req.url).searchParams);
  return Response.json(await cancelDashboard(f, await getSettings()));
}
