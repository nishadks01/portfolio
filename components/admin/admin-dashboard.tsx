'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAppDispatch, useAppSelector } from '@/lib/store/provider';
import { setSessionUser } from '@/lib/store/auth-slice';
import { clearAssistantHistory } from '@/lib/store/assistant-slice';
import { AdminAssistant } from './admin-assistant';
import { AdminProfileMenu } from '../portfolio/admin-profile-menu';
import type { ApplicationStatus, CandidateResume, ContactMessage, Education, Experience, JobApplication, JobOpportunity, PortfolioData, Project, ProjectVideo, Skill, Tool, ToolFeature, Wallpaper } from '@/lib/types';

type EditableKey = 'skills' | 'experiences' | 'projects' | 'education';
type ApplicationDraft = { recipient: string; subject: string; coverLetter: string; attachmentName: string; originalMimeType: string; sourceUrl: string; recipientDiscovered: boolean; jobId: string };
const applicationStages: Array<{ key: ApplicationStatus; label: string; tone: string }> = [
  { key: 'applied', label: 'Applied', tone: 'blue' },
  { key: 'in_progress', label: 'In progress', tone: 'violet' },
  { key: 'reply_received', label: 'Reply received', tone: 'amber' },
  { key: 'selected', label: 'Selected', tone: 'green' },
  { key: 'interview', label: 'Interview', tone: 'cyan' },
  { key: 'rejected', label: 'Rejected', tone: 'red' }
];
const applicationStatusLabel = (status: ApplicationStatus) => applicationStages.find(stage => stage.key === status)?.label ?? status;
const uniqueCompanyNames = (items: JobOpportunity[]) => Array.from(new Set(items.map(job => job.company?.trim()).filter((company): company is string => Boolean(company)))).sort((a, b) => a.localeCompare(b));

