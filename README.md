# Nishad K S — Modern Portfolio

A dark glass, iOS-inspired portfolio built with Next.js, TypeScript, Framer Motion, and Supabase.

## Included

- Responsive public portfolio seeded from the supplied resume
- Animated hero, glass cards, timeline, skills, projects, education, and contact form
- Supabase Auth admin login
- Supabase Postgres content tables with row-level security
- Admin workspace for profile updates, inbox management, project videos, and tools/features content
- Separate `/tools` route with one block per technology and admin-managed feature notes
- Redux Toolkit global theme state with five built-in themes and custom wallpaper modes
- Authenticated admin copilot chat that proposes and confirms updates across portfolio modules
- Gemini-powered authenticated admin copilot with server-only credentials
- AG-UI-compatible architecture ready for an SSE/CopilotKit adapter
- Redux assistant history persisted only in the current browser session and cleared on logout
- Weekly official release sync for all current tools, retaining the latest 10 records per tool
- Safe fallback behavior: failed source requests leave the last successful Supabase feature data untouched
- Vercel Cron schedule configured for Monday 09:00 IST
- Gemini normalization converts raw release notes into short readable feature cards while preserving official links and release metadata
- Admin wallpaper uploads with activation, deletion, and Supabase Storage persistence
- Supabase Storage video showcase with admin-only upload/delete
- Node-powered Next.js route handlers for public data, contact submissions, and admin saves

## Run locally

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
3. In Supabase Authentication, create an admin user with email/password.
4. Copy that user UUID into `supabase.admins`:

```sql
insert into public.admins (user_id) values ('YOUR_AUTH_USER_UUID');
```

5. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key.
6. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the site and `/admin/login` for the admin portal.

## Deploy to Vercel

Import the repository, add the three environment variables from `.env.example`, and deploy. The Supabase project remains the database and authentication provider.

## Notes

The starter seed uses the resume details supplied in the prompt. Replace the placeholder LinkedIn and GitHub URLs in the admin profile editor before publishing. For production, add rate limiting or CAPTCHA to the public contact endpoint if it becomes a target for spam.
# portfolio
