import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(1).max(200)
});

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing on the server.');
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid username and password.' }, { status: 400 });

  try {
    const serviceClient = createServiceClient();
    const { data: admin, error: lookupError } = await serviceClient
      .from('admins')
      .select('user_id')
      .eq('username', parsed.data.username)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!admin) return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });

    const { data: authUser, error: userError } = await serviceClient.auth.admin.getUserById(admin.user_id);
    if (userError || !authUser.user?.email) return NextResponse.json({ error: 'The admin account is not configured correctly.' }, { status: 500 });

    const authClient = await createClient();
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: authUser.user.email,
      password: parsed.data.password
    });

    if (signInError) {
      if (signInError.message.toLowerCase().includes('email not confirmed')) {
        return NextResponse.json({ error: 'The underlying Supabase user email is not confirmed.' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to sign in.' }, { status: 500 });
  }
}
