import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { syncJobOpportunities } from '@/lib/job-opportunity-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { supabase, isAdmin, adminError } = await requireAdmin();
    if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
    const url = new URL(request.url);
  const workMode = url.searchParams.get('workMode') ?? '';
  const location = (url.searchParams.get('location') ?? '').trim().toLowerCase();
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const technologies = (url.searchParams.get('technology') ?? '').split(/[,/]/).map(value => value.trim().toLowerCase()).filter(Boolean);
  const { data, error } = await supabase.from('job_opportunities').select('*').order('posted_at', { ascending: false }).order('match_score', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const allJobs = data ?? [];
  const jobs = allJobs.filter(job => {
    const modeMatches = !workMode || workMode === 'all' || job.work_mode === workMode;
    const locationText = [...(job.locations ?? []), job.company, job.description].join(' ').toLowerCase();
    const locationMatches = !location || locationText.includes(location);
    const technologyText = [...(job.technology_requirements ?? []), job.title, job.company, job.description].join(' ').toLowerCase();
    const technologyMatches = technologies.every(technology => technologyText.includes(technology));
    const searchMatches = !search || [job.title, job.company, job.description].join(' ').toLowerCase().includes(search);
    return modeMatches && locationMatches && technologyMatches && searchMatches;
  }).slice(0, 200);
  const diagnostics = { stored: allJobs.length, returned: jobs.length, excludedByFilters: allJobs.length - jobs.length };
    return NextResponse.json({ jobs, diagnostics, message: jobs.length ? `Returned ${jobs.length} stored jobs.` : `No stored jobs match the current filters. ${diagnostics.stored ? `${diagnostics.excludedByFilters} stored jobs were excluded by the active filters.` : 'Run POST /api/admin/job-opportunities to sync jobs.'}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? `Job listing lookup failed: ${error.message}` : 'Job listing lookup failed.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const workMode = url.searchParams.get('workMode') ?? '';
    const location = url.searchParams.get('location') ?? '';
    const technology = url.searchParams.get('technology') ?? '';
    const search = url.searchParams.get('search') ?? '';
    const result = await syncJobOpportunities({ workMode, location, technology, search });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job sync failed.';
    const timedOut = /timeout|timed out|abort/i.test(message);
    return NextResponse.json({ ok: false, error: timedOut ? `Job sync timed out while waiting for a public source or AI matching. Existing jobs were kept; try syncing again with narrower filters.` : message }, { status: timedOut ? 504 : 500 });
  }
}