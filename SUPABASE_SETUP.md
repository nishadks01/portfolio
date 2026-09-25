# Supabase setup for the portfolio

This project uses Supabase for PostgreSQL, authentication, row-level security, and the admin inbox.

## 1. Create the Supabase project

1. Open https://supabase.com/dashboard.
2. Create a new project.
3. Choose a project name, database password, and region.
4. Wait for the project to finish provisioning.

## 2. Run the database schema

In the Supabase dashboard:

1. Open **SQL Editor**.
2. Create a new query.
3. Copy and run the full contents of `supabase/schema.sql`.
4. Create a second query.
5. Copy and run the full contents of `supabase/seed.sql`.

The seed inserts the resume content supplied for the portfolio. The schema also creates the `project_videos` table and a public `project-videos` Storage bucket. Only users listed in `public.admins` can upload or delete files; visitors can stream published videos. It also creates `tools` and `tool_features` tables for the separate `/tools` showcase route. The seed adds initial React, Next.js, Node.js, TypeScript, Supabase, and Tailwind CSS blocks; feature notes are managed from the admin panel. The schema creates a public `wallpapers` Storage bucket and metadata table for the Redux-powered background theme switcher.

## Weekly tool feature sync

The project includes `/api/cron/tool-features`, which reads official GitHub release APIs for the current tools and the official Node.js release index. It keeps the latest 10 stable release notes per tool. Vercel runs it every Monday at 09:00 IST using `vercel.json` (`30 3 * * 1` in UTC).

Set `CRON_SECRET` in Vercel and the project environment. After fetching, Gemini rewrites the raw release notes into short readable titles, summaries, and details while preserving the official version, date, and more-details URL. If the source or Gemini normalization fails, that tool's existing `tool_features` rows are left unchanged, so the public `/tools` page continues to show the last successful data. Set `GEMINI_API_KEY` in the server environment for this step.

If your database was already configured before the video feature was added, rerun the updated `supabase/schema.sql` so the table, bucket, and policies are created.

## 3. Create your admin login

1. Open **Authentication → Users**.
2. Click **Add user**.
3. Create an email/password user for yourself. The email is used internally by Supabase and will not appear on the login screen.
4. Copy the user UUID.
5. In SQL Editor, run this, replacing the UUID and username:

```sql
insert into public.admins (user_id, username)
values ('PASTE_YOUR_AUTH_USER_UUID_HERE', 'nishad')
on conflict (user_id) do update set username = excluded.username;
```

You will sign in at `/admin/login` with `nishad` and the password you created for the Supabase Auth user.

Do not put a password in the database or in the code repository.

## 4. Add local environment variables

In the Supabase dashboard, open **Project Settings → API** and copy:

- Project URL
- Publishable/anon key
- Service role key (server-only; never expose it in the browser)

In the portfolio folder:

```bash
cp .env.example .env.local
```

Then update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is used only by `/api/admin/login` to map the username to the internal Supabase Auth email. Never commit `.env.local` or expose this key in a `NEXT_PUBLIC_*` variable.

## 5. Start the portfolio

From the project folder:

```bash
npm install
npm run dev
```

Open:

- Public site: http://localhost:3000
- Admin login: http://localhost:3000/admin/login

Sign in with the Supabase user created in step 3.

## 6. Deploy to Vercel

1. Push the project to GitHub, or import the source ZIP into a repository.
2. Import the repository into Vercel.
3. Add the same three environment variables in Vercel Project Settings → Environment Variables.
4. Deploy.
5. Update `NEXT_PUBLIC_SITE_URL` to the production URL and redeploy if needed.

## Troubleshooting

### `Unable to load portfolio data`

Check that:

- `.env.local` exists in the project root.
- The Supabase URL and anon key are correct.
- Both `schema.sql` and `seed.sql` ran successfully.

### Admin login works but `/admin` redirects back to login

The authenticated user must be listed in `public.admins`:

```sql
select * from public.admins;
```

If it is missing, insert the Auth user UUID as shown above.

### Contact form fails

Check that the `contact_messages` table exists and that the public insert policy from `schema.sql` is present.

### Security note

The public portfolio can read portfolio tables, and anonymous visitors can insert contact messages. Only users listed in `public.admins` can update content or read the inbox.
