import { NextResponse } from 'next/server';
import { syncToolFeatures } from '@/lib/tool-feature-sync';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!expected || authorization !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 });

  try {
    const results = await syncToolFeatures();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Tool feature sync failed.' }, { status: 500 });
  }
}
