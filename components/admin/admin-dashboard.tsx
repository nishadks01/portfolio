'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppDispatch, useAppSelector } from '@/lib/store/provider';
import { setSessionUser } from '@/lib/store/auth-slice';
import { clearAssistantHistory } from '@/lib/store/assistant-slice';
import { AdminAssistant } from './admin-assistant';
import { AdminProfileMenu } from '../portfolio/admin-profile-menu';
import type { ContactMessage, Education, Experience, PortfolioData, Project, ProjectVideo, Skill, Tool, ToolFeature, Wallpaper } from '@/lib/types';

type EditableKey = 'skills' | 'experiences' | 'projects' | 'education';

function uploadStorageFile(bucket: string, file: File, storagePath: string, accessToken: string, onProgress: (percentage: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!baseUrl || !publicKey) { reject(new Error('Supabase environment variables are missing.')); return; }
    xhr.open('POST', `${baseUrl}/storage/v1/object/${bucket}/${storagePath}`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', publicKey);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); return; }
      if (xhr.status === 413) {
        reject(new Error('Supabase rejected this video because it exceeds the Storage file-size limit. Increase the Storage limit/plan or compress the video; the 250 MB app limit cannot override Supabase.'));
        return;
      }
      try { reject(new Error(JSON.parse(xhr.responseText)?.message ?? `Storage upload failed with HTTP ${xhr.status}.`)); }
      catch { reject(new Error(`Storage upload failed with HTTP ${xhr.status}.`)); }
    };
    xhr.onerror = () => reject(new Error('The upload connection failed. Check the Storage bucket, policies, and file size limit.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(file);
  });
}