function ApplicationReviewModal({ draft, busy, error, onClose, onSend }: { draft: ApplicationDraft; busy: boolean; error: string; onClose: () => void; onSend: (draft: ApplicationDraft) => void }) {
  const [recipient, setRecipient] = useState(draft.recipient);
  const [subject, setSubject] = useState(draft.subject);
  const [coverLetter, setCoverLetter] = useState(draft.coverLetter);
  const [formError, setFormError] = useState('');
  const validRecipient = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient.trim());
  function submitApplication() {
    if (!validRecipient) { setFormError('Enter a valid company email before sending.'); return; }
    if (!subject.trim()) { setFormError('Add an email subject before sending.'); return; }
    if (!coverLetter.trim()) { setFormError('The cover letter is empty. Generate the application draft again.'); return; }
    setFormError('');
    onSend({ ...draft, recipient: recipient.trim(), subject: subject.trim(), coverLetter });
  }
  return <div className="application-modal-backdrop" role="presentation"><section className="application-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="application-review-title"><div className="eyebrow">Review before sending</div><h2 id="application-review-title">Application email</h2><p className="muted">Confirm the exact recipient, subject, cover letter, and attached resume. The job will be marked Applied only after Gmail confirms delivery.</p><div className="admin-form"><div className="field"><label htmlFor="application-recipient">Company email</label><input id="application-recipient" type="email" value={recipient} onChange={event => { setRecipient(event.target.value); setFormError(''); }} placeholder="careers@company.com" />{!draft.recipientDiscovered && <span className="field-hint">No verified email was found on the official job page. Enter one manually; the app will not guess.</span>}</div><div className="field"><label htmlFor="application-subject">Subject</label><input id="application-subject" value={subject} onChange={event => { setSubject(event.target.value); setFormError(''); }} /></div><div className="field"><label htmlFor="application-cover-letter">Cover letter</label><textarea id="application-cover-letter" rows={13} value={coverLetter} onChange={event => { setCoverLetter(event.target.value); setFormError(''); }} /></div><div className="application-attachment"><strong>Attachment</strong><span>{draft.attachmentName} · Original uploaded resume ({draft.originalMimeType})</span></div>{(formError || error) && <p className="error">{formError || error}</p>}<div className="application-modal-actions"><button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" type="button" onClick={submitApplication} disabled={busy}>{busy ? 'Sending…' : 'Send application email'}</button></div></div></section></div>;
}

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
  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsSyncing, setApplicationsSyncing] = useState(false);
  const [applicationsStatus, setApplicationsStatus] = useState('');
  const [jobSyncing, setJobSyncing] = useState(false);
  const [jobStatus, setJobStatus] = useState('');
  const [jobListMessage, setJobListMessage] = useState('');
  const [jobModeFilter, setJobModeFilter] = useState('all');
  const [jobLocationFilter, setJobLocationFilter] = useState('');
  const [jobTechnologyFilter, setJobTechnologyFilter] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [jobSearchInput, setJobSearchInput] = useState('');
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false);
  const [jobPage, setJobPage] = useState(1);
  const [jobProcess, setJobProcess] = useState<string[]>([]);
  const [jobProcessOpen, setJobProcessOpen] = useState(false);
  const [applicationDraft, setApplicationDraft] = useState<ApplicationDraft | null>(null);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationError, setApplicationError] = useState('');
  const [candidateResume, setCandidateResume] = useState<CandidateResume | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeStatus, setResumeStatus] = useState('');
  const featureToolSelectRef = useRef<HTMLSelectElement>(null);
  const jobFilterReadyRef = useRef(false);
  const jobSyncingRef = useRef(false);

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

        const [{ data: inbox, error: inboxError }, jobsResponse, resumeResponse, applicationsResponse] = await Promise.all([
          supabase.from('contact_messages').select('*').order('created_at', { ascending: false }),
          fetch('/api/admin/job-opportunities', { cache: 'no-store' }),
          fetch('/api/admin/resume', { cache: 'no-store' }),
          fetch('/api/admin/applications', { cache: 'no-store' })
        ]);
        if (inboxError) console.warn('Inbox could not be loaded:', inboxError.message);
        const jobsPayload = await jobsResponse.json().catch(() => ({}));
        const resumePayload = await resumeResponse.json().catch(() => ({}));
        const applicationsPayload = await applicationsResponse.json().catch(() => ({}));
        if (!jobsResponse.ok) console.warn('Job opportunities could not be loaded:', jobsPayload.error);
        if (!resumeResponse.ok) console.warn('Candidate resume could not be loaded:', resumePayload.error);
        if (!applicationsResponse.ok) console.warn('Applications could not be loaded:', applicationsPayload.error);
        if (!cancelled) { const loadedJobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []; setData(portfolio); setMessages(inbox ?? []); setJobs(loadedJobs); setCompanyOptions(uniqueCompanyNames(loadedJobs)); setJobListMessage(jobsPayload.message ?? ''); setCandidateResume(resumePayload.resume ?? null); setApplications(applicationsPayload.applications ?? []); setLoading(false); }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : 'The admin dashboard could not load. Check the browser console.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, authInitialized, user]);

  useEffect(() => {
    if (!authInitialized || !user) return;
    if (!jobFilterReadyRef.current) {
      jobFilterReadyRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => { void syncJobs(); }, 650);
    return () => window.clearTimeout(timer);
  }, [authInitialized, user, jobModeFilter, jobLocationFilter, jobTechnologyFilter, jobSearch]);

  useEffect(() => {
    setJobPage(1);
  }, [jobModeFilter, jobLocationFilter, jobTechnologyFilter, jobSearch, jobs.length]);

  async function save() {
    if (!data) return;
    setStatus('Saving…');
    const res = await fetch('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setStatus(res.ok ? 'Saved' : 'Save failed');
    setTimeout(() => setStatus(''), 2200);
  }

  async function logout() { await createClient().auth.signOut(); dispatch(setSessionUser(null)); dispatch(clearAssistantHistory()); window.sessionStorage.removeItem('nishad-portfolio-assistant-session'); router.push('/admin/login'); }

  async function uploadCandidateResume() {
    if (!resumeFile || resumeUploading) return;
    setResumeUploading(true);
    setResumeStatus('Uploading your original resume…');
    try {
      const form = new FormData();
      form.append('resume', resumeFile);
      const response = await fetch('/api/admin/resume', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Resume upload failed.');
      setCandidateResume(result.resume ?? null);
      setResumeFile(null);
      setResumeStatus('Original resume uploaded and saved. Future applications will use this file.');
      const input = document.getElementById('candidate-resume-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (error) {
      setResumeStatus(error instanceof Error ? error.message : 'Resume upload failed.');
    } finally { setResumeUploading(false); }
  }

  async function syncJobs() {
    if (jobSyncingRef.current) return;
    jobSyncingRef.current = true;
    setJobSyncing(true);
    setJobProcessOpen(true);
    setJobProcess(['Preparing the profile and active job filters…']);
    setJobStatus('');
    try {
      const params = new URLSearchParams();
      if (jobModeFilter !== 'all') params.set('workMode', jobModeFilter);
      if (jobLocationFilter.trim()) params.set('location', jobLocationFilter.trim());
      if (jobTechnologyFilter.trim()) params.set('technology', jobTechnologyFilter.trim());
      if (jobSearch.trim()) params.set('search', jobSearch.trim());
      setJobProcess(current => [...current, 'Fetching permitted public career sources…']);
      const response = await fetch(`/api/admin/job-opportunities${params.toString() ? `?${params}` : ''}`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Job sync failed.');
      setJobProcess(current => [...current, `Matching listings with Gemini and creating interview plans for ${result.saved ?? 0} opportunities…`]);
      let syncedJobs = Array.isArray(result.jobs) ? result.jobs : null;
      if (!syncedJobs) {
        const refreshed = await fetch(`/api/admin/job-opportunities${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' });
        const payload = await refreshed.json();
        if (!refreshed.ok) throw new Error(payload.error ?? 'Jobs synced, but the list could not be refreshed.');
        syncedJobs = payload.jobs ?? [];
      }
      setJobs(syncedJobs);
      setCompanyOptions(current => Array.from(new Set([...current, ...syncedJobs.map((job: JobOpportunity) => job.company?.trim()).filter(Boolean)])).sort((a, b) => a.localeCompare(b)));
      setJobListMessage(syncedJobs.length ? `Showing ${syncedJobs.length} jobs saved by the latest sync.` : 'The sync completed, but no jobs passed the active filters.');
      const failedItems = result.results?.filter((item: { status: string }) => item.status === 'failed') ?? [];
      const skippedItems = result.results?.filter((item: { status: string }) => item.status === 'skipped') ?? [];
      const failed = failedItems.length;
      const skipped = skippedItems.length;
      const sourceIssueSteps = [...failedItems, ...skippedItems].map((item: { source: string; status: string; reason?: string }) => `${item.status === 'failed' ? 'Failed' : 'Skipped'} — ${item.source}: ${item.reason ?? 'No reason supplied.'}`);
      setJobProcess(current => [...current, ...sourceIssueSteps, 'Saving results and preserving existing review statuses…', 'Done.']);
      setJobStatus(`Sync complete: ${result.saved ?? 0} saved from ${result.fetched ?? 0} fetched${result.excludedByFilters ? `, ${result.excludedByFilters} excluded by filters` : ''}${failed ? `, ${failed} source failures` : ''}${skipped ? `, ${skipped} restricted sources skipped` : ''}.`);
    } catch (error) {
      setJobProcess(current => [...current, 'Sync stopped; existing opportunities were kept.']);
      setJobStatus(error instanceof Error ? error.message : 'Job sync failed. Existing opportunities were kept.');
    } finally { jobSyncingRef.current = false; setJobSyncing(false); }
  }

  async function updateJobStatus(job: JobOpportunity, status: JobOpportunity['status']) {
    const response = await fetch(`/api/admin/job-opportunities/${job.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setJobStatus(result.error ?? 'Could not update job status.'); return; }
    setJobs(current => current.map(item => item.id === job.id ? { ...item, status } : item));
  }

  async function prepareApplication(job: JobOpportunity) {
    if (job.status === 'applied' || applicationBusy) return;
    setApplicationBusy(true);
    setApplicationError('');
    setJobStatus('Preparing the cover letter and checking the official job page for a company email…');
    try {
      const response = await fetch(`/api/admin/job-opportunities/${job.id}/apply`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare' }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Could not prepare the application email.');
      setApplicationDraft(result.draft ?? null);
      if (!result.draft?.recipient) setApplicationError('No verified company email was found. Enter the recipient manually before sending.');
      setJobStatus('Application draft ready for review.');
    } catch (error) {
      setJobStatus(error instanceof Error ? error.message : 'Could not prepare the application email.');
    } finally { setApplicationBusy(false); }
  }

  async function sendApplication(draft: ApplicationDraft) {
    if (applicationBusy) return;
    setApplicationBusy(true);
    setApplicationError('');
    try {
      const response = await fetch(`/api/admin/job-opportunities/${draft.jobId}/apply`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', confirmed: true, recipient: draft.recipient, subject: draft.subject, coverLetter: draft.coverLetter }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Application email could not be sent.');
      setJobs(current => current.map(job => job.id === draft.jobId ? { ...job, status: 'applied' } : job));
      setApplicationDraft(null);
      await refreshApplications();
      setJobStatus(`Application email sent to ${draft.recipient}. The job is marked Applied.`);
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : 'Application email could not be sent.');
    } finally { setApplicationBusy(false); }
  }

  async function refreshApplications() {
    setApplicationsLoading(true);
    try {
      const response = await fetch('/api/admin/applications', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Applications could not be loaded.');
      setApplications(result.applications ?? []);
    } catch (error) {
      setApplicationsStatus(error instanceof Error ? error.message : 'Applications could not be loaded.');
    } finally { setApplicationsLoading(false); }
  }

  async function syncApplicationReplies() {
    if (applicationsSyncing) return;
    setApplicationsSyncing(true);
    setApplicationsStatus('Checking Gmail for replies to tracked applications…');
    try {
      const response = await fetch('/api/admin/applications/sync-replies', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Gmail reply sync failed.');
      await refreshApplications();
      setApplicationsStatus(`Reply sync complete: checked ${result.checked ?? 0} applications and found ${result.replies ?? 0} reply message${result.replies === 1 ? '' : 's'}.`);
    } catch (error) {
      setApplicationsStatus(error instanceof Error ? error.message : 'Gmail reply sync failed.');
    } finally { setApplicationsSyncing(false); }
  }

  async function updateApplicationStatus(application: JobApplication, status: ApplicationStatus) {
    const response = await fetch('/api/admin/applications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: application.id, status }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setApplicationsStatus(result.error ?? 'Application status could not be updated.'); return; }
    setApplications(current => current.map(item => item.id === application.id ? { ...item, status } : item));
  }

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
    const responseText = await response.text();
    let result: { error?: string; profile?: { avatar_url?: string } } = {};
    try { result = JSON.parse(responseText) as typeof result; } catch {}
    if (!response.ok) {
      await supabase.storage.from('profile-pictures').remove([storagePath]);
      setProfileStatus(result.error ?? (responseText.trim() || `Profile picture save failed with HTTP ${response.status}.`));
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

  const companySuggestions = companyOptions;
  const filteredJobs = jobs.filter(job => {
    const modeMatches = jobModeFilter === 'all' || job.work_mode === jobModeFilter;
    const locationMatches = !jobLocationFilter.trim() || [...job.locations, job.company, job.description].join(' ').toLowerCase().includes(jobLocationFilter.trim().toLowerCase());
    const requestedTechnologies = jobTechnologyFilter.split(/[,/]/).map(value => value.trim().toLowerCase()).filter(Boolean);
    const searchableText = [...(job.technology_requirements ?? []), job.title, job.description, job.company].join(' ').toLowerCase();
    const technologyMatches = requestedTechnologies.every(technology => searchableText.includes(technology));
    const searchText = jobSearch.trim().toLowerCase();
    const searchMatches = !searchText || [job.title, job.company, job.description].join(' ').toLowerCase().includes(searchText);
    return modeMatches && locationMatches && technologyMatches && searchMatches;
  });
  const jobsPerPage = 10;
  const totalJobPages = Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage));
  const visibleJobs = filteredJobs.slice((jobPage - 1) * jobsPerPage, jobPage * jobsPerPage);

  if (loading) return <main className="login-wrap page-shell"><p className="muted">Loading workspace…</p></main>;
  if (!data) return <main className="login-wrap page-shell"><div className="glass-card login-card"><div className="eyebrow"><span className="eyebrow-dot" /> Admin access</div><h1>Almost there.</h1><p className="error">{pageError}</p><p className="muted">After adding the user UUID to <code>public.admins</code>, sign out and sign in again.</p><button className="btn" onClick={logout}>Back to login</button></div></main>;

  return <main className="admin-page page-shell">
    <div className="noise" />
    <div className="container">
      <div className="admin-top"><div><a className="brand" href="/">N<span>.</span></a><div className="mini-label" style={{ marginTop: 8 }}>Content workspace</div></div><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><a className="btn" href="/">View site</a><AdminProfileMenu avatarUrl={data.profile.avatar_url} onSignOut={logout} /></div></div>
      <div className="admin-layout">
        <aside className="glass-card admin-sidebar">{['assistant', 'overview', 'profile', 'skills', 'experience', 'projects', 'videos', 'tools', 'jobs', 'applications', 'wallpapers', 'education', 'messages'].map(item => <button key={item} className={`admin-tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'messages' && messages.some(m => !m.is_read) ? ' •' : ''}</button>)}</aside>
        <section className="glass-card admin-content">
          <div className="admin-toolbar"><div><h1>{tab[0].toUpperCase() + tab.slice(1)}</h1><p className="muted">Manage the content that powers your public site.</p></div>{tab !== 'messages' && tab !== 'assistant' && tab !== 'jobs' && tab !== 'applications' && <button className="btn btn-primary" onClick={save}>Save changes</button>}{status && <span className="form-status">{status}</span>}</div>

          {tab === 'assistant' && <AdminAssistant />}

          {tab === 'overview' && <div className="grid grid-3"><div className="glass-card card"><div className="eyebrow">Projects</div><h2 style={{ marginTop: 15 }}>{data.projects.length}</h2></div><div className="glass-card card"><div className="eyebrow">Skills</div><h2 style={{ marginTop: 15 }}>{data.skills.length}</h2></div><div className="glass-card card"><div className="eyebrow">Unread messages</div><h2 style={{ marginTop: 15 }}>{messages.filter(m => !m.is_read).length}</h2></div></div>}

          {tab === 'profile' && <div className="admin-form"><div className="profile-picture-editor"><div className="profile-picture-preview">{data.profile.avatar_url ? <img src={data.profile.avatar_url} alt="Current profile" /> : <span>{data.profile.full_name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>}</div><div className="profile-picture-fields"><div className="field"><label htmlFor="profile-picture-file">Profile picture</label><input id="profile-picture-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => setProfileFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">JPG, PNG, WebP, or AVIF · maximum 10 MB</p>{profileStatus && <p className={profileStatus.includes('uploaded') ? 'form-status' : 'error'}>{profileStatus}</p>}{profileUploading && <div className="upload-progress" aria-label={`Profile picture upload progress ${profileProgress}%`}><span style={{ width: `${profileProgress}%` }} /></div>}<button className="btn" type="button" onClick={uploadProfilePicture} disabled={profileUploading}>{profileUploading ? `Uploading… ${profileProgress}%` : 'Upload profile picture'}</button></div></div><div className="row"><div className="field"><label>Name</label><input value={data.profile.full_name} onChange={e => updateProfile('full_name', e.target.value)} /></div><div className="field"><label>Role</label><input value={data.profile.role} onChange={e => updateProfile('role', e.target.value)} /></div></div><div className="field"><label>Headline</label><input value={data.profile.headline} onChange={e => updateProfile('headline', e.target.value)} /></div><div className="field"><label>Bio</label><textarea value={data.profile.bio} onChange={e => updateProfile('bio', e.target.value)} /></div><div className="row"><div className="field"><label>Email</label><input value={data.profile.email} onChange={e => updateProfile('email', e.target.value)} /></div><div className="field"><label>Phone</label><input value={data.profile.phone} onChange={e => updateProfile('phone', e.target.value)} /></div></div><div className="row"><div className="field"><label>Location</label><input value={data.profile.location} onChange={e => updateProfile('location', e.target.value)} /></div><div className="field"><label>LinkedIn URL</label><input value={data.profile.linkedin_url ?? ''} onChange={e => updateProfile('linkedin_url', e.target.value)} /></div></div><div className="field"><label>GitHub URL</label><input value={data.profile.github_url ?? ''} onChange={e => updateProfile('github_url', e.target.value)} /></div></div>}

          {tab === 'skills' && <div className="admin-list">{data.skills.map((skill: Skill, i) => <div className="glass-card card" key={skill.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Skill</label><input value={skill.name} onChange={e => updateRow('skills', i, { name: e.target.value })} /></div><div className="field"><label>Group</label><input value={skill.group_name} onChange={e => updateRow('skills', i, { group_name: e.target.value })} /></div></div></div></div>)}<button className="btn" onClick={() => addRow('skills')}>+ Add skill</button></div>}

          {tab === 'experience' && <div className="admin-list">{data.experiences.map((exp: Experience, i) => <div className="glass-card card" key={exp.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Company</label><input value={exp.company} onChange={e => updateRow('experiences', i, { company: e.target.value })} /></div><div className="field"><label>Title</label><input value={exp.title} onChange={e => updateRow('experiences', i, { title: e.target.value })} /></div></div><div className="row"><div className="field"><label>Start</label><input value={exp.start_date} onChange={e => updateRow('experiences', i, { start_date: e.target.value })} /></div><div className="field"><label>End (leave blank for Present)</label><input value={exp.end_date ?? ''} onChange={e => updateRow('experiences', i, { end_date: e.target.value || null })} /></div></div><div className="field"><label>Location</label><input value={exp.location} onChange={e => updateRow('experiences', i, { location: e.target.value })} /></div><div className="field"><label>Summary</label><textarea value={exp.summary} onChange={e => updateRow('experiences', i, { summary: e.target.value })} /></div><div className="field"><label>Bullet points (one per line)</label><textarea value={exp.bullets.join('\n')} onChange={e => updateRow('experiences', i, { bullets: e.target.value.split('\n').filter(Boolean) })} /></div></div></div>)}<button className="btn" onClick={() => addRow('experiences')}>+ Add experience</button></div>}

          {tab === 'projects' && <div className="admin-list">{data.projects.map((project: Project, i) => <div className="glass-card card" key={project.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Project name</label><input value={project.name} onChange={e => updateRow('projects', i, { name: e.target.value })} /></div><div className="field"><label>Role</label><input value={project.role} onChange={e => updateRow('projects', i, { role: e.target.value })} /></div></div><div className="field"><label>Client / product</label><input value={project.client ?? ''} onChange={e => updateRow('projects', i, { client: e.target.value || null })} /></div><div className="field"><label>Description</label><textarea value={project.description} onChange={e => updateRow('projects', i, { description: e.target.value })} /></div><div className="field"><label>Responsibilities (one per line)</label><textarea value={project.responsibilities.join('\n')} onChange={e => updateRow('projects', i, { responsibilities: e.target.value.split('\n').filter(Boolean) })} /></div><div className="field"><label>Technologies (comma separated)</label><input value={project.technologies.join(', ')} onChange={e => updateRow('projects', i, { technologies: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} /></div><div className="row"><div className="field"><label>Project URL</label><input value={project.url ?? ''} onChange={e => updateRow('projects', i, { url: e.target.value || null })} /></div><label className="pill" style={{ alignSelf: 'end' }}><input type="checkbox" checked={project.featured} onChange={e => updateRow('projects', i, { featured: e.target.checked })} /> Featured</label></div></div></div>)}<button className="btn" onClick={() => addRow('projects')}>+ Add project</button></div>}

          {tab === 'videos' && <div className="admin-list"><div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="video-project">Project</label><select id="video-project" value={videoProjectId} onChange={e => setVideoProjectId(e.target.value)}><option value="">Choose a project</option>{data.projects.filter(project => project.id).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div className="field"><label htmlFor="video-title">Title</label><input id="video-title" value={videoTitle} onChange={e => setVideoTitle(e.target.value)} placeholder="Project walkthrough" /></div><div className="field"><label htmlFor="video-description">Description</label><textarea id="video-description" value={videoDescription} onChange={e => setVideoDescription(e.target.value)} placeholder="What should visitors notice?" /></div><div className="field"><label htmlFor="video-file">Video file</label><input id="video-file" type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={e => setVideoFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">MP4, WebM, OGG, or MOV · maximum 250 MB</p>{videoStatus && <p className={videoStatus === 'Video uploaded.' ? 'form-status' : 'error'}>{videoStatus}</p>}{videoUploading && <div className="upload-progress" aria-label={`Upload progress ${videoProgress}%`}><span style={{ width: `${videoProgress}%` }} /></div>}<button className="btn btn-primary" type="button" onClick={uploadVideo} disabled={videoUploading}>{videoUploading ? `Uploading… ${videoProgress}%` : 'Upload video'}</button></div></div>{data.projectVideos.length === 0 && <p className="muted">No project videos uploaded yet.</p>}{data.projectVideos.map((video: ProjectVideo, i) => <div className="admin-list-item" key={video.id ?? i}><div><strong>{video.title}</strong><p>{data.projects.find(project => project.id === video.project_id)?.name ?? 'Unknown project'}</p></div><button className="btn danger" onClick={() => deleteVideo(video)}>Delete</button></div>)}</div>}

          {tab === 'tools' && <div className="admin-list"><div className="admin-toolbar"><div><p className="muted">Manage separate tool blocks and their feature notes. Inactive tools stay hidden from the public route.</p></div><div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button className="btn" type="button" onClick={syncToolFeaturesNow} disabled={toolSyncing}>{toolSyncing ? 'Syncing…' : 'Sync now'}</button><button className="btn" onClick={addTool}>+ Add tool</button></div>{toolStatus && <span className="form-status">{toolStatus}</span>}</div>{data.tools.map((tool: Tool, i) => <div className="glass-card card" key={tool.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Tool name</label><input value={tool.name} onChange={e => updateTool(i, { name: e.target.value })} /></div><div className="field"><label>Slug</label><input value={tool.slug} onChange={e => updateTool(i, { slug: e.target.value })} /></div></div><div className="row"><div className="field"><label>Icon / mark</label><input value={tool.icon} onChange={e => updateTool(i, { icon: e.target.value })} /></div><div className="field"><label>Website URL</label><input value={tool.website_url ?? ''} onChange={e => updateTool(i, { website_url: e.target.value || null })} /></div></div><div className="field"><label>Description</label><textarea value={tool.description} onChange={e => updateTool(i, { description: e.target.value })} /></div><label className="pill"><input type="checkbox" checked={tool.active} onChange={e => updateTool(i, { active: e.target.checked })} /> Publish this tool</label><div className="feature-list"><strong>Feature notes</strong>{data.toolFeatures.filter(feature => feature.tool_id === tool.id).map((feature: ToolFeature, featureIndex) => { const globalIndex = data.toolFeatures.findIndex(item => item.id === feature.id); return <div className="glass-card card" key={feature.id ?? featureIndex}><div className="admin-form"><div className="row"><div className="field"><label>Feature title</label><input value={feature.title} onChange={e => updateToolFeature(globalIndex, { title: e.target.value })} /></div><div className="field"><label>Version</label><input value={feature.version ?? ''} onChange={e => updateToolFeature(globalIndex, { version: e.target.value || null })} /></div></div><div className="field"><label>Summary</label><textarea value={feature.summary} onChange={e => updateToolFeature(globalIndex, { summary: e.target.value })} /></div><div className="field"><label>Details</label><textarea value={feature.details ?? ''} onChange={e => updateToolFeature(globalIndex, { details: e.target.value || null })} /></div><div className="row"><div className="field"><label>Release date</label><input type="date" value={feature.release_date ?? ''} onChange={e => updateToolFeature(globalIndex, { release_date: e.target.value || null })} /></div><div className="field"><label>More details URL</label><input type="url" placeholder="https://..." value={feature.source_url ?? ''} onChange={e => updateToolFeature(globalIndex, { source_url: e.target.value || null })} /></div></div><button className="btn danger" type="button" onClick={() => deleteToolFeature(feature)}>Delete feature</button></div></div>; })}</div><div className="row"><button className={`btn ${newFeatureToolId === tool.id ? 'selected-tool-button' : ''}`} type="button" aria-pressed={newFeatureToolId === tool.id} onClick={() => selectToolForFeature(tool.id ?? '')}>{newFeatureToolId === tool.id ? 'Selected for feature' : 'Select for feature'}</button><button className="btn danger" type="button" onClick={() => deleteTool(tool)}>Delete tool</button></div></div></div>)}<div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="new-feature-tool">Add feature to</label><select ref={featureToolSelectRef} id="new-feature-tool" value={newFeatureToolId} onChange={e => setNewFeatureToolId(e.target.value)}><option value="">Choose a tool</option>{data.tools.filter(tool => tool.id).map(tool => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></div>{toolStatus && <p className="form-status">{toolStatus}</p>}<button className="btn" type="button" onClick={addToolFeature}>+ Add feature</button></div></div></div>}

          {tab === 'jobs' && <div className={`admin-list jobs-module ${jobSyncing ? 'jobs-module-loading' : ''}`} aria-busy={jobSyncing}>{jobSyncing && <div className="jobs-sync-overlay" role="status" aria-live="polite"><LoaderCircle className="job-loader" size={30} /><div><strong>Refreshing job opportunities…</strong><span>{jobProcess[jobProcess.length - 1] ?? 'Fetching permitted public career sources…'}</span><small>Job filters, resume controls, and actions are paused until synchronization finishes.</small></div></div>}<div className="resume-panel glass-card card"><div className="jobs-toolbar"><div><div className="eyebrow">Resume matching</div><h3>Upload your resume</h3><p className="muted">Your original uploaded resume is stored privately and used for job applications. Your resume stays admin-only.</p></div></div><div className="resume-upload-row"><input id="candidate-resume-file" type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => setResumeFile(event.target.files?.[0] ?? null)} /><button className="btn btn-primary" type="button" onClick={uploadCandidateResume} disabled={!resumeFile || resumeUploading}>{resumeUploading ? 'Uploading…' : 'Upload resume'}</button></div>{candidateResume && <p className="mini-label">Current original resume: {candidateResume.file_name} · uploaded {new Date(candidateResume.uploaded_at).toLocaleString()}</p>}{resumeStatus && <p className={resumeStatus.includes('saved') ? 'form-status' : 'error'}>{resumeStatus}</p>}</div><div className={`jobs-results-shell ${jobSyncing ? 'jobs-results-shell-loading' : ''}`} aria-busy={jobSyncing}><div className="jobs-toolbar"><div><p className="muted">Public career listings are matched against your profile with an AI-generated interview preparation plan. Changing search, company, technology, location, or work mode automatically refreshes the results; no applications are submitted.</p></div><button className="btn btn-primary" type="button" onClick={syncJobs} disabled={jobSyncing}>{jobSyncing ? 'Syncing jobs…' : 'Sync jobs now'}</button></div>{(jobSyncing || jobStatus) && <div className={`job-sync-status ${jobStatus && !jobSyncing && !jobStatus.startsWith('Sync complete') ? 'job-sync-status-error' : ''}`}><div className="job-sync-status-line">{jobSyncing ? <LoaderCircle className="job-loader" size={17} /> : <span className="job-sync-check">✓</span>}<span>{jobSyncing ? 'Syncing opportunities and preparing interview plans…' : jobStatus}</span></div>{jobProcess.length > 0 && <details className="job-process" open={jobProcessOpen || jobSyncing} onToggle={event => setJobProcessOpen(event.currentTarget.open)}><summary><ChevronDown size={15} /> View sync process</summary><ol>{jobProcess.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></details>}</div>}<div className="jobs-filters"><div className="job-company-search"><input className="job-search-input" value={jobSearchInput} onFocus={() => setCompanySuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 120)} onChange={event => { setJobSearchInput(event.target.value); setCompanySuggestionsOpen(true); }} placeholder="Search company name…" aria-label="Search jobs by company name" autoComplete="off" />{companySuggestionsOpen && companySuggestions.length > 0 && <div className="company-suggestions-dropdown" role="listbox" aria-label="Company suggestions">{companySuggestions.filter(company => !jobSearchInput.trim() || company.toLowerCase().includes(jobSearchInput.trim().toLowerCase())).slice(0, 8).map(company => <button className="company-suggestion" key={company} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => { setJobSearchInput(company); setJobSearch(company); setCompanySuggestionsOpen(false); }}><span>{company}</span><small>Company · select to search</small></button>)}</div>}</div><select value={jobModeFilter} onChange={event => setJobModeFilter(event.target.value)} aria-label="Filter by work mode"><option value="all">All work modes</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option><option value="unknown">Not specified</option></select><input value={jobLocationFilter} onChange={event => setJobLocationFilter(event.target.value)} placeholder="Location: Kochi, Kerala, Bengaluru…" aria-label="Filter jobs by location" /><input value={jobTechnologyFilter} onChange={event => setJobTechnologyFilter(event.target.value)} placeholder="Technologies: React, Next.js, Node" aria-label="Filter jobs by technologies" /></div><div className="jobs-result-summary"><span>{filteredJobs.length} matching {filteredJobs.length === 1 ? 'opportunity' : 'opportunities'}</span>{filteredJobs.length > 0 && <span>Page {Math.min(jobPage, totalJobPages)} of {totalJobPages}</span>}</div>{jobSyncing && <div className="job-list-loader" role="status" aria-live="polite"><LoaderCircle className="job-loader" size={22} /><div><strong>Refreshing job opportunities…</strong><span>{jobProcess[jobProcess.length - 1] ?? 'Fetching listings and preparing AI matches.'}</span></div></div>}{filteredJobs.length === 0 && <><p className="muted">{jobListMessage || 'No matching opportunities yet. Click “Sync jobs now” to fetch public listings.'}</p></>}{visibleJobs.map(job => <article className="job-opportunity-card" key={job.id}><div className="job-card-top"><div><div className="job-source">{job.source}</div><h3>{job.title}</h3><p className="muted">{job.company} · {job.locations.join(', ')}</p></div><div className="job-score">{job.match_score}%<span>match</span></div></div><div className="job-meta"><span>{job.work_mode}</span>{job.employment_type && <span>{job.employment_type}</span>}<span>{job.posted_at ? <time dateTime={job.posted_at}>Posted on {new Date(job.posted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</time> : 'Posted date unavailable'}</span></div><p>{job.match_reason}</p><details className="job-role-details"><summary>Role and requirement details</summary><p>{job.description}</p></details><div className="job-tech-stack"><strong>Technology requirements</strong>{job.technology_requirements?.length ? <div className="chips">{job.technology_requirements.map(item => <span className="chip" key={item}>{item}</span>)}</div> : <p className="muted">Technology requirements were not visible in the source listing.</p>}</div><details><summary>Interview preparation plan</summary><div className="interview-plan"><div><strong>Prepare</strong><ul>{job.interview_plan.prepare?.map(item => <li key={item}>{item}</li>)}</ul></div><div><strong>Brush up</strong><ul>{job.interview_plan.brush_up?.map(item => <li key={item}>{item}</li>)}</ul></div><div><strong>Focus areas</strong><ul>{job.interview_plan.focus_areas?.map(item => <li key={item}>{item}</li>)}</ul></div><div><strong>Likely practice questions</strong><ul>{job.interview_plan.likely_questions?.map(item => <li key={item}>{item}</li>)}</ul></div>{job.interview_plan.expected_questions?.length > 0 && <div><strong>Expected questions and answers</strong><div className="interview-qa-list">{job.interview_plan.expected_questions.map(item => <div className="interview-qa" key={item.question}><b>Q: {item.question}</b><p>A: {item.answer}</p></div>)}</div></div>}{job.interview_plan.programming_questions?.length > 0 && <div><strong>Programming questions and answers</strong><div className="interview-qa-list">{job.interview_plan.programming_questions.map(item => <div className="interview-qa" key={item.question}><b>Q: {item.question}</b><p>A: {item.answer}</p></div>)}</div></div>}<div><strong>Preparation steps</strong><ul>{job.interview_plan.preparation_steps?.map(item => <li key={item}>{item}</li>)}</ul></div>{job.interview_plan.risk_flags?.length > 0 && <div><strong>Risk flags</strong><ul>{job.interview_plan.risk_flags.map(item => <li key={item}>{item}</li>)}</ul></div>}</div></details><div className="job-card-actions"><a className="btn" href={job.canonical_url} target="_blank" rel="noreferrer" onClick={() => { if (job.status === 'new') updateJobStatus(job, 'viewed'); }}>View opening</a>{job.apply_url && job.apply_url !== job.canonical_url && (job.status === 'applied' ? <span className="btn btn-disabled">Already applied</span> : <a className="btn" href={job.apply_url} target="_blank" rel="noreferrer" onClick={() => { if (job.status === 'new') updateJobStatus(job, 'viewed'); }}>Apply</a>)}{job.status === 'applied' ? <span className="btn btn-disabled">Email sent</span> : <button className="btn btn-primary" type="button" onClick={() => prepareApplication(job)} disabled={applicationBusy}>{applicationBusy ? 'Preparing…' : 'Apply by email'}</button>}<select value={job.status} onChange={event => updateJobStatus(job, event.target.value as JobOpportunity['status'])} aria-label={`Set status for ${job.title}`}><option value="new">New</option><option value="viewed">Viewed</option><option value="reviewed">Reviewed</option><option value="saved">Saved</option><option value="applied">Applied</option><option value="dismissed">Dismissed</option></select></div></article>)}{filteredJobs.length > jobsPerPage && <div className="jobs-pagination" aria-label="Job results pagination"><button className="btn" type="button" disabled={jobPage <= 1} onClick={() => setJobPage(page => Math.max(1, page - 1))}>Previous</button><span>Page {Math.min(jobPage, totalJobPages)} of {totalJobPages}</span><button className="btn" type="button" disabled={jobPage >= totalJobPages} onClick={() => setJobPage(page => Math.min(totalJobPages, page + 1))}>Next</button></div>}</div></div>}
          {tab === 'applications' && <div className="admin-list applications-workspace"><div className="applications-toolbar"><div><div className="eyebrow">Application pipeline</div><p className="muted">Track every application from sending through replies, selection, rejection, and interviews.</p></div><div className="applications-toolbar-actions"><button className="btn" type="button" onClick={refreshApplications} disabled={applicationsLoading || applicationsSyncing}>{applicationsLoading ? 'Refreshing…' : 'Refresh'}</button><button className="btn btn-primary" type="button" onClick={syncApplicationReplies} disabled={applicationsSyncing || applicationsLoading}>{applicationsSyncing ? 'Checking Gmail…' : 'Sync replies from Gmail'}</button></div></div>{applicationsStatus && <div className={`job-sync-status ${applicationsStatus.includes('failed') || applicationsStatus.includes('not configured') ? 'job-sync-status-error' : ''}`}><div className="job-sync-status-line">{applicationsSyncing && <LoaderCircle className="job-loader" size={17} />}<span>{applicationsStatus}</span></div></div>}{applicationsLoading ? <div className="job-list-loader"><LoaderCircle className="job-loader" size={22} /><span>Loading application pipeline…</span></div> : applications.length === 0 ? <div className="glass-card card empty-pipeline"><h3>No applications tracked yet</h3><p className="muted">Applications appear here after an application email is sent successfully from the Jobs tab.</p></div> : <div className="application-pipeline">{applicationStages.map(stage => { const stageApplications = applications.filter(application => application.status === stage.key); return <section className={`application-column application-column-${stage.tone}`} key={stage.key}><div className="application-column-header"><div><span className="application-column-kicker">{stage.label}</span><strong>{stageApplications.length}</strong></div><span className="application-column-dot" /></div><div className="application-column-cards">{stageApplications.map(application => <article className="application-card glass-card" key={application.id}><div className="application-card-heading"><div><strong>{application.job?.title ?? 'Untitled role'}</strong><span>{application.job?.company ?? 'Unknown company'}</span></div><span className="application-status-pill">{applicationStatusLabel(application.status)}</span></div><div className="application-card-meta"><span>Sent {new Date(application.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span><span>{application.recipient}</span></div>{application.reply_count > 0 && <div className="application-reply-preview"><strong>{application.reply_count} {application.reply_count === 1 ? 'reply' : 'replies'} detected</strong><span>{application.latest_reply_from ?? 'Gmail reply'}{application.latest_reply_at ? ` · ${new Date(application.latest_reply_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</span>{application.latest_reply_snippet && <p>{application.latest_reply_snippet}</p>}</div>}<div className="application-card-actions"><select value={application.status} onChange={event => updateApplicationStatus(application, event.target.value as ApplicationStatus)} aria-label={`Update status for ${application.job?.title ?? 'application'}`}>{applicationStages.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>{application.job?.canonical_url && <a className="btn" href={application.job.canonical_url} target="_blank" rel="noreferrer">View job</a>}</div></article>)}</div></section>; })}</div>}</div>}

          {tab === 'wallpapers' && <div className="admin-list"><div className="glass-card card"><div className="admin-form"><div className="field"><label htmlFor="wallpaper-name">Wallpaper name</label><input id="wallpaper-name" value={wallpaperName} onChange={e => setWallpaperName(e.target.value)} placeholder="Aurora mountain" /></div><div className="field"><label htmlFor="wallpaper-file">Wallpaper image</label><input id="wallpaper-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => setWallpaperFile(e.target.files?.[0] ?? null)} /></div><p className="mini-label">JPG, PNG, WebP, or AVIF · maximum 50 MB</p>{wallpaperStatus && <p className={wallpaperStatus === 'Wallpaper uploaded. Click Save changes to publish it.' ? 'form-status' : 'error'}>{wallpaperStatus}</p>}{wallpaperUploading && <div className="upload-progress" aria-label={`Wallpaper upload progress ${wallpaperProgress}%`}><span style={{ width: `${wallpaperProgress}%` }} /></div>}<button className="btn btn-primary" type="button" onClick={uploadWallpaper} disabled={wallpaperUploading}>{wallpaperUploading ? `Uploading… ${wallpaperProgress}%` : 'Upload wallpaper'}</button></div></div>{data.wallpapers.length === 0 && <p className="muted">No wallpapers uploaded yet.</p>}{data.wallpapers.map((wallpaper: Wallpaper, i) => <div className="admin-list-item" key={wallpaper.id ?? i}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><img className="wallpaper-thumb" src={wallpaper.public_url} alt="" /><div><strong>{wallpaper.name}</strong><p>{wallpaper.active ? 'Active background' : 'Available background'}</p></div></div><div style={{ display: 'flex', gap: 8 }}><label className="pill"><input type="checkbox" checked={wallpaper.active} onChange={e => updateWallpaper(i, { active: e.target.checked })} /> Active</label><button className="btn danger" type="button" onClick={() => deleteWallpaper(wallpaper)}>Delete</button></div></div>)}</div>}

          {tab === 'education' && <div className="admin-list">{data.education.map((item: Education, i) => <div className="glass-card card" key={item.id ?? i}><div className="admin-form"><div className="row"><div className="field"><label>Degree</label><input value={item.degree} onChange={e => updateRow('education', i, { degree: e.target.value })} /></div><div className="field"><label>Institution</label><input value={item.institution} onChange={e => updateRow('education', i, { institution: e.target.value })} /></div></div><div className="field"><label>Year</label><input value={item.year} onChange={e => updateRow('education', i, { year: e.target.value })} /></div></div></div>)}<button className="btn" onClick={() => addRow('education')}>+ Add education</button></div>}

          {tab === 'messages' && <div className="admin-list">{messages.length === 0 && <p className="muted">No messages yet.</p>}{messages.map(message => <div className="admin-list-item" key={message.id}><div><strong>{message.name} · {message.email}</strong><p>{message.message}</p><p>{new Date(message.created_at).toLocaleString()}</p></div><button className="btn" onClick={() => markRead(message)}>{message.is_read ? 'Mark unread' : 'Mark read'}</button></div>)}</div>}
        </section>
      </div>
    </div>
    {applicationDraft && <ApplicationReviewModal draft={applicationDraft} busy={applicationBusy} error={applicationError} onClose={() => { if (!applicationBusy) { setApplicationDraft(null); setApplicationError(''); } }} onSend={sendApplication} />}
  </main>;
}