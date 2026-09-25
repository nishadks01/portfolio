import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({ name: z.string().min(2).max(100), email: z.string().email(), message: z.string().min(10).max(5000) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please enter a valid message.' }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from('contact_messages').insert(parsed.data);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
