import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const allowedTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'resume';
}

export async function GET() {
  const { supabase, isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  const { data, error } = await supabase
    .from('candidate_resumes')
    .select('id,file_name,mime_type,uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ resume: data ?? null });
}

export async function POST(request: Request) {
  const { isAdmin, adminError } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: adminError?.message ?? 'Admin authentication required.' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('resume');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF, DOCX, or TXT resume.' }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Only PDF, DOCX, or TXT resume files are supported.' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Resume must be 10 MB or smaller.' }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const originalText = file.type === 'text/plain' ? bytes.toString('utf8').slice(0, 100000) : '';
    const storagePath = `admin/${Date.now()}-${safeFileName(file.name)}`;
    const service = createServiceClient();
    const upload = await service.storage.from('candidate-resumes').upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw new Error(`Resume storage failed: ${upload.error.message}`);

    const { data, error } = await service
      .from('candidate_resumes')
      .insert({ file_name: file.name, storage_path: storagePath, mime_type: file.type, original_text: originalText })
      .select('id,file_name,mime_type,uploaded_at')
      .single();
    if (error) {
      await service.storage.from('candidate-resumes').remove([storagePath]);
      throw new Error(`Resume record could not be saved: ${error.message}`);
    }
    return NextResponse.json({ ok: true, resume: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Resume upload failed.' }, { status: 500 });
  }
}