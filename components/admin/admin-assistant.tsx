'use client';

import { FormEvent, useState } from 'react';
import { Check, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { addAssistantMessage, clearAssistantHistory, setAssistantPending } from '@/lib/store/assistant-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/provider';

export function AdminAssistant() {
  const dispatch = useAppDispatch();
  const { messages, pending } = useAppSelector(state => state.assistant);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || loading) return;
    const nextMessages = [...messages, { role: 'user' as const, content }].slice(-40);
    dispatch(addAssistantMessage({ role: 'user', content })); setDraft(''); setError(''); setLoading(true);
    try {
      const response = await fetch('/api/admin/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: nextMessages }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Assistant request failed.');
      dispatch(addAssistantMessage({ role: 'assistant', content: result.reply }));
      dispatch(setAssistantPending(result.pendingAction ?? null));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Assistant request failed.'); }
    finally { setLoading(false); }
  }

  async function confirmChanges() {
    if (!pending || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: pending }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not apply the changes.');
      dispatch(addAssistantMessage({ role: 'assistant', content: result.reply }));
      dispatch(setAssistantPending(null));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not apply the changes.'); }
    finally { setLoading(false); }
  }

  function cancelChanges() {
    dispatch(setAssistantPending(null));
    dispatch(addAssistantMessage({ role: 'assistant', content: 'Okay, I cancelled that change. Nothing was saved.' }));
  }

  function clearHistory() {
    if (window.confirm('Clear this assistant conversation for the current session?')) dispatch(clearAssistantHistory());
  }

  return <div className="assistant-shell">
    <div className="assistant-intro glass-card card"><div className="eyebrow"><Sparkles size={15} /> Private admin copilot</div><div className="assistant-heading-row"><div><h2>Manage your portfolio by chat.</h2><p className="muted">You are using your existing admin session. Your password is never sent to the assistant. Every database change requires your confirmation.</p></div><button className="btn assistant-clear" type="button" onClick={clearHistory}>Clear chat</button></div><div className="assistant-trust"><ShieldCheck size={16} /> Admin-only actions with server-side Supabase checks · Session history only</div></div>
    <div className="assistant-chat glass-card">
      <div className="assistant-messages">{messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={`${index}-${message.content.slice(0, 12)}`}><span className="assistant-role">{message.role === 'user' ? 'You' : 'Copilot'}</span><p>{message.content}</p></div>)}{loading && <div className="assistant-message assistant"><span className="assistant-role">Copilot</span><p className="assistant-typing">Thinking…</p></div>}</div>
      {pending && <div className="assistant-confirm"><div><strong>Confirm database changes?</strong><p>{pending.summary}</p><ul>{pending.changes.map((change, index) => <li key={`${change.section}-${index}`}><b>{change.operation}</b> {change.section}{change.id ? ` · ${change.id}` : ''}</li>)}</ul></div><div className="assistant-confirm-actions"><button className="btn btn-primary" type="button" onClick={confirmChanges} disabled={loading}><Check size={15} /> Confirm and save</button><button className="btn" type="button" onClick={cancelChanges} disabled={loading}><X size={15} /> Cancel</button></div></div>}
      {error && <p className="error assistant-error">{error}</p>}
      <form className="assistant-input" onSubmit={sendMessage}><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask to update your portfolio…" aria-label="Ask the admin copilot" /><button className="btn btn-primary" type="submit" disabled={loading || !draft.trim()} aria-label="Send message"><Send size={16} /></button></form>
    </div>
  </div>;
}
