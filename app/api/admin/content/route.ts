import { NextResponse } from 'next/server';
import { createClient, requireAdmin } from '@/lib/supabase/server';
import { getPortfolioData } from '@/lib/portfolio-data';

export async function GET() {
  const { isAdmin, user, adminError } = await requireAdmin();
  if (!isAdmin) {
    const detail = adminError?.message ?? `No row found in public.admins for ${user?.email ?? 'the signed-in user'} (${user?.id ?? 'unknown UUID'})`;
    return NextResponse.json({ error: detail }, { status: 401 });
  }
  return NextResponse.json(await getPortfolioData());
}

export async function PUT(request: Request) {
  const { supabase, isAdmin, user, adminError } = await requireAdmin();
  if (!isAdmin) {
    const detail = adminError?.message ?? `No row found in public.admins for ${user?.email ?? 'the signed-in user'} (${user?.id ?? 'unknown UUID'})`;
    return NextResponse.json({ error: detail }, { status: 401 });
  }
  const body = await request.json();
  const { profile, skills, experiences, projects, education, tools, toolFeatures, wallpapers } = body;
  const updates = [
    supabase.from('profiles').update(profile).eq('id', profile.id),
    supabase.from('skills').upsert(skills),
    supabase.from('experiences').upsert(experiences),
    supabase.from('projects').upsert(projects),
    supabase.from('education').upsert(education),
    supabase.from('tools').upsert(tools ?? []),
    supabase.from('tool_features').upsert(toolFeatures ?? []),
    supabase.from('wallpapers').upsert(wallpapers ?? [])
  ];
  const results = await Promise.all(updates);
  const error = results.find(r => r.error)?.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
