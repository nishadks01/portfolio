import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

type SourceDefinition = { key: string; label: string; company: string; url: string; enabled: boolean; reason?: string };
type RawJob = { source: string; source_job_id: string; title: string; company: string; locations: string[]; work_mode: 'remote' | 'hybrid' | 'onsite' | 'unknown'; employment_type: string | null; description: string; technology_requirements: string[]; canonical_url: string; apply_url: string | null; posted_at: string | null; detail_url?: string };
type ProfileContext = { profile: Record<string, unknown>; skills: Array<Record<string, unknown>>; experiences: Array<Record<string, unknown>>; projects: Array<Record<string, unknown>>; resume_text?: string };
type InterviewPlan = { focus_areas: string[]; prepare: string[]; brush_up: string[]; likely_questions: string[]; expected_questions: Array<{ question: string; answer: string }>; programming_questions: Array<{ question: string; answer: string }>; preparation_steps: string[]; risk_flags: string[] };
type GeminiMatch = { index: number; match_score: number; match_reason: string; technology_requirements: string[]; interview_plan: InterviewPlan };

export type JobSyncResult = { source: string; status: 'updated' | 'skipped' | 'failed'; count: number; reason?: string };

export const jobSources: SourceDefinition[] = [
  { key: 'infopark', label: 'Infopark Kochi', company: 'Infopark / member companies', url: 'https://infopark.in/companies-job', enabled: true },
  { key: 'linkedin', label: 'LinkedIn', company: 'LinkedIn', url: 'https://www.linkedin.com/jobs/search/?keywords=software%20developer&location=India&geoId=&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0', enabled: true },
  { key: 'naukri', label: 'Naukri.com', company: 'Naukri.com', url: 'https://www.naukri.com/software-developer-jobs', enabled: true },
  { key: 'indeed', label: 'Indeed.com', company: 'Indeed.com', url: 'https://www.indeed.com/q-Software-Developer-jobs.html', enabled: true },
  { key: 'accenture', label: 'Accenture Careers', company: 'Accenture', url: 'https://www.accenture.com/in-en/careers/jobsearch?ct=Kochi&aoi=Software%20Engineering&et=Full-time', enabled: true },
  { key: 'tcs', label: 'TCS Careers', company: 'Tata Consultancy Services', url: 'https://www.tcs.com/careers', enabled: true },
  { key: 'infosys', label: 'Infosys Careers', company: 'Infosys', url: 'https://www.infosys.com/careers.html', enabled: true },
  { key: 'wipro', label: 'Wipro Careers', company: 'Wipro', url: 'https://careers.wipro.com/', enabled: true },
  { key: 'hcl', label: 'HCL Careers', company: 'HCL Technologies', url: 'https://www.hcltech.com/careers', enabled: true },
  { key: 'cognizant', label: 'Cognizant Careers', company: 'Cognizant Technology Solutions', url: 'https://careers.cognizant.com/global/en', enabled: true },
  { key: 'capgemini', label: 'Capgemini Careers', company: 'Capgemini', url: 'https://www.capgemini.com/careers/', enabled: true },
  { key: 'ey', label: 'EY Careers', company: 'Ernst & Young', url: 'https://www.ey.com/en_in/careers', enabled: true },
  { key: 'deloitte', label: 'Deloitte Careers', company: 'Deloitte', url: 'https://www2.deloitte.com/global/en/careers.html', enabled: true },
  { key: 'ibm', label: 'IBM Careers', company: 'IBM', url: 'https://www.ibm.com/employment/', enabled: true },
  { key: 'apple', label: 'Apple Careers', company: 'Apple Inc.', url: 'https://www.apple.com/careers/', enabled: true }
];

