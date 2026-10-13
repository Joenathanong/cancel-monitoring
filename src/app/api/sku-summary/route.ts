import { apiUser, isResponse } from '@/lib/auth';
import { skuSummary } from '@/server/summary';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await apiUser();
  if (isResponse(u)) return u;
  return Response.json({ rows: await skuSummary() });
}
