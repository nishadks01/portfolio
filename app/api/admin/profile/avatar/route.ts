import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const profileId = typeof body?.profile_id === 'string' ? body.profile_id : '';
  const avatarUrl = typeof body?.avatar_url === 'string' ? body.avatar_url.trim() : '';
  if (!profileId || !avatarUrl || avatarUrl.length > 2000) {
    return NextResponse.json({ error: 'A valid profile ID and avatar URL are required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', profileId)
    .select('id, avatar_url')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, profile: data });
}