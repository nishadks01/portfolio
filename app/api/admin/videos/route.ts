import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';

const videoSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  storage_path: z.string().trim().min(1).max(500),
  public_url: z.string().url(),
  sort_order: z.number().int().min(0).default(0)
});

export async function POST(request: Request) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = videoSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid video details.' }, { status: 400 });
  const { data, error } = await supabase.from('project_videos').insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