function infoparkSourceForFilters(source: SourceDefinition, filters: { location?: string; technology?: string }) {
  if (source.key !== 'infopark') return source;
  const location = (filters.location ?? '').toLowerCase();
  const locationSlugs: Array<[RegExp, string, string]> = [
    [/phase\s*1|kochi\s*phase\s*1/, 'infopark-kochi-phase-1', 'Infopark Kochi Phase 1'],
    [/phase\s*2|kochi\s*phase\s*2/, 'infopark-kochi-phase-2', 'Infopark Kochi Phase 2'],
    [/cherthala/, 'infopark-cherthala', 'Infopark Cherthala'],
    [/thrissur/, 'infopark-thrissur', 'Infopark Thrissur'],
    [/south\s*metro|ernakulam\s*south/, 'i-by-infopark-ernakulam-south-metro-station', 'i by Infopark Ernakulam South Metro Station']
  ];
  const selected = locationSlugs.find(([pattern]) => pattern.test(location));
  const path = selected?.[1] ?? '';
  const params = new URLSearchParams();
  const technologySearch = filters.technology?.trim().replace(/[,/]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (technologySearch) params.set('search', technologySearch);
  const base = `https://infopark.in/companies-job${path ? `/${path}` : ''}`;
  return { ...source, label: selected?.[2] ?? source.label, url: `${base}${params.toString() ? `?${params}` : ''}` };
}

function cleanText(value: unknown) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value: unknown, baseUrl: string) {
  try { return new URL(String(value), baseUrl).toString(); } catch { return baseUrl; }
}

function normalizedDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  const dayMonthYear = text.match(/^(\d{1,2})[-/]([01]?\d)[-/](20\d{2})$/);
  if (dayMonthYear) {
    const [, day, month, year] = dayMonthYear;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function dateNearText(text: string): string | null {
  const candidate = text.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,|\s)\s*20\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/i)?.[0];
  return normalizedDate(candidate);
}

function workMode(text: string): RawJob['work_mode'] {
  const normalized = text.toLowerCase();
  if (/\bhybrid\b/.test(normalized)) return 'hybrid';
  if (/\bremote\b|work from home|wfh/.test(normalized)) return 'remote';
  if (/\bonsite\b|on-site|in office|office-based/.test(normalized)) return 'onsite';
  return 'unknown';
}

function hash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 24);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function withConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

function parseJsonLd(html: string, source: SourceDefinition): RawJob[] {
  const jobs: RawJob[] = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = [...asArray(parsed), ...asArray(parsed?.['@graph'])];
      for (const node of nodes) {
        if (!node || typeof node !== 'object' || !String((node as Record<string, unknown>)['@type'] ?? '').toLowerCase().includes('jobposting')) continue;
        const item = node as Record<string, any>;
        const locationValues = asArray(item.jobLocation).map(location => { const value = (location && typeof location === 'object' ? location : {}) as Record<string, any>; const address = (value.address && typeof value.address === 'object' ? value.address : {}) as Record<string, any>; return cleanText(address.addressLocality ?? address.addressRegion ?? value.name ?? location); }).filter(Boolean);
        const description = cleanText(item.description);
        const url = absoluteUrl(item.url ?? source.url, source.url);
        const id = String(item.identifier?.value ?? item.identifier ?? hash(`${source.key}:${url}:${item.title}`));
        const combined = `${item.title ?? ''} ${description} ${locationValues.join(' ')}`;
        jobs.push({ source: source.label, source_job_id: id, title: cleanText(item.title) || `${source.company} opportunity`, company: cleanText(item.hiringOrganization?.name) || source.company, locations: locationValues.length ? locationValues : ['Location not specified'], work_mode: workMode(combined), employment_type: cleanText(item.employmentType) || null, description: description.slice(0, 12000), technology_requirements: [], canonical_url: url, apply_url: url, posted_at: normalizedDate(item.datePosted) });
      }
    } catch {}
  }
  return jobs;
}

function infoparkSlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function infoparkCanonicalJobUrl(company: string, title: string) {
  const companySlug = infoparkSlug(company);
  const titleSlug = infoparkSlug(title);
  return `https://infopark.in/jobs/${companySlug}/${titleSlug}`;
}

function parseInfoparkJobs(html: string, source: SourceDefinition): RawJob[] {
  const jobs: RawJob[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rowMatch of html.matchAll(rowPattern)) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => cleanText(match[1]));
    const detailHref = row.match(/href=["']([^"']*company-jobs\/details[^"']*)["']/i)?.[1];
    if (cells.length < 3 || !detailHref || !cells[0] || !cells[1] || !cells[2] || /date of posting|job title|company name/i.test(cells[0])) continue;
    const legacyDetailUrl = absoluteUrl(detailHref, source.url);
    const canonicalUrl = infoparkCanonicalJobUrl(cells[2], cells[1]);
    jobs.push({
      source: source.label,
      source_job_id: hash(`${source.key}:${legacyDetailUrl}`),
      title: cells[1],
      company: cells[2],
      locations: [source.label.replace(/^Infopark /, 'Infopark, ')],
      work_mode: workMode(`${cells[1]} ${cells[2]} ${source.label}`),
      employment_type: null,
      description: `${cells[1]} at ${cells[2]}. ${source.label} listing. Last date to apply: ${cells[3] ?? 'Not specified'}. Full role requirements are available at the details page.`,
      technology_requirements: [],
      canonical_url: canonicalUrl,
      apply_url: canonicalUrl,
      detail_url: legacyDetailUrl,
      posted_at: normalizedDate(cells[0])
    });
  }
  return jobs;
}

function parseAnchors(html: string, source: SourceDefinition): RawJob[] {
  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const title = cleanText(match[2]);
    const url = absoluteUrl(match[1], source.url);
    const lower = `${title} ${url}`.toLowerCase();
    if (title.length < 8 || title.length > 180 || seen.has(url) || /^(home|login|sign in|read more|apply now|view all|careers|search|menu)$/i.test(title)) continue;
    if (!/(job|career|engineer|developer|analyst|manager|consultant|software|technology|walk-in|opening|vacanc|full stack|frontend|backend|react|node|next)/i.test(lower)) continue;
    seen.add(url);
    const nearbyText = cleanText(html.slice(Math.max(0, (match.index ?? 0) - 280), Math.min(html.length, (match.index ?? 0) + match[0].length + 280)));
    jobs.push({ source: source.label, source_job_id: hash(`${source.key}:${url}`), title, company: source.company, locations: ['Location not specified'], work_mode: workMode(`${title} ${url}`), employment_type: null, description: `${title} opportunity discovered on the official ${source.label} page. Review the opening for complete requirements.`, technology_requirements: [], canonical_url: url, apply_url: url, posted_at: dateNearText(nearbyText) });
    if (jobs.length >= 20) break;
  }
  return jobs;
}

function readablePageText(html: string) {
  return cleanText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 14000);
}

async function enrichInfoparkDetails(jobs: RawJob[]) {
  return Promise.all(jobs.slice(0, 12).map(async job => {
    try {
      const response = await fetch(job.detail_url ?? job.canonical_url, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'nishad-portfolio-job-sync/1.0' }, signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (!response.ok) return job;
      const details = readablePageText(await response.text());
      return details.length > 120 ? { ...job, description: `${job.description} Role and requirements: ${details}`.slice(0, 14000) } : job;
    } catch { return job; }
  })).then(enriched => [...enriched, ...jobs.slice(12)]);
}

async function fetchSource(source: SourceDefinition): Promise<RawJob[]> {
  const request = (timeout: number) => fetch(source.url, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'nishad-portfolio-job-sync/1.0' }, signal: AbortSignal.timeout(timeout), cache: 'no-store' });
  let response: Response;
  try {
    response = await request(8000);
  } catch (error) {
    throw new Error(`Source request timed out after 8 seconds (${error instanceof Error ? error.message : 'request aborted'}).`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 900000);
  const structured = parseJsonLd(html, source);
  const sourceSpecific = source.key === 'infopark' ? await enrichInfoparkDetails(parseInfoparkJobs(html, source)) : [];
  const discovered = source.key === 'infopark' ? sourceSpecific : [...structured, ...parseAnchors(html, source)];
  return discovered.filter((job, index, list) => list.findIndex(other => other.canonical_url === job.canonical_url) === index).slice(0, 50);
}

