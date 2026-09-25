import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data: video, error: readError } = await supabase.from('project_videos').select('storage_path').eq('id', id).single();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });
  const { error: storageError } = await supabase.storage.from('project-videos').remove([video.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 400 });
  const { error } = await supabase.from('project_videos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
