import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const gmailBase = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name?: string; value?: string };
type GmailMessage = { id: string; threadId?: string; internalDate?: string; snippet?: string; payload?: { headers?: GmailHeader[] } };
type GmailThread = { id: string; messages?: GmailMessage[] };

type ApplicationRow = {
  id: string;
  job_id: string;
  recipient: string;
  subject: string;
  status: string;
  sent_at: string;
  reply_count: number;
  job?: { title?: string; company?: string } | null;
};

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? '';
}

function addressFrom(value: string) {
  return value.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? value.trim().toLowerCase();
}

async function getAccessToken() {
  const directToken = process.env.GMAIL_ACCESS_TOKEN?.trim();
  if (directToken) return directToken;
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail reply monitoring is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN as server-only variables.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(result.error_description ?? 'Gmail OAuth token refresh failed.');
  return String(result.access_token);
}

async function gmail<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${gmailBase}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? `Gmail API returned HTTP ${response.status}.`);
  return result as T;
}

export async function POST() {
  const { isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  try {
    const token = await getAccessToken();
    const service = createServiceClient();
    const { data: applications, error } = await service.from('job_applications').select('id,job_id,recipient,subject,status,sent_at,reply_count,job:job_opportunities(title,company)').order('sent_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    const sender = addressFrom(process.env.GMAIL_SMTP_USER ?? '');
    if (!sender) throw new Error('GMAIL_SMTP_USER is required so Gmail sync can distinguish your sent messages from company replies.');
    let checked = 0;
    let replies = 0;
    const updated: Array<{ id: string; company: string; replyCount: number }> = [];

    for (const application of (applications ?? []) as unknown as ApplicationRow[]) {
      checked += 1;
      const after = Math.floor(new Date(application.sent_at).getTime() / 1000);
      const subject = application.subject.replace(/[{}]/g, ' ').replace(/"/g, '');
      const query = `after:${after} subject:"${subject.slice(0, 140)}"`;
      const search = await gmail<{ threads?: Array<{ id: string }> }>(`/threads?maxResults=20&q=${encodeURIComponent(query)}`, token);
      const threadIds = search.threads?.map(item => item.id) ?? [];
      const externalMessages: Array<{ message: GmailMessage; from: string; subject: string }> = [];
      for (const threadId of threadIds) {
        const thread = await gmail<GmailThread>(`/threads/${encodeURIComponent(threadId)}?format=full`, token);
        for (const message of thread.messages ?? []) {
          const from = addressFrom(header(message, 'From'));
          const timestamp = Number(message.internalDate ?? 0);
          if (from && from !== sender && timestamp >= new Date(application.sent_at).getTime()) externalMessages.push({ message, from, subject: header(message, 'Subject') || application.subject });
        }
      }
      if (!externalMessages.length) {
        await service.from('job_applications').update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', application.id);
        continue;
      }
      externalMessages.sort((a, b) => Number(b.message.internalDate ?? 0) - Number(a.message.internalDate ?? 0));
      const latest = externalMessages[0];
      const latestAt = new Date(Number(latest.message.internalDate ?? Date.now())).toISOString();
      const nextStatus = application.status === 'applied' || application.status === 'in_progress' ? 'reply_received' : application.status;
      const update = { status: nextStatus, last_checked_at: new Date().toISOString(), reply_count: externalMessages.length, latest_reply_at: latestAt, latest_reply_from: latest.from, latest_reply_subject: latest.subject, latest_reply_snippet: (latest.message.snippet ?? '').slice(0, 1000), gmail_thread_id: latest.message.threadId ?? null, updated_at: new Date().toISOString() };
      const { error: updateError } = await service.from('job_applications').update(update).eq('id', application.id);
      if (updateError) throw new Error(`Could not update ${application.job?.company ?? 'application'}: ${updateError.message}`);
      replies += externalMessages.length;
      updated.push({ id: application.id, company: application.job?.company ?? 'Unknown company', replyCount: externalMessages.length });
    }
    return NextResponse.json({ ok: true, checked, replies, updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gmail reply sync failed.' }, { status: 500 });
  }
}