async function matchWithGemini(jobs: RawJob[], context: ProfileContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing; job matching was not run.');
  const baseUrl = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const input = jobs.map((job, index) => ({ index, source: job.source, title: job.title, company: job.company, locations: job.locations, work_mode: job.work_mode, employment_type: job.employment_type, description: job.description, technology_requirements: job.technology_requirements, posted_at: job.posted_at, url: job.canonical_url }));
  const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'You are a careful career coach. Match job opportunities against the candidate profile. Do not invent requirements, technologies, company facts, interview stages, or experience. Return one result for every input job in the same index order. Score 0-100 based on explicit overlap with the profile. Extract only technologies explicitly present in the job content into technology_requirements; if none are visible, return an empty list. Create a practical full interview preparation plan with separate prepare and brush_up lists. prepare should contain concrete things the candidate should prepare; brush_up should contain skills or concepts to refresh. Return expected_questions as question-and-answer pairs grounded only in the job description and explicit requirements. Each answer should explain the relevant concept and connect it to the candidate profile without inventing experience. Return programming_questions as practical coding/problem-solving question-and-answer pairs appropriate for the stated technologies; include the expected approach, important edge cases, and time/space complexity when relevant. Do not present them as confirmed company questions. Keep each list concise: 3-6 items, and keep answers useful but compact. Also return focus areas, likely_questions, preparation_steps, and risk_flags for missing or unclear requirements.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ candidate: context, jobs: input }) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { matches: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: { type: 'INTEGER' }, match_score: { type: 'INTEGER' }, match_reason: { type: 'STRING' }, technology_requirements: { type: 'ARRAY', items: { type: 'STRING' } }, interview_plan: { type: 'OBJECT', properties: { focus_areas: { type: 'ARRAY', items: { type: 'STRING' } }, prepare: { type: 'ARRAY', items: { type: 'STRING' } }, brush_up: { type: 'ARRAY', items: { type: 'STRING' } }, likely_questions: { type: 'ARRAY', items: { type: 'STRING' } }, expected_questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } }, required: ['question', 'answer'] } }, programming_questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } }, required: ['question', 'answer'] } }, preparation_steps: { type: 'ARRAY', items: { type: 'STRING' } }, risk_flags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['focus_areas', 'prepare', 'brush_up', 'likely_questions', 'expected_questions', 'programming_questions', 'preparation_steps', 'risk_flags'] } }, required: ['index', 'match_score', 'match_reason', 'technology_requirements', 'interview_plan'] } } }, required: ['matches'] } }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Gemini matching returned HTTP ${response.status}.`);
  const text = result?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) throw new Error('Gemini returned no job matching results.');
  const parsed = JSON.parse(text) as { matches?: Array<Partial<GeminiMatch> & { interview_plan?: Partial<InterviewPlan> }> };
  const asStrings = (value: unknown) => Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean).slice(0, 20) : [];
  const asQuestionAnswers = (value: unknown) => Array.isArray(value)
    ? value.map(item => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return { question: String(row.question ?? '').trim(), answer: String(row.answer ?? '').trim() };
      }).filter(item => item.question && item.answer).slice(0, 10)
    : [];
  const normalize = (item: Partial<GeminiMatch> & { interview_plan?: Partial<InterviewPlan> } | undefined, index: number): GeminiMatch => {
    const plan = (item?.interview_plan ?? {}) as Partial<InterviewPlan>;
    return {
      index,
      match_score: Math.max(0, Math.min(100, Number(item?.match_score) || 0)),
      match_reason: String(item?.match_reason ?? 'No reliable AI match explanation was returned; review this opportunity manually.').slice(0, 2000),
      technology_requirements: asStrings(item?.technology_requirements),
      interview_plan: {
        focus_areas: asStrings(plan.focus_areas),
        prepare: asStrings(plan.prepare),
        brush_up: asStrings(plan.brush_up),
        likely_questions: asStrings(plan.likely_questions),
        expected_questions: asQuestionAnswers(plan.expected_questions),
        programming_questions: asQuestionAnswers(plan.programming_questions),
        preparation_steps: asStrings(plan.preparation_steps),
        risk_flags: asStrings(plan.risk_flags)
      }
    };
  };
  const returnedByIndex = new Map<number, Partial<GeminiMatch> & { interview_plan?: Partial<InterviewPlan> }>();
  for (const item of Array.isArray(parsed.matches) ? parsed.matches : []) {
    const index = Number(item?.index);
    if (Number.isInteger(index) && index >= 0 && index < jobs.length && !returnedByIndex.has(index)) returnedByIndex.set(index, item);
  }
  if (returnedByIndex.size < jobs.length) console.warn(`Gemini returned ${returnedByIndex.size}/${jobs.length} job matches; using safe fallback values for missing items.`);
  return jobs.map((_, index) => normalize(returnedByIndex.get(index), index));
}

