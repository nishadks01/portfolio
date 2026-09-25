import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data: wallpaper, error: readError } = await supabase.from('wallpapers').select('storage_path').eq('id', id).single();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });
  const { error: storageError } = await supabase.storage.from('wallpapers').remove([wallpaper.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 400 });
  const { error } = await supabase.from('wallpapers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
