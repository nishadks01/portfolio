create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(), full_name text not null, role text not null, headline text not null, bio text not null, location text not null, email text not null, phone text not null, resume_url text, github_url text, linkedin_url text, avatar_url text, available_for_work boolean not null default true, updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_url text;
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade, username text, created_at timestamptz not null default now());
alter table public.admins add column if not exists username text;
create unique index if not exists admins_username_key on public.admins (username) where username is not null;
create table if not exists public.skills (id uuid primary key default gen_random_uuid(), name text not null, group_name text not null, sort_order integer not null default 0);
create table if not exists public.experiences (id uuid primary key default gen_random_uuid(), company text not null, title text not null, location text not null, start_date text not null, end_date text, summary text not null default '', bullets text[] not null default '{}', sort_order integer not null default 0);
create table if not exists public.projects (id uuid primary key default gen_random_uuid(), name text not null, client text, role text not null, description text not null, responsibilities text[] not null default '{}', technologies text[] not null default '{}', url text, featured boolean not null default false, sort_order integer not null default 0);
create table if not exists public.education (id uuid primary key default gen_random_uuid(), degree text not null, institution text not null, year text not null, sort_order integer not null default 0);
create table if not exists public.project_videos (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, title text not null, description text, storage_path text not null, public_url text not null, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.tools (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text not null default '', icon text not null default '◈', website_url text, active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.tool_features (id uuid primary key default gen_random_uuid(), tool_id uuid not null references public.tools(id) on delete cascade, title text not null, summary text not null, details text, version text, release_date date, source_url text, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.wallpapers (id uuid primary key default gen_random_uuid(), name text not null, storage_path text not null, public_url text not null, active boolean not null default false, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.contact_messages (id uuid primary key default gen_random_uuid(), name text not null, email text not null, message text not null, is_read boolean not null default false, created_at timestamptz not null default now());

alter table public.profiles enable row level security; alter table public.admins enable row level security; alter table public.skills enable row level security; alter table public.experiences enable row level security; alter table public.projects enable row level security; alter table public.education enable row level security; alter table public.project_videos enable row level security; alter table public.tools enable row level security; alter table public.tool_features enable row level security; alter table public.wallpapers enable row level security; alter table public.contact_messages enable row level security;

create policy "public can read profile" on public.profiles for select using (true);
create policy "public can read skills" on public.skills for select using (true);
create policy "public can read experiences" on public.experiences for select using (true);
create policy "public can read projects" on public.projects for select using (true);
create policy "public can read education" on public.education for select using (true);
drop policy if exists "public can read project videos" on public.project_videos;
drop policy if exists "admins manage project videos" on public.project_videos;
create policy "public can read project videos" on public.project_videos for select using (true);
create policy "admins manage project videos" on public.project_videos for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
drop policy if exists "public can read tools" on public.tools;
drop policy if exists "admins manage tools" on public.tools;
drop policy if exists "public can read tool features" on public.tool_features;
drop policy if exists "admins manage tool features" on public.tool_features;
create policy "public can read tools" on public.tools for select using (active = true);
create policy "admins manage tools" on public.tools for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "public can read tool features" on public.tool_features for select using (exists (select 1 from public.tools where tools.id = tool_features.tool_id and tools.active = true));
create policy "admins manage tool features" on public.tool_features for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
drop policy if exists "public can read active wallpapers" on public.wallpapers;
drop policy if exists "admins manage wallpapers" on public.wallpapers;
create policy "public can read active wallpapers" on public.wallpapers for select using (active = true);
create policy "admins manage wallpapers" on public.wallpapers for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "public can submit messages" on public.contact_messages for insert with check (true);
create policy "admins can read themselves" on public.admins for select using (user_id = auth.uid());
create policy "admins manage profile" on public.profiles for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins manage skills" on public.skills for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins manage experiences" on public.experiences for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins manage projects" on public.projects for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins manage education" on public.education for all using (exists (select 1 from public.admins where user_id = auth.uid())) with check (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins manage messages" on public.contact_messages for select using (exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins update messages" on public.contact_messages for update using (exists (select 1 from public.admins where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('project-videos', 'project-videos', true)
on conflict (id) do update set public = true;

drop policy if exists "public can read project video files" on storage.objects;
drop policy if exists "admins can upload project video files" on storage.objects;
drop policy if exists "admins can update project video files" on storage.objects;
drop policy if exists "admins can delete project video files" on storage.objects;
create policy "public can read project video files" on storage.objects for select using (bucket_id = 'project-videos');
create policy "admins can upload project video files" on storage.objects for insert with check (bucket_id = 'project-videos' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can update project video files" on storage.objects for update using (bucket_id = 'project-videos' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can delete project video files" on storage.objects for delete using (bucket_id = 'project-videos' and exists (select 1 from public.admins where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('wallpapers', 'wallpapers', true)
on conflict (id) do update set public = true;

drop policy if exists "public can read wallpaper files" on storage.objects;
drop policy if exists "admins can upload wallpaper files" on storage.objects;
drop policy if exists "admins can update wallpaper files" on storage.objects;
drop policy if exists "admins can delete wallpaper files" on storage.objects;
create policy "public can read wallpaper files" on storage.objects for select using (bucket_id = 'wallpapers');
create policy "admins can upload wallpaper files" on storage.objects for insert with check (bucket_id = 'wallpapers' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can update wallpaper files" on storage.objects for update using (bucket_id = 'wallpapers' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can delete wallpaper files" on storage.objects for delete using (bucket_id = 'wallpapers' and exists (select 1 from public.admins where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do update set public = true;

drop policy if exists "public can read profile pictures" on storage.objects;
drop policy if exists "admins can upload profile pictures" on storage.objects;
drop policy if exists "admins can update profile pictures" on storage.objects;
drop policy if exists "admins can delete profile pictures" on storage.objects;
create policy "public can read profile pictures" on storage.objects for select using (bucket_id = 'profile-pictures');
create policy "admins can upload profile pictures" on storage.objects for insert with check (bucket_id = 'profile-pictures' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can update profile pictures" on storage.objects for update using (bucket_id = 'profile-pictures' and exists (select 1 from public.admins where user_id = auth.uid()));
create policy "admins can delete profile pictures" on storage.objects for delete using (bucket_id = 'profile-pictures' and exists (select 1 from public.admins where user_id = auth.uid()));