export async function syncJobOpportunities(filters: { workMode?: string; location?: string; technology?: string; search?: string } = {}) {
  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').limit(1).single();
  if (profileError) throw new Error(`Could not load candidate profile: ${profileError.message}`);
  const [skills, experiences, projects, resume] = await Promise.all([
    supabase.from('skills').select('name,group_name').order('sort_order'),
    supabase.from('experiences').select('company,title,location,summary,bullets').order('sort_order'),
    supabase.from('projects').select('name,description,technologies').order('sort_order'),
    supabase.from('candidate_resumes').select('original_text').order('uploaded_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  const context: ProfileContext = { profile, skills: skills.data ?? [], experiences: experiences.data ?? [], projects: projects.data ?? [], resume_text: resume.data?.original_text ?? undefined };
  const activeSources = jobSources.map(source => infoparkSourceForFilters(source, filters));
  const sourceRuns = await withConcurrency(activeSources, 8, async activeSource => {
    if (!activeSource.enabled) return { source: activeSource.label, status: 'skipped' as const, jobs: [] as RawJob[], reason: activeSource.reason };
    try {
      const jobs = await fetchSource(activeSource);
      return { source: activeSource.label, status: 'updated' as const, jobs, reason: undefined };
    } catch (error) {
      return { source: activeSource.label, status: 'failed' as const, jobs: [] as RawJob[], reason: error instanceof Error ? error.message : 'Source fetch failed.' };
    }
  });
  const results: JobSyncResult[] = sourceRuns.map(run => ({ source: run.source, status: run.status, count: run.jobs.length, reason: run.reason }));
  const rawJobs: RawJob[] = sourceRuns.flatMap(run => run.jobs);
  const requestedTechnologies = (filters.technology ?? '').split(/[,/]/).map(value => value.trim().toLowerCase()).filter(Boolean);
  const requestedSearch = (filters.search ?? '').trim().toLowerCase();
  const uniqueFetchedJobs = rawJobs.filter((job, index, list) => list.findIndex(other => other.canonical_url === job.canonical_url) === index);
  const filteredJobs = uniqueFetchedJobs.filter(job => {
    const searchableText = [...job.technology_requirements, job.title, job.description, job.company].join(' ').toLowerCase();
    const modeMatches = !filters.workMode || filters.workMode === 'all' || job.work_mode === filters.workMode;
    const locationMatches = !filters.location || [...job.locations, job.company, job.description].join(' ').toLowerCase().includes(filters.location.toLowerCase());
    const technologyMatches = requestedTechnologies.every(technology => searchableText.includes(technology));
    const searchMatches = !requestedSearch || [job.title, job.company, job.description].join(' ').toLowerCase().includes(requestedSearch);
    return modeMatches && locationMatches && technologyMatches && searchMatches;
  });
  const uniqueJobs = filteredJobs.slice(0, 20);
  const diagnostics = { fetched: rawJobs.length, available: uniqueFetchedJobs.length, excludedByFilters: uniqueFetchedJobs.length - filteredJobs.length };
  if (!uniqueJobs.length) return { results, ...diagnostics, saved: 0, jobs: [], filter: filters };
  const geminiBatchSize = 10;
  const geminiBatches = Array.from({ length: Math.ceil(uniqueJobs.length / geminiBatchSize) }, (_, batchIndex) => uniqueJobs.slice(batchIndex * geminiBatchSize, (batchIndex + 1) * geminiBatchSize));
  const batchMatches = await withConcurrency(geminiBatches, 2, batch => matchWithGemini(batch, context));
  const matches: GeminiMatch[] = batchMatches.flat();
  const { data: existing } = await supabase.from('job_opportunities').select('source,source_job_id,status').in('source', [...new Set(uniqueJobs.map(job => job.source))]);
  const statusByKey = new Map((existing ?? []).map(row => [`${row.source}:${row.source_job_id}`, row.status]));
  const now = new Date().toISOString();
  const rows = uniqueJobs.map((job, index) => {
    const match = matches[index];
    const storedJob = { ...job };
    delete storedJob.detail_url;
    return { ...storedJob, technology_requirements: Array.isArray(match.technology_requirements) ? match.technology_requirements.map(item => String(item).trim()).filter(Boolean).slice(0, 20) : [], match_score: Math.max(0, Math.min(100, Number(match.match_score) || 0)), match_reason: String(match.match_reason ?? '').slice(0, 2000), interview_plan: match.interview_plan, status: statusByKey.get(`${job.source}:${job.source_job_id}`) ?? 'new', fetched_at: now };
  });
  const { data: savedJobs, error: saveError } = await supabase.from('job_opportunities').upsert(rows, { onConflict: 'source,source_job_id' }).select('*');
  if (saveError) throw new Error(`Could not save job opportunities: ${saveError.message}`);
  return { results, ...diagnostics, saved: rows.length, jobs: savedJobs ?? [], filter: filters };
}