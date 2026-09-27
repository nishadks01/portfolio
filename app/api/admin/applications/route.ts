import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const statuses = new Set(['applied', 'in_progress', 'reply_received', 'selected', 'rejected', 'interview']);

export async function GET() {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  const { data, error } = await supabase
    .from('job_applications')
    .select('*, job:job_opportunities(*)')
    .order('sent_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ applications: data ?? [] });
}

export async function PATCH(request: Request) {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: string; status?: string; notes?: string | null };
  if (!body.id || !body.status || !statuses.has(body.status)) return NextResponse.json({ error: 'A valid application ID and pipeline status are required.' }, { status: 400 });
  const patch: { status: string; notes?: string | null; updated_at: string } = { status: body.status, updated_at: new Date().toISOString() };
  if (body.notes !== undefined) patch.notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : null;
  const { data, error } = await supabase.from('job_applications').update(patch).eq('id', body.id).select('*, job:job_opportunities(*)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ application: data });
}
