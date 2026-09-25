import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { syncToolFeatures } from '@/lib/tool-feature-sync';

export const runtime = 'nodejs';

export async function POST() {
  const { isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });

  try {
    const results = await syncToolFeatures();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Tool feature sync failed.' }, { status: 500 });
  }
}
