import { createServiceClient } from '@/lib/supabase/service';

type ToolRecord = { id: string; name: string; slug: string };
type FeatureInsert = { tool_id: string; title: string; summary: string; details: string | null; version: string | null; release_date: string | null; source_url: string | null; sort_order: number };
type SyncResult = { tool: string; status: 'updated' | 'failed' | 'skipped'; count: number; error?: string };

type GithubRelease = { tag_name?: string; name?: string; body?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean };

const githubRepositories: Record<string, string> = {
  react: 'facebook/react',
  nextjs: 'vercel/next.js',
  nodejs: 'nodejs/node',
  typescript: 'microsoft/TypeScript',
  supabase: 'supabase/supabase',
  'tailwind-css': 'tailwindlabs/tailwindcss'
};

function cleanText(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? '').replace(/\r/g, '').replace(/[#*_>`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nishad-portfolio-tool-sync' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

async function fetchGithubFeatures(tool: ToolRecord): Promise<FeatureInsert[]> {
  const repository = githubRepositories[tool.slug];
  if (!repository) throw new Error(`No official release source configured for ${tool.slug}.`);
  const releases = await fetchJson<GithubRelease[]>(`https://api.github.com/repos/${repository}/releases?per_page=20`);
  return releases.filter(release => !release.draft && !release.prerelease).slice(0, 10).map((release, index) => {
    const title = cleanText(release.name, release.tag_name ?? `${tool.name} release`);
    const body = cleanText(release.body, `${tool.name} ${release.tag_name ?? 'latest'} release notes.`);
    return { tool_id: tool.id, title, summary: body.split('\n')[0].slice(0, 500), details: body.slice(0, 8000), version: release.tag_name ?? null, release_date: release.published_at ? release.published_at.slice(0, 10) : null, source_url: release.html_url ?? `https://github.com/${repository}/releases`, sort_order: index + 1 };
  });
}

async function fetchNodeFeatures(tool: ToolRecord): Promise<FeatureInsert[]> {
  const releases = await fetchJson<Array<{ version?: string; date?: string; lts?: string | boolean | false }>>('https://nodejs.org/dist/index.json');
  return releases.filter(release => Boolean(release.version) && Boolean(release.date)).slice(0, 10).map((release, index) => {
    const version = release.version as string;
    const sourceUrl = `https://nodejs.org/en/blog/release/${version}`;
    return { tool_id: tool.id, title: `Node.js ${version}`, summary: `Official Node.js ${version} release${release.lts ? ` (${String(release.lts)} LTS)` : ''}.`, details: `Review the official Node.js release notes and download information for ${version}.`, version, release_date: release.date ?? null, source_url: sourceUrl, sort_order: index + 1 };
  });
}

async function normalizeWithGemini(tool: ToolRecord, rawFeatures: FeatureInsert[]): Promise<FeatureInsert[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing; previous feature data was kept.');
  const baseUrl = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const input = rawFeatures.map((feature, index) => ({ index, version: feature.version, release_date: feature.release_date, title: feature.title, release_notes: feature.details }));
  const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `You simplify official ${tool.name} release notes for a public developer portfolio. Return exactly one item for every input item, preserving the same index order. Do not invent features or claims. Write plain, readable English for a developer audience. Make each title short (maximum 80 characters), summary one clear sentence (maximum 220 characters), and details 2-4 short bullet lines beginning with •. Do not include markdown headings, version numbers, dates, or links in the rewritten text because those are displayed separately.` }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { features: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: { type: 'INTEGER' }, title: { type: 'STRING' }, summary: { type: 'STRING' }, details: { type: 'STRING' } }, required: ['index', 'title', 'summary', 'details'] } } },
          required: ['features']
        }
      }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Gemini normalization returned HTTP ${response.status}.`);
  const text = result?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) throw new Error('Gemini returned no normalized feature data.');
  let parsed: { features?: Array<{ index?: number; title?: string; summary?: string; details?: string }> };
  try { parsed = JSON.parse(text); } catch { throw new Error('Gemini returned invalid normalized feature JSON.'); }
  if (!Array.isArray(parsed.features) || parsed.features.length !== rawFeatures.length) throw new Error('Gemini returned an incomplete normalized feature list.');
  const normalized = [...parsed.features].sort((a, b) => Number(a.index) - Number(b.index));
  if (normalized.some((feature, index) => Number(feature.index) !== index || !feature.title || !feature.summary || !feature.details)) throw new Error('Gemini returned invalid normalized feature fields.');
  return rawFeatures.map((feature, index) => ({ ...feature, title: normalized[index].title!.trim(), summary: normalized[index].summary!.trim(), details: normalized[index].details!.trim() }));
}

async function fetchFeatures(tool: ToolRecord) {
  const rawFeatures = tool.slug === 'nodejs' ? await fetchNodeFeatures(tool) : await fetchGithubFeatures(tool);
  return normalizeWithGemini(tool, rawFeatures);
}

export async function syncToolFeatures() {
  const supabase = createServiceClient();
  const { data: tools, error: toolsError } = await supabase.from('tools').select('id,name,slug').order('sort_order');
  if (toolsError) throw new Error(`Could not load tools: ${toolsError.message}`);

  const results: SyncResult[] = [];
  for (const tool of (tools ?? []) as ToolRecord[]) {
    try {
      const features = await fetchFeatures(tool);
      if (!features.length) throw new Error('The source returned no stable releases.');
      const { data: existing, error: existingError } = await supabase.from('tool_features').select('id').eq('tool_id', tool.id);
      if (existingError) throw new Error(`Could not read existing records: ${existingError.message}`);
      const { error: insertError } = await supabase.from('tool_features').insert(features);
      if (insertError) throw new Error(`Could not save new records: ${insertError.message}`);
      const oldIds = (existing ?? []).map(row => row.id).filter(Boolean);
      if (oldIds.length) {
        const { error: cleanupError } = await supabase.from('tool_features').delete().in('id', oldIds);
        if (cleanupError) throw new Error(`New records saved, but old records could not be cleaned up: ${cleanupError.message}`);
      }
      results.push({ tool: tool.name, status: 'updated', count: features.length });
    } catch (error) {
      results.push({ tool: tool.name, status: 'failed', count: 0, error: error instanceof Error ? error.message : 'Unknown source error.' });
    }
  }
  return results;
}
