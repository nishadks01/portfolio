import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPortfolioData } from '@/lib/portfolio-data';
import { requireAdmin } from '@/lib/supabase/server';

const sections = ['profile', 'skills', 'experiences', 'projects', 'education', 'tools', 'tool_features', 'wallpapers', 'project_videos'] as const;
const tableBySection: Record<(typeof sections)[number], string> = {
  profile: 'profiles', skills: 'skills', experiences: 'experiences', projects: 'projects', education: 'education',
  tools: 'tools', tool_features: 'tool_features', wallpapers: 'wallpapers', project_videos: 'project_videos'
};
const fieldsBySection: Record<(typeof sections)[number], string[]> = {
  profile: ['full_name', 'role', 'headline', 'bio', 'location', 'email', 'phone', 'resume_url', 'github_url', 'linkedin_url', 'available_for_work'],
  skills: ['name', 'group_name', 'sort_order'],
  experiences: ['company', 'title', 'location', 'start_date', 'end_date', 'summary', 'bullets', 'sort_order'],
  projects: ['name', 'client', 'role', 'description', 'responsibilities', 'technologies', 'url', 'featured', 'sort_order'],
  education: ['degree', 'institution', 'year', 'sort_order'],
  tools: ['name', 'slug', 'description', 'icon', 'website_url', 'active', 'sort_order'],
  tool_features: ['tool_id', 'title', 'summary', 'details', 'version', 'release_date', 'source_url', 'sort_order'],
  wallpapers: ['name', 'public_url', 'active', 'sort_order'],
  project_videos: ['project_id', 'title', 'description', 'public_url', 'sort_order']
};

const changeSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  section: z.enum(sections),
  id: z.string().nullable().optional(),
  fields: z.record(z.string(), z.unknown()).default({})
});
const pendingSchema = z.object({ summary: z.string().min(1).max(600), changes: z.array(changeSchema).min(1).max(20) });
const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(12000) })).max(40).default([]),
  confirmation: pendingSchema.optional()
});

type Change = z.infer<typeof changeSchema>;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function sanitizeFields(section: Change['section'], fields: Record<string, unknown>) {
  const allowed = new Set(fieldsBySection[section]);
  return Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.has(key)));
}

function decodeGeminiFields(section: Change['section'], rawFields: unknown) {
  if (!Array.isArray(rawFields)) return typeof rawFields === 'object' && rawFields !== null ? rawFields as Record<string, unknown> : {};
  const booleanFields = new Set(['available_for_work', 'featured', 'active']);
  const numberFields = new Set(['sort_order']);
  const arrayFields = new Set(['bullets', 'responsibilities', 'technologies']);
  const fields: Record<string, unknown> = {};
  for (const item of rawFields) {
    if (!item || typeof item !== 'object') continue;
    const key = String((item as { key?: unknown }).key ?? '');
    const rawValue = String((item as { value?: unknown }).value ?? '');
    if (!fieldsBySection[section].includes(key)) continue;
    if (rawValue === '' || rawValue.toLowerCase() === 'null') fields[key] = null;
    else if (booleanFields.has(key)) fields[key] = rawValue.toLowerCase() === 'true';
    else if (numberFields.has(key)) fields[key] = Number(rawValue) || 0;
    else if (arrayFields.has(key)) {
      try { fields[key] = JSON.parse(rawValue); }
      catch { fields[key] = rawValue.split('\\n').map(value => value.trim()).filter(Boolean); }
    } else fields[key] = rawValue;
  }
  return fields;
}

function normalizeGeminiProposal(raw: unknown) {
  const proposal = raw as { summary?: unknown; changes?: Array<{ operation?: unknown; section?: unknown; id?: unknown; fields?: unknown }> };
  return {
    summary: String(proposal.summary ?? 'Requested portfolio changes'),
    changes: (proposal.changes ?? []).map(change => ({
      operation: change.operation,
      section: change.section,
      id: change.id === '' ? null : change.id ?? null,
      fields: decodeGeminiFields(change.section as Change['section'], change.fields)
    }))
  };
}