export function AdminDashboard() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, initialized: authInitialized } = useAppSelector(state => state.auth);
  const [data, setData] = useState<PortfolioData | null>(null);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState('');
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoProjectId, setVideoProjectId] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoStatus, setVideoStatus] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [newFeatureToolId, setNewFeatureToolId] = useState('');
  const [toolStatus, setToolStatus] = useState('');
  const [toolSyncing, setToolSyncing] = useState(false);
  const [wallpaperFile, setWallpaperFile] = useState<File | null>(null);
  const [wallpaperName, setWallpaperName] = useState('');
  const [wallpaperStatus, setWallpaperStatus] = useState('');
  const [wallpaperUploading, setWallpaperUploading] = useState(false);
  const [wallpaperProgress, setWallpaperProgress] = useState(0);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profileStatus, setProfileStatus] = useState('');
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileProgress, setProfileProgress] = useState(0);
  const featureToolSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!authInitialized) return;
    let cancelled = false;
    (async () => {
      try {
        if (!user) { router.replace('/admin/login'); return; }
        const supabase = createClient();
        const response = await fetch('/api/admin/content', { cache: 'no-store' });
        const portfolio = await response.json();
        if (!response.ok || !portfolio?.profile) {
          throw new Error(portfolio?.error ?? `Admin API returned HTTP ${response.status}`);
        }

        const { data: inbox, error: inboxError } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
        if (inboxError) console.warn('Inbox could not be loaded:', inboxError.message);
        if (!cancelled) { setData(portfolio); setMessages(inbox ?? []); setLoading(false); }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : 'The admin dashboard could not load. Check the browser console.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, authInitialized, user]);

  async function save() {
    if (!data) return;
    setStatus('Saving…');
    const res = await fetch('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setStatus(res.ok ? 'Saved' : 'Save failed');
    setTimeout(() => setStatus(''), 2200);
  }

  async function logout() { await createClient().auth.signOut(); dispatch(setSessionUser(null)); dispatch(clearAssistantHistory()); window.sessionStorage.removeItem('nishad-portfolio-assistant-session'); router.push('/admin/login'); }

  async function markRead(message: ContactMessage) {
    await fetch(`/api/admin/messages/${message.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_read: !message.is_read }) });
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_read: !m.is_read } : m));
  }

  function updateProfile(key: string, value: string | boolean) {
    if (data) setData({ ...data, profile: { ...data.profile, [key]: value } });
  }

  function updateRow<K extends EditableKey>(key: K, index: number, patch: Partial<PortfolioData[K][number]>) {
    if (!data) return;
    const rows = data[key] as Array<Record<string, unknown>>;
    setData({ ...data, [key]: rows.map((row, i) => i === index ? { ...row, ...patch } : row) } as PortfolioData);
  }

  function addRow(key: EditableKey) {
    if (!data) return;
    const rows = data[key] as unknown[];
    const defaults: Record<EditableKey, object> = {
      skills: { name: 'New skill', group_name: 'Frontend', sort_order: rows.length + 1 },
      experiences: { company: 'Company', title: 'Role', location: 'Location', start_date: '2026', end_date: null, summary: '', bullets: ['Add an accomplishment'], sort_order: rows.length + 1 },
      projects: { name: 'New project', client: null, role: 'Developer', description: 'Project description', responsibilities: ['Add responsibility'], technologies: ['Next.js'], url: null, featured: false, sort_order: rows.length + 1 },
      education: { degree: 'Degree', institution: 'Institution', year: '2026', sort_order: rows.length + 1 }
    };
    setData({ ...data, [key]: [...rows, defaults[key]] } as PortfolioData);
  }

  async function uploadVideo() {
    if (!data || !videoFile || !videoProjectId || !videoTitle.trim()) {
      setVideoStatus('Choose a project, video file, and title first.');
      return;
    }
    if (!videoFile.type.startsWith('video/')) {
      setVideoStatus('Please select a video file.');
      return;
    }
    if (videoFile.size > 250 * 1024 * 1024) {
      setVideoStatus('Video files must be 250 MB or smaller.');
      return;
    }

    setVideoUploading(true);
    setVideoProgress(0);
    setVideoStatus('Uploading video… 0%');
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      setVideoStatus(sessionError?.message ?? 'Your admin session has expired. Sign in again.');
      setVideoUploading(false);
      return;
    }
    const safeName = videoFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const storagePath = `${videoProjectId}/${crypto.randomUUID()}-${safeName}`;
    try {
      await uploadStorageFile('project-videos', videoFile, storagePath, session.access_token, percentage => {
        setVideoProgress(percentage);
        setVideoStatus(`Uploading video… ${percentage}%`);
      });
    } catch (uploadError) {
      setVideoStatus(uploadError instanceof Error ? uploadError.message : 'Video upload failed.');
      setVideoUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from('project-videos').getPublicUrl(storagePath);
    const response = await fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: videoProjectId, title: videoTitle.trim(), description: videoDescription.trim() || null, storage_path: storagePath, public_url: publicUrl.publicUrl, sort_order: data.projectVideos.length })
    });
    const result = await response.json();
    if (!response.ok) {
      await supabase.storage.from('project-videos').remove([storagePath]);
      setVideoStatus(result.error ?? 'Could not save video details.');
      setVideoUploading(false);
      return;
    }

    setData({ ...data, projectVideos: [...data.projectVideos, result as ProjectVideo] });
    setVideoFile(null); setVideoTitle(''); setVideoDescription(''); setVideoStatus('Video uploaded.'); setVideoUploading(false);
    const input = document.getElementById('video-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function deleteVideo(video: ProjectVideo) {
    if (!video.id || !window.confirm(`Delete “${video.title}”?`)) return;
    const response = await fetch(`/api/admin/videos/${video.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json();
      setVideoStatus(result.error ?? 'Could not delete video.');
      return;
    }
    setData(prev => prev ? { ...prev, projectVideos: prev.projectVideos.filter(item => item.id !== video.id) } : prev);
  }

  function updateTool(index: number, patch: Partial<Tool>) {
    if (!data) return;
    setData({ ...data, tools: data.tools.map((tool, i) => i === index ? { ...tool, ...patch } : tool) });
  }

  function updateToolFeature(index: number, patch: Partial<ToolFeature>) {
    if (!data) return;
    setData({ ...data, toolFeatures: data.toolFeatures.map((feature, i) => i === index ? { ...feature, ...patch } : feature) });
  }

  function addTool() {
    if (!data) return;
    const nextOrder = data.tools.length + 1;
    setData({ ...data, tools: [...data.tools, { id: crypto.randomUUID(), name: 'New tool', slug: `new-tool-${nextOrder}`, description: 'Tool description', icon: '◈', website_url: null, active: true, sort_order: nextOrder }] });
  }

  function selectToolForFeature(toolId: string) {
    setNewFeatureToolId(toolId);
    setToolStatus('Tool selected. Click “Add feature” below to create its feature note.');
    requestAnimationFrame(() => {
      featureToolSelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      featureToolSelectRef.current?.focus();
    });
  }

  function addToolFeature() {
    if (!data || !newFeatureToolId) { setToolStatus('Choose a tool before adding a feature.'); featureToolSelectRef.current?.focus(); return; }
    setData({ ...data, toolFeatures: [...data.toolFeatures, { id: crypto.randomUUID(), tool_id: newFeatureToolId, title: 'New feature', summary: 'Feature summary', details: null, version: null, release_date: null, source_url: null, sort_order: data.toolFeatures.filter(feature => feature.tool_id === newFeatureToolId).length + 1 }] });
    setToolStatus('Feature added. Edit it and click Save changes.');
  }

  async function syncToolFeaturesNow() {
    if (toolSyncing) return;
    setToolSyncing(true); setToolStatus('Checking official release sources…');
    try {
      const response = await fetch('/api/admin/tool-features/sync', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Tool feature sync failed.');
      const refreshed = await fetch('/api/admin/content', { cache: 'no-store' });
      const portfolio = await refreshed.json();
      if (!refreshed.ok || !portfolio?.profile) throw new Error(portfolio?.error ?? 'Sync completed, but refreshed data could not be loaded.');
      setData(portfolio);
      const updated = result.results?.filter((item: { status: string }) => item.status === 'updated').length ?? 0;
      const failed = result.results?.filter((item: { status: string }) => item.status === 'failed').length ?? 0;
      setToolStatus(`Sync complete: ${updated} updated${failed ? `, ${failed} using previous data` : ''}.`);
    } catch (error) {
      setToolStatus(error instanceof Error ? error.message : 'Tool feature sync failed. Existing data was kept.');
    } finally { setToolSyncing(false); }
  }

  async function deleteTool(tool: Tool) {
    if (!tool.id || !window.confirm(`Delete ${tool.name} and its feature notes?`)) return;
    const response = await fetch(`/api/admin/tools/${tool.id}`, { method: 'DELETE' });
    if (!response.ok) { const result = await response.json(); setToolStatus(result.error ?? 'Could not delete tool.'); return; }
    setData(prev => prev ? { ...prev, tools: prev.tools.filter(item => item.id !== tool.id), toolFeatures: prev.toolFeatures.filter(feature => feature.tool_id !== tool.id) } : prev);
  }

  async function deleteToolFeature(feature: ToolFeature) {
    if (!feature.id || !window.confirm(`Delete “${feature.title}”?`)) return;
    const response = await fetch(`/api/admin/tool-features/${feature.id}`, { method: 'DELETE' });
    if (!response.ok) { const result = await response.json(); setToolStatus(result.error ?? 'Could not delete feature.'); return; }
    setData(prev => prev ? { ...prev, toolFeatures: prev.toolFeatures.filter(item => item.id !== feature.id) } : prev);
  }

  function updateWallpaper(index: number, patch: Partial<Wallpaper>) {
    if (!data) return;
    setData({ ...data, wallpapers: data.wallpapers.map((wallpaper, i) => patch.active && i !== index ? { ...wallpaper, active: false } : i === index ? { ...wallpaper, ...patch } : wallpaper) });
  }

  async function uploadWallpaper() {
    if (!data || !wallpaperFile || !wallpaperName.trim()) { setWallpaperStatus('Choose an image and enter a wallpaper name first.'); return; }
    if (!wallpaperFile.type.startsWith('image/')) { setWallpaperStatus('Please select an image file.'); return; }
    if (wallpaperFile.size > 50 * 1024 * 1024) { setWallpaperStatus('Wallpaper files must be 50 MB or smaller.'); return; }
    setWallpaperUploading(true); setWallpaperProgress(0); setWallpaperStatus('Uploading wallpaper… 0%');
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) { setWallpaperStatus(sessionError?.message ?? 'Your admin session has expired.'); setWallpaperUploading(false); return; }
    const safeName = wallpaperFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const storagePath = `${crypto.randomUUID()}-${safeName}`;
    try {
      await uploadStorageFile('wallpapers', wallpaperFile, storagePath, session.access_token, percentage => { setWallpaperProgress(percentage); setWallpaperStatus(`Uploading wallpaper… ${percentage}%`); });
    } catch (error) { setWallpaperStatus(error instanceof Error ? error.message : 'Wallpaper upload failed.'); setWallpaperUploading(false); return; }
    const { data: publicUrl } = supabase.storage.from('wallpapers').getPublicUrl(storagePath);
    const newWallpaper: Wallpaper = { id: crypto.randomUUID(), name: wallpaperName.trim(), storage_path: storagePath, public_url: publicUrl.publicUrl, active: data.wallpapers.length === 0, sort_order: data.wallpapers.length };
    setData({ ...data, wallpapers: newWallpaper.active ? [...data.wallpapers.map(wallpaper => ({ ...wallpaper, active: false })), newWallpaper] : [...data.wallpapers, newWallpaper] });
    setWallpaperFile(null); setWallpaperName(''); setWallpaperStatus('Wallpaper uploaded. Click Save changes to publish it.'); setWallpaperUploading(false);
    const input = document.getElementById('wallpaper-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function uploadProfilePicture() {
    if (!data || !profileFile) { setProfileStatus('Choose a profile picture first.'); return; }
    if (!data.profile.id) { setProfileStatus('The profile record has no database ID. Run the Supabase schema and seed, then reload.'); return; }
    if (!profileFile.type.startsWith('image/')) { setProfileStatus('Please select an image file.'); return; }
    if (profileFile.size > 10 * 1024 * 1024) { setProfileStatus('Profile pictures must be 10 MB or smaller.'); return; }

    setProfileUploading(true);
    setProfileProgress(0);
    setProfileStatus('Uploading profile picture… 0%');
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token || !user?.id) {
      setProfileStatus(sessionError?.message ?? 'Your admin session has expired. Sign in again.');
      setProfileUploading(false);
      return;
    }

    const safeName = profileFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    try {
      await uploadStorageFile('profile-pictures', profileFile, storagePath, session.access_token, percentage => {
        setProfileProgress(percentage);
        setProfileStatus(`Uploading profile picture… ${percentage}%`);
      });
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : 'Profile picture upload failed.');
      setProfileUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from('profile-pictures').getPublicUrl(storagePath);
    const response = await fetch('/api/admin/profile/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: data.profile.id, avatar_url: publicUrl.publicUrl })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await supabase.storage.from('profile-pictures').remove([storagePath]);
      setProfileStatus(result.error ?? 'Profile picture uploaded, but could not be saved to the database.');
      setProfileUploading(false);
      return;
    }

    setData({ ...data, profile: { ...data.profile, avatar_url: result.profile?.avatar_url ?? publicUrl.publicUrl } });
    setProfileFile(null);
    setProfileStatus('Profile picture saved successfully.');
    setProfileUploading(false);
    const input = document.getElementById('profile-picture-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function deleteWallpaper(wallpaper: Wallpaper) {
    if (!wallpaper.id || !window.confirm(`Delete “${wallpaper.name}”?`)) return;
    const response = await fetch(`/api/admin/wallpapers/${wallpaper.id}`, { method: 'DELETE' });
    if (!response.ok) { const result = await response.json(); setWallpaperStatus(result.error ?? 'Could not delete wallpaper.'); return; }
    setData(prev => prev ? { ...prev, wallpapers: prev.wallpapers.filter(item => item.id !== wallpaper.id) } : prev);
  }

  if (loading) return <main className="login-wrap page-shell"><p className="muted">Loading workspace…</p></main>;
  if (!data) return <main className="login-wrap page-shell"><div className="glass-card login-card"><div className="eyebrow"><span className="eyebrow-dot" /> Admin access</div><h1>Almost there.</h1><p className="error">{pageError}</p><p className="muted">After adding the user UUID to <code>public.admins</code>, sign out and sign in again.</p><button className="btn" onClick={logout}>Back to login</button></div></main>;

  return <main className="admin-page page-shell">
    <div className="noise" />
    <div className="container">
      <div className="admin-top"><div><a className="brand" href="/">N<span>.</span></a><div className="mini-label" style={{ marginTop: 8 }}>Content workspace</div></div><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><a className="btn" href="/">View site</a><AdminProfileMenu avatarUrl={data.profile.avatar_url} onSignOut={logout} /></div></div>
      <div className="admin-layout">
        <aside className="glass-card admin-sidebar">{['assistant', 'overview', 'profile', 'skills', 'experience', 'projects', 'videos', 'tools', 'wallpapers', 'education', 'messages'].map(item => <button key={item} className={`admin-tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'messages' && messages.some(m => !m.is_read) ? ' •' : ''}</button>)}</aside>
        <section className="glass-card admin-content">
          <div className="admin-toolbar"><div><h1>{tab[0].toUpperCase() + tab.slice(1)}</h1><p className="muted">Manage the content that powers your public site.</p></div>{tab !== 'messages' && tab !== 'assistant' && <button className="btn btn-primary" onClick={save}>Save changes</button>}{status && <span className="form-status">{status}</span>}</div>

          {tab === 'assistant' && <AdminAssistant />}

          {tab === 'overview' && <div className="grid grid-3"><div className="glass-card card"><div className="eyebrow">Projects</div><h2 style={{ marginTop: 15 }}>{data.projects.length}</h2></div><div className="glass-card card"><div className="eyebrow">Skills</div><h2 style={{ marginTop: 15 }}>{data.skills.length}</h2></div><div className="glass-card card"><div className="eyebrow">Unread messages</div><h2 style={{ marginTop: 15 }}>{messages.filter(m => !m.is_read).length}</h2></div></div>}

          {tab === 'profile' && <div className="admin-form"><div className="profile-picture-editor"><div className="profile-picture-preview">{data.profile.avatar_url ? <img src={data.profile.avatar_url} alt="Current profile" /> : <span>{data.profile.full_name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>}</div><div className="profile-picture-fields"><div className="field"><label htmlFor="profile-picture-file">Profile picture</label><input id="profile-picture-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => setProfileFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">JPG, PNG, WebP, or AVIF · maximum 10 MB</p>{profileStatus && <p className={profileStatus.includes('uploaded') ? 'form-status' : 'error'}>{profileStatus}</p>}{profileUploading && <div className="upload-progress" aria-label={`Profile picture upload progress ${profileProgress}%`}><span style={{ width: `${profileProgress}%` }} /></div>}<button className="btn" type="button" onClick={uploadProfilePicture} disabled={profileUploading}>{profileUploading ? `Uploading… ${profileProgress}%` : 'Upload profile picture'}</button></div></div><div className="row"><div className="field"><label>Name</label><input value={data.profile.full_name} onChange={e => updateProfile('full_name', e.target.value)} /></div><div className="field"><label>Role</label><input value={data.profile.role} onChange={e => updateProfile('role', e.target.value)} /></div></div><div className="field"><label>Headline</label><input value={data.profile.headline} onChange={e => updateProfile('headline', e.target.value)} /></div><div className="field"><label>Bio</label><textarea value={data.profile.bio} onChange={e => updateProfile('bio', e.target.value)} /></div><div className="row"><div className="field"><label>Email</label><input value={data.profile.email} onChange={e => updateProfile('email', e.target.value)} /></div><div className="field"><label>Phone</label><input value={data.profile.phone} onChange={e => updateProfile('phone', e.target.value)} /></div></div><div className="row"><div className="field"><label>Location</label><input value={data.profile.location} onChange={e => updateProfile('location', e.target.value)} /></div><div className="field"><label>LinkedIn URL</label><input value={data.profile.linkedin_url ?? ''} onChange={e => updateProfile('linkedin_url', e.target.value)} /></div></div><div className="field"><label>GitHub URL</label><input value={data.profile.github_url ?? ''} onChange={e => updateProfile('github_url', e.target.value)} /></div></div>}

          {tab === 'skills' && <div className="admin-list">{data.skills.map((skill: Skill, i) => <div className="glass-card card" key={skill.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Skill</label><input value={skill.name} onChange={e => updateRow('skills', i, { name: e.target.value })} /></div><div className="field"><label>Group</label><input value={skill.group_name} onChange={e => updateRow('skills', i, { group_name: e.target.value })} /></div></div></div></div>)}<button className="btn" onClick={() => addRow('skills')}>+ Add skill</button></div>}

          {tab === 'experience' && <div className="admin-list">{data.experiences.map((exp: Experience, i) => <div className="glass-card card" key={exp.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Company</label><input value={exp.company} onChange={e => updateRow('experiences', i, { company: e.target.value })} /></div><div className="field"><label>Title</label><input value={exp.title} onChange={e => updateRow('experiences', i, { title: e.target.value })} /></div></div><div className="row"><div className="field"><label>Start</label><input value={exp.start_date} onChange={e => updateRow('experiences', i, { start_date: e.target.value })} /></div><div className="field"><label>End (leave blank for Present)</label><input value={exp.end_date ?? ''} onChange={e => updateRow('experiences', i, { end_date: e.target.value || null })} /></div></div><div className="field"><label>Location</label><input value={exp.location} onChange={e => updateRow('experiences', i, { location: e.target.value })} /></div><div className="field"><label>Summary</label><textarea value={exp.summary} onChange={e => updateRow('experiences', i, { summary: e.target.value })} /></div><div className="field"><label>Bullet points (one per line)</label><textarea value={exp.bullets.join('\n')} onChange={e => updateRow('experiences', i, { bullets: e.target.value.split('\n').filter(Boolean) })} /></div></div></div>)}<button className="btn" onClick={() => addRow('experiences')}>+ Add experience</button></div>}

          {tab === 'projects' && <div className="admin-list">{data.projects.map((project: Project, i) => <div className="glass-card card" key={project.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Project name</label><input value={project.name} onChange={e => updateRow('projects', i, { name: e.target.value })} /></div><div className="field"><label>Role</label><input value={project.role} onChange={e => updateRow('projects', i, { role: e.target.value })} /></div></div><div className="field"><label>Client / product</label><input value={project.client ?? ''} onChange={e => updateRow('projects', i, { client: e.target.value || null })} /></div><div className="field"><label>Description</label><textarea value={project.description} onChange={e => updateRow('projects', i, { description: e.target.value })} /></div><div className="field"><label>Responsibilities (one per line)</label><textarea value={project.responsibilities.join('\n')} onChange={e => updateRow('projects', i, { responsibilities: e.target.value.split('\n').filter(Boolean) })} /></div><div className="field"><label>Technologies (comma separated)</label><input value={project.technologies.join(', ')} onChange={e => updateRow('projects', i, { technologies: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} /></div><div className="row"><div className="field"><label>Project URL</label><input value={project.url ?? ''} onChange={e => updateRow('projects', i, { url: e.target.value || null })} /></div><label className="pill" style={{ alignSelf: 'end' }}><input type="checkbox" checked={project.featured} onChange={e => updateRow('projects', i, { featured: e.target.checked })} /> Featured</label></div></div></div>)}<button className="btn" onClick={() => addRow('projects')}>+ Add project</button></div>}

          {tab === 'videos' && <div className="admin-list"><div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="video-project">Project</label><select id="video-project" value={videoProjectId} onChange={e => setVideoProjectId(e.target.value)}><option value="">Choose a project</option>{data.projects.filter(project => project.id).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div className="field"><label htmlFor="video-title">Title</label><input id="video-title" value={videoTitle} onChange={e => setVideoTitle(e.target.value)} placeholder="Project walkthrough" /></div><div className="field"><label htmlFor="video-description">Description</label><textarea id="video-description" value={videoDescription} onChange={e => setVideoDescription(e.target.value)} placeholder="What should visitors notice?" /></div><div className="field"><label htmlFor="video-file">Video file</label><input id="video-file" type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={e => setVideoFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">MP4, WebM, OGG, or MOV · maximum 250 MB</p>{videoStatus && <p className={videoStatus === 'Video uploaded.' ? 'form-status' : 'error'}>{videoStatus}</p>}{videoUploading && <div className="upload-progress" aria-label={`Upload progress ${videoProgress}%`}><span style={{ width: `${videoProgress}%` }} /></div>}<button className="btn btn-primary" type="button" onClick={uploadVideo} disabled={videoUploading}>{videoUploading ? `Uploading… ${videoProgress}%` : 'Upload video'}</button></div></div>{data.projectVideos.length === 0 && <p className="muted">No project videos uploaded yet.</p>}{data.projectVideos.map((video: ProjectVideo, i) => <div className="admin-list-item" key={video.id ?? i}><div><strong>{video.title}</strong><p>{data.projects.find(project => project.id === video.project_id)?.name ?? 'Unknown project'}</p></div><button className="btn danger" onClick={() => deleteVideo(video)}>Delete</button></div>)}</div>}

          {tab === 'tools' && <div className="admin-list"><div className="admin-toolbar"><div><p className="muted">Manage separate tool blocks and their feature notes. Inactive tools stay hidden from the public route.</p></div><div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button className="btn" type="button" onClick={syncToolFeaturesNow} disabled={toolSyncing}>{toolSyncing ? 'Syncing…' : 'Sync now'}</button><button className="btn" onClick={addTool}>+ Add tool</button></div>{toolStatus && <span className="form-status">{toolStatus}</span>}</div>{data.tools.map((tool: Tool, i) => <div className="glass-card card" key={tool.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Tool name</label><input value={tool.name} onChange={e => updateTool(i, { name: e.target.value })} /></div><div className="field"><label>Slug</label><input value={tool.slug} onChange={e => updateTool(i, { slug: e.target.value })} /></div></div><div className="row"><div className="field"><label>Icon / mark</label><input value={tool.icon} onChange={e => updateTool(i, { icon: e.target.value })} /></div><div className="field"><label>Website URL</label><input value={tool.website_url ?? ''} onChange={e => updateTool(i, { website_url: e.target.value || null })} /></div></div><div className="field"><label>Description</label><textarea value={tool.description} onChange={e => updateTool(i, { description: e.target.value })} /></div><label className="pill"><input type="checkbox" checked={tool.active} onChange={e => updateTool(i, { active: e.target.checked })} /> Publish this tool</label><div className="feature-list"><strong>Feature notes</strong>{data.toolFeatures.filter(feature => feature.tool_id === tool.id).map((feature: ToolFeature, featureIndex) => { const globalIndex = data.toolFeatures.findIndex(item => item.id === feature.id); return <div className="glass-card card" key={feature.id ?? featureIndex}><div className="admin-form"><div className="row"><div className="field"><label>Feature title</label><input value={feature.title} onChange={e => updateToolFeature(globalIndex, { title: e.target.value })} /></div><div className="field"><label>Version</label><input value={feature.version ?? ''} onChange={e => updateToolFeature(globalIndex, { version: e.target.value || null })} /></div></div><div className="field"><label>Summary</label><textarea value={feature.summary} onChange={e => updateToolFeature(globalIndex, { summary: e.target.value })} /></div><div className="field"><label>Details</label><textarea value={feature.details ?? ''} onChange={e => updateToolFeature(globalIndex, { details: e.target.value || null })} /></div><div className="row"><div className="field"><label>Release date</label><input type="date" value={feature.release_date ?? ''} onChange={e => updateToolFeature(globalIndex, { release_date: e.target.value || null })} /></div><div className="field"><label>More details URL</label><input type="url" placeholder="https://..." value={feature.source_url ?? ''} onChange={e => updateToolFeature(globalIndex, { source_url: e.target.value || null })} /></div></div><button className="btn danger" type="button" onClick={() => deleteToolFeature(feature)}>Delete feature</button></div></div>; })}</div><div className="row"><button className={`btn ${newFeatureToolId === tool.id ? 'selected-tool-button' : ''}`} type="button" aria-pressed={newFeatureToolId === tool.id} onClick={() => selectToolForFeature(tool.id ?? '')}>{newFeatureToolId === tool.id ? 'Selected for feature' : 'Select for feature'}</button><button className="btn danger" type="button" onClick={() => deleteTool(tool)}>Delete tool</button></div></div></div>)}<div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="new-feature-tool">Add feature to</label><select ref={featureToolSelectRef} id="new-feature-tool" value={newFeatureToolId} onChange={e => setNewFeatureToolId(e.target.value)}><option value="">Choose a tool</option>{data.tools.filter(tool => tool.id).map(tool => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></div>{toolStatus && <p className="form-status">{toolStatus}</p>}<button className="btn" type="button" onClick={addToolFeature}>+ Add feature</button></div></div></div>}

          {tab === 'wallpapers' && <div className="admin-list"><div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="wallpaper-name">Wallpaper name</label><input id="wallpaper-name" value={wallpaperName} onChange={e => setWallpaperName(e.target.value)} placeholder="Aurora mountain" /></div><div className="field"><label htmlFor="wallpaper-file">Wallpaper image</label><input id="wallpaper-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => setWallpaperFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">JPG, PNG, WebP, or AVIF · maximum 50 MB</p>{wallpaperStatus && <p className={wallpaperStatus === 'Wallpaper uploaded. Click Save changes to publish it.' ? 'form-status' : 'error'}>{wallpaperStatus}</p>}{wallpaperUploading && <div className="upload-progress" aria-label={`Wallpaper upload progress ${wallpaperProgress}%`}><span style={{ width: `${wallpaperProgress}%` }} /></div>}<button className="btn btn-primary" type="button" onClick={uploadWallpaper} disabled={wallpaperUploading}>{wallpaperUploading ? `Uploading… ${wallpaperProgress}%` : 'Upload wallpaper'}</button></div></div>{data.wallpapers.length === 0 && <p className="muted">No wallpapers uploaded yet.</p>}{data.wallpapers.map((wallpaper: Wallpaper, i) => <div className="admin-list-item" key={wallpaper.id ?? i}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><img className="wallpaper-thumb" src={wallpaper.public_url} alt="" /><div><strong>{wallpaper.name}</strong><p>{wallpaper.active ? 'Active background' : 'Available background'}</p></div></div><div style={{ display: 'flex', gap: 8 }}><label className="pill"><input type="checkbox" checked={wallpaper.active} onChange={e => updateWallpaper(i, { active: e.target.checked })} /> Active</label><button className="btn danger" type="button" onClick={() => deleteWallpaper(wallpaper)}>Delete</button></div></div>)}</div>}

          {tab === 'education' && <div className="admin-list">{data.education.map((item: Education, i) => <div className="glass-card card" key={item.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Degree</label><input value={item.degree} onChange={e => updateRow('education', i, { degree: e.target.value })} /></div><div className="field"><label>Institution</label><input value={item.institution} onChange={e => updateRow('education', i, { institution: e.target.value })} /></div></div><div className="field"><label>Year</label><input value={item.year} onChange={e => updateRow('education', i, { year: e.target.value })} /></div></div></div>)}<button className="btn" onClick={() => addRow('education')}>+ Add education</button></div>}

          {tab === 'messages' && <div className="admin-list">{messages.length === 0 && <p className="muted">No messages yet.</p>}{messages.map(message => <div className="admin-list-item" key={message.id}><div><strong>{message.name} · {message.email}</strong><p>{message.message}</p><p>{new Date(message.created_at).toLocaleString()}</p></div><button className="btn" onClick={() => markRead(message)}>{message.is_read ? 'Mark unread' : 'Mark read'}</button></div>)}</div>}
        </section>
      </div>
    </div>
  </main>;
}