Supabase setup for the portfolio
This project uses Supabase for PostgreSQL, authentication, row-level security, and the admin inbox.

1. Create the Supabase project
Open https://supabase.com/dashboard.
Create a new project.
Choose a project name, database password, and region.
Wait for the project to finish provisioning.
2. Run the database schema
In the Supabase dashboard:

Open SQL Editor.
Create a new query.
Copy and run the full contents of supabase/schema.sql.
Create a second query.
Copy and run the full contents of supabase/seed.sql.
The seed inserts the resume content supplied for the portfolio. The schema also creates the project_videos table and a public project-videos Storage bucket. Only users listed in public.admins can upload or delete files; visitors can stream published videos. It also creates tools and tool_features tables for the separate /tools showcase route. The seed adds initial React, Next.js, Node.js, TypeScript, Supabase, and Tailwind CSS blocks; feature notes are managed from the admin panel. The schema creates a public wallpapers Storage bucket and metadata table for the Redux-powered background theme switcher. It also creates the admin-only job_opportunities table for public job-source sync, Gemini match scores, posted dates, technology requirements, and interview preparation plans. The Jobs module shows all stored opportunities; there is no posted-date freshness filter. It can be synced with optional work-mode, location, and comma- or slash-separated technology query filters, for example /api/admin/job-opportunities?workMode=remote&location=Kochi&technology=React,Next.js,Node. For Infopark, a location such as Infopark Kochi Phase 1 uses https://infopark.in/companies-job/infopark-kochi-phase-1 only as a discovery/search page, and technology terms are also sent through Infopark's search query parameter before local resume/skill matching. Saved job cards never use the discovery page as the opening link; they use the canonical format https://infopark.in/jobs/{company-slug}/{job-title-slug} and fetch the detailed requirements from the legacy detail endpoint internally. The admin Jobs block also stores one private resume, generates an ATS-friendly plain-text version with Gemini, uses it during future matching, and supports viewed/applied status tracking so repeated syncs preserve the existing status. Each job has an Apply by email action that checks the official job page for a visible company email, generates a truthful Gemini cover letter, attaches the latest ATS resume, and opens a final review screen. Sending requires explicit confirmation, uses server-only Gmail SMTP App Password settings, and marks the job Applied only after SMTP accepts the message; the app never guesses an email address.

The Jobs module uses public career pages where permitted. LinkedIn, Naukri, Indeed, and restricted employer search pages remain disabled unless an approved API/feed is configured; it does not bypass login, anti-bot controls, or application workflows.

Weekly tool feature sync
The project includes /api/cron/tool-features, which reads official GitHub release APIs for the current tools and the official Node.js release index. It keeps the latest 10 stable release notes per tool. Vercel runs it every Monday at 09:00 IST using vercel.json (30 3 * * 1 in UTC).

Set CRON_SECRET in Vercel and the project environment. After fetching, Gemini rewrites the raw release notes into short readable titles, summaries, and details while preserving the official version, date, and more-details URL. If the source or Gemini normalization fails, that tool's existing tool_features rows are left unchanged, so the public /tools page continues to show the last successful data. Set GEMINI_API_KEY in the server environment for this step.

If your database was already configured before the video, wallpaper, or profile-picture features were added, rerun the updated supabase/schema.sql so the tables, avatar_url column, Storage buckets, and policies are created. The Admin → Profile section uploads pictures to the public profile-pictures bucket and saves the URL when you click Save changes.

3. Create your admin login
Open Authentication → Users.
Click Add user.
Create an email/password user for yourself. The email is used internally by Supabase and will not appear on the login screen.
Copy the user UUID.
In SQL Editor, run this, replacing the UUID and username:


insert into public.admins (user_id, username)
values ('PASTE_YOUR_AUTH_USER_UUID_HERE', 'nishad')
on conflict (user_id) do update set username = excluded.username;
You will sign in at /admin/login with nishad and the password you created for the Supabase Auth user.

Do not put a password in the database or in the code repository.

4. Add local environment variables
In the Supabase dashboard, open Project Settings → API and copy:

Project URL
Publishable/anon key
Service role key (server-only; never expose it in the browser)
In the portfolio folder:



cp .env.example .env.local
Then update .env.local:



NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY is used only by /api/admin/login to map the username to the internal Supabase Auth email. Never commit .env.local or expose this key in a NEXT_PUBLIC_* variable.

5. Gmail application email settings
The Apply by email job action uses Gmail SMTP. Set these values only in .env.local or your hosting provider's server-side environment settings:



GMAIL_SMTP_USER=your-gmail-address@example.com
GMAIL_SMTP_APP_PASSWORD=your-16-character-gmail-app-password
GMAIL_SMTP_USER is the Gmail address that sends applications. GMAIL_SMTP_APP_PASSWORD must be a Google App Password, not the normal Gmail password. Create it from Google Account security settings after enabling 2-Step Verification. Never commit these values, expose them as NEXT_PUBLIC_*, or paste them into chat.

The application flow is review-gated. The API first prepares a cover letter and checks the official job page for a visible email. The admin then reviews the exact recipient, subject, cover letter, and ATS resume attachment. The message is sent only after the admin confirms. A job is marked Applied only after SMTP accepts the message.

6. Start the portfolio
From the project folder:



npm install
npm run dev
Open:

Public site: http://localhost:3000
Admin login: http://localhost:3000/admin/login
Sign in with the Supabase user created in step 3.

7. Deploy to Vercel
Push the project to GitHub, or import the source ZIP into a repository.
Import the repository into Vercel.
Add the same server and public environment variables in Vercel Project Settings → Environment Variables, including GEMINI_API_KEY, GMAIL_SMTP_USER, and GMAIL_SMTP_APP_PASSWORD.
Deploy.
Update NEXT_PUBLIC_SITE_URL to the production URL and redeploy if needed.
Troubleshooting
Unable to load portfolio data
Check that:

.env.local exists in the project root.
The Supabase URL and anon key are correct.
Both schema.sql and seed.sql ran successfully.
Admin login works but /admin redirects back to login
The authenticated user must be listed in public.admins:



select * from public.admins;
If it is missing, insert the Auth user UUID as shown above.

Contact form fails
Check that the contact_messages table exists and that the public insert policy from schema.sql is present.

Application email fails
Check that:

2-Step Verification is enabled on the Gmail account.
The App Password is correct and entered without spaces.
GMAIL_SMTP_USER matches the Gmail account that generated the App Password.
Both values are configured in the server environment, not as NEXT_PUBLIC_* variables.
A verified company email was found or manually entered in the review screen.
Security note
The public portfolio can read portfolio tables, and anonymous visitors can insert contact messages. Only users listed in public.admins can update content, read the inbox, prepare application emails, or send them.