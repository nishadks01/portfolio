import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

function cleanEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function extractCompanyEmails(html: string) {
  const emails = new Set<string>();
  for (const match of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(cleanEmail(decodeURIComponent(match[1])));
  for (const match of html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) emails.add(cleanEmail(match[0]));
  return [...emails].filter(email => email && !/(example\.com|noreply|no-reply|donotreply|test@)/i.test(email));
}

async function discoverCompanyEmail(job: { canonical_url: string; apply_url: string | null; description: string }) {
  const urls = [...new Set([job.canonical_url, job.apply_url].filter((url): url is string => Boolean(url)))];
  const responses = await Promise.all(urls.map(async url => {
    try {
      const response = await fetch(url, { headers: { Accept: 'text/html', 'User-Agent': 'nishad-portfolio-application/1.0' }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      return response.ok ? await response.text() : '';
    } catch { return ''; }
  }));
  const emails = responses.flatMap(extractCompanyEmails);
  const ranked = [...new Set(emails)].sort((a, b) => {
    const rank = (email: string) => /(career|recruit|hiring|hr|jobs|talent|people)/i.test(email) ? 0 : 1;
    return rank(a) - rank(b);
  });
  return ranked[0] ?? '';
}

function buildTransport() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) throw new Error('GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD are missing. Add them as server-only environment variables.');
  return { user, transport: nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } }) };
}

async function generateCoverLetter(job: { title: string; company: string; description: string; technology_requirements: string[] }, profile: Record<string, unknown>, skills: Array<Record<string, unknown>>, experiences: Array<Record<string, unknown>>, projects: Array<Record<string, unknown>>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing; cover-letter generation is unavailable.');
  const baseUrl = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Write a concise, truthful job-application cover letter. Never invent experience, metrics, employers, qualifications, or technologies. Use only the candidate profile, skills, experience, projects, and explicit job description. Address the hiring team generically. Do not include a subject line, markdown, placeholders, or claims that the candidate has already applied. Return only the letter body.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ job, candidate: { profile, skills, experiences, projects } }) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { cover_letter: { type: 'STRING' } }, required: ['cover_letter'] } }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Cover-letter generation returned HTTP ${response.status}.`);
  const text = result?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) throw new Error('Gemini returned no cover letter.');
  const parsed = JSON.parse(text) as { cover_letter?: string };
  if (!parsed.cover_letter?.trim()) throw new Error('Gemini returned an empty cover letter.');
  return parsed.cover_letter.trim().slice(0, 12000);
}

async function loadJobAndProfile(id: string) {
  const service = createServiceClient();
  const [jobResult, profileResult, skillsResult, experiencesResult, projectsResult, resumeResult] = await Promise.all([
    service.from('job_opportunities').select('*').eq('id', id).single(),
    service.from('profiles').select('*').limit(1).single(),
    service.from('skills').select('name,group_name').order('sort_order'),
    service.from('experiences').select('company,title,location,start_date,end_date,summary,bullets').order('sort_order'),
    service.from('projects').select('name,role,description,responsibilities,technologies').order('sort_order'),
    service.from('candidate_resumes').select('file_name,storage_path,mime_type,uploaded_at').order('uploaded_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (jobResult.error || !jobResult.data) throw new Error(jobResult.error?.message ?? 'Job opportunity was not found.');
  if (profileResult.error || !profileResult.data) throw new Error(profileResult.error?.message ?? 'Candidate profile was not found.');
  if (resumeResult.error || !resumeResult.data) throw new Error('Upload a latest resume before sending an application email.');
  return { service, job: jobResult.data, profile: profileResult.data, skills: skillsResult.data ?? [], experiences: experiencesResult.data ?? [], projects: projectsResult.data ?? [], resume: resumeResult.data };
}

export async function GET() {
  return NextResponse.json({ error: 'This application endpoint accepts POST requests from the Apply by email button.' }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: string; recipient?: string; coverLetter?: string; subject?: string; confirmed?: boolean };
  try {
    const loaded = await loadJobAndProfile(id);
    const { job, profile, skills, experiences, projects, resume, service } = loaded;
    if (body.action === 'prepare') {
      const discoveredRecipient = await discoverCompanyEmail(job);
      const coverLetter = await generateCoverLetter(job, profile, skills, experiences, projects);
      const recipient = cleanEmail(body.recipient) || discoveredRecipient;
      return NextResponse.json({ ok: true, draft: { recipient, subject: `Application for ${job.title} — ${profile.full_name}`, coverLetter, attachmentName: resume.file_name, originalMimeType: resume.mime_type, jobId: job.id, sourceUrl: job.canonical_url, recipientDiscovered: Boolean(discoveredRecipient) } });
    }
    if (body.action !== 'send' || body.confirmed !== true) return NextResponse.json({ error: 'Use prepare first, then confirm the exact recipient and message before sending.' }, { status: 400 });
    const recipient = cleanEmail(body.recipient);
    const coverLetter = String(body.coverLetter ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    if (!recipient) return NextResponse.json({ error: 'Enter a valid email address. The app does not verify or guess manual recipients.' }, { status: 400 });
    if (!coverLetter || coverLetter.length > 12000 || !subject || subject.length > 200) return NextResponse.json({ error: 'A valid reviewed subject and cover letter are required.' }, { status: 400 });
    if (job.status === 'applied') return NextResponse.json({ error: 'This job is already marked Applied.' }, { status: 409 });
    const { user, transport } = buildTransport();
    const download = await service.storage.from('candidate-resumes').download(resume.storage_path);
    if (download.error || !download.data) throw new Error(`Original resume could not be loaded: ${download.error?.message ?? 'file missing'}`);
    const attachment = { filename: resume.file_name, content: Buffer.from(await download.data.arrayBuffer()), contentType: resume.mime_type };
    await transport.sendMail({ from: user, to: recipient, subject, text: coverLetter, attachments: [attachment] });
    const { data: updatedJob, error: updateError } = await service.from('job_opportunities').update({ status: 'applied' }).eq('id', job.id).select('*').single();
    if (updateError) throw new Error(`Email sent, but Applied status could not be saved: ${updateError.message}`);
    const { error: applicationError } = await service.from('job_applications').upsert({ job_id: job.id, recipient, subject, status: 'applied', sent_at: new Date().toISOString(), last_checked_at: null, reply_count: 0, latest_reply_at: null, latest_reply_from: null, latest_reply_subject: null, latest_reply_snippet: null, gmail_thread_id: null, updated_at: new Date().toISOString() }, { onConflict: 'job_id' });
    if (applicationError) throw new Error(`Email sent and job marked Applied, but application tracking could not be saved: ${applicationError.message}`);
    return NextResponse.json({ ok: true, sent: true, job: updatedJob });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Application email failed.' }, { status: 500 });
  }
}
