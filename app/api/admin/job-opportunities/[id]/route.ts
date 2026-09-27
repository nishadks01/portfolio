import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';

const statusSchema = z.object({ status: z.enum(['new', 'viewed', 'reviewed', 'saved', 'applied', 'dismissed']) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A valid job status is required.' }, { status: 400 });
  const { data, error } = await supabase.from('job_opportunities').update({ status: parsed.data.status }).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ job: data });
}