async function applyChanges(supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'], changes: Change[]) {
  const results: string[] = [];
  for (const change of changes) {
    const table = tableBySection[change.section];
    const fields = sanitizeFields(change.section, change.fields);
    if (change.operation === 'create') {
      if (change.section === 'profile') throw new Error('The profile already exists; update it instead.');
      const { error } = await supabase.from(table).insert(fields);
      if (error) throw new Error(`${change.section}: ${error.message}`);
      results.push(`created ${change.section}`);
      continue;
    }

    let id = change.id ?? null;
    if (change.section === 'profile' && !id) {
      const { data } = await supabase.from(table).select('id').limit(1).maybeSingle();
      id = data?.id ?? null;
    }
    if (!id) throw new Error(`A record id is required to ${change.operation} ${change.section}.`);

    let storagePath: string | null = null;
    if (change.operation === 'delete' && (change.section === 'wallpapers' || change.section === 'project_videos')) {
      const { data, error } = await supabase.from(table).select('storage_path').eq('id', id).maybeSingle();
      if (error) throw new Error(`${change.section}: ${error.message}`);
      storagePath = data?.storage_path ?? null;
    }

    const query = change.operation === 'delete'
      ? supabase.from(table).delete().eq('id', id)
      : supabase.from(table).update(fields).eq('id', id);
    const { error } = await query;
    if (error) throw new Error(`${change.section}: ${error.message}`);

    if (change.operation === 'delete' && storagePath) {
      const bucket = change.section === 'wallpapers' ? 'wallpapers' : 'project-videos';
      await supabase.storage.from(bucket).remove([storagePath]);
    }
    results.push(`${change.operation === 'delete' ? 'deleted' : 'updated'} ${change.section}`);
  }
  return results;
}

function buildSystemPrompt(portfolio: unknown) {
  return `You are the private admin copilot for a developer portfolio. The signed-in user is already authenticated as an admin. Never ask for, repeat, or store a password or API key. Answer questions from the portfolio context below. You may propose database changes only when the user clearly asks to create, update, or delete something. Always use the propose_portfolio_changes function for mutations; do not claim a change was saved before the user confirms it. Prefer small, precise changes. For updates and deletes, use the exact record id from the context. Do not invent ids. For file uploads, explain that the existing Videos or Wallpapers admin uploader is required. Portfolio context: ${JSON.stringify(portfolio)}`;
}

function geminiContents(messages: ChatMessage[]) {
  const conversation = messages.filter((message, index) => !(index === 0 && message.role === 'assistant'));
  return conversation.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
}

async function callGemini(messages: ChatMessage[], portfolio: unknown) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing. Add your server-only Gemini key to .env.local.');
  const baseUrl = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(portfolio) }] },
      contents: geminiContents(messages),
      tools: [{ functionDeclarations: [{
        name: 'propose_portfolio_changes',
        description: 'Prepare one or more portfolio database changes for admin confirmation. Do not execute them.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summary: { type: 'STRING', description: 'Short human-readable summary of the proposed changes.' },
            changes: { type: 'ARRAY', minItems: 1, maxItems: 20, items: {
              type: 'OBJECT',
              properties: {
                operation: { type: 'STRING', enum: ['create', 'update', 'delete'] },
                section: { type: 'STRING', enum: sections },
                id: { type: 'STRING', description: 'Existing record id. Use an empty string for create operations.' },
                fields: { type: 'ARRAY', description: 'Fields to write as string key/value pairs. Arrays must be JSON strings.', items: {
                  type: 'OBJECT',
                  properties: {
                    key: { type: 'STRING' },
                    value: { type: 'STRING' }
                  },
                  required: ['key', 'value']
                } }
              }, required: ['operation', 'section', 'id', 'fields']
            } }
          }, required: ['summary', 'changes']
        }
      }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Gemini returned HTTP ${response.status}.`);
  const parts = result?.candidates?.[0]?.content?.parts ?? [];
  const functionPart = parts.find((part: { functionCall?: unknown }) => part.functionCall);
  const text = parts.filter((part: { text?: string }) => part.text).map((part: { text: string }) => part.text).join('');
  return { text, functionCall: functionPart?.functionCall as { name?: string; args?: unknown } | undefined };
}

export async function POST(request: Request) {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid assistant request.' }, { status: 400 });

  try {
    if (parsed.data.confirmation) {
      const results = await applyChanges(supabase, parsed.data.confirmation.changes);
      return NextResponse.json({ reply: `Done. ${results.join(', ')}.`, applied: true });
    }

    const portfolio = await getPortfolioData();
    const response = await callGemini(parsed.data.messages, portfolio);
    if (response.functionCall?.name === 'propose_portfolio_changes') {
      const pending = pendingSchema.parse(normalizeGeminiProposal(response.functionCall.args));
      return NextResponse.json({ reply: `I prepared this change for your confirmation:\n\n${pending.summary}`, pendingAction: pending });
    }
    return NextResponse.json({ reply: response.text || 'I could not generate a response.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Assistant request failed.' }, { status: 500 });
  }
}
