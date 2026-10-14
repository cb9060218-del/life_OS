import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, Download, Pause, Pencil, Play, Search, StopCircle, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PageProps } from '../app/FeatureHub'
import { EmptyState, Feedback, FormField, PageHeader, Panel, SubmitButton, userToday } from './shared'

type ActivityRecord = { id: string; title: string; category: string; activity_date: string; duration_minutes: number | null; notes: string; quantity: number | null; quantity_unit: string | null; distance_km: number | null }
type FocusTimer = { purpose: string; startedAt: number | null; accumulatedMs: number }

export default function ActivitiesPage({ userId }: PageProps) {
  const [rows, setRows] = useState<ActivityRecord[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [editing, setEditing] = useState<ActivityRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [focusPurpose, setFocusPurpose] = useState('')
  const [focusTimer, setFocusTimer] = useState<FocusTimer | null>(() => { try { const value = localStorage.getItem(timerKey(userId)); return value ? JSON.parse(value) as FocusTimer : null } catch { return null } })
  const [elapsedMs, setElapsedMs] = useState(0)

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    const { data, error: queryError } = await supabase.from('activities').select('*').eq('user_id', userId).order('activity_date', { ascending: false }).order('created_at', { ascending: false }).limit(250)
    if (queryError) setError(queryError.message)
    setRows((data ?? []) as ActivityRecord[])
    setBusy(false)
  }, [userId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (focusTimer) localStorage.setItem(timerKey(userId), JSON.stringify(focusTimer)); else localStorage.removeItem(timerKey(userId)) }, [focusTimer,userId])
  useEffect(() => { if (!focusTimer?.startedAt) return; const tick=()=>setElapsedMs(focusTimer.accumulatedMs+Date.now()-focusTimer.startedAt!);tick();const id=window.setInterval(tick,1000);return()=>window.clearInterval(id) },[focusTimer])

  const categories = useMemo(() => ['All', ...new Set(rows.map(row => row.category))], [rows])
  const filtered = rows.filter(row => (category === 'All' || row.category === category) && `${row.title} ${row.notes} ${row.category}`.toLowerCase().includes(search.toLowerCase()))

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const form = event.currentTarget
    const values = new FormData(form)
    const payload = { title: String(values.get('title') ?? '').trim(), category: String(values.get('category') ?? 'Personal').trim() || 'Personal', activity_date: String(values.get('activity_date') ?? userToday(userId)), duration_minutes: values.get('duration_minutes') ? Number(values.get('duration_minutes')) : null, notes: String(values.get('notes') ?? '').trim(), quantity: values.get('quantity') ? Number(values.get('quantity')) : null, quantity_unit: String(values.get('quantity_unit') ?? '').trim() || null, distance_km: values.get('distance_km') ? Number(values.get('distance_km')) : null }
    if (!payload.title) { setError('Add an activity title.'); return }
    setSaving(true); setError(''); setSuccess('')
    const result = editing ? await supabase.from('activities').update(payload).eq('id', editing.id).eq('user_id', userId) : await supabase.from('activities').insert({ ...payload, user_id: userId })
    if (result.error) setError(result.error.message)
    else { setSuccess(editing ? 'Activity updated.' : 'Activity saved.'); setEditing(null); form.reset(); await load() }
    setSaving(false)
  }

  async function remove(row: ActivityRecord) {
    if (!supabase || !window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return
    const { error: deleteError } = await supabase.from('activities').delete().eq('id', row.id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message); else { setSuccess('Activity deleted.'); await load() }
  }

  async function finishFocus() {
    if (!supabase || !focusTimer) return
    const duration = Math.max(1,Math.round((focusTimer.accumulatedMs+(focusTimer.startedAt ? Date.now()-focusTimer.startedAt : 0))/60000))
    setSaving(true);setError('')
    const {error:writeError}=await supabase.from('activities').insert({user_id:userId,title:`Focus · ${focusTimer.purpose}`,category:'Focus',activity_date:userToday(userId),duration_minutes:duration,notes:'Recorded by the timestamp-based focus timer.'})
    if(writeError){setError(writeError.message);setSaving(false);return}
    setFocusTimer(null);setElapsedMs(0);setSuccess(`Focus session saved · ${duration} minutes.`);await load()
    setSaving(false)
  }

  function exportCsv() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const content = ['Date,Title,Category,Duration minutes,Distance km,Quantity,Unit,Notes', ...filtered.map(row => [row.activity_date,row.title,row.category,row.duration_minutes,row.distance_km,row.quantity,row.quantity_unit,row.notes].map(quote).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `lifeos-activities-${userToday(userId)}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  return <>
    <PageHeader eyebrow="ACTIVITY JOURNAL" title="Activities" description="Record how you spend time, then search, edit, and export your history." action={<button className="secondary compact" onClick={exportCsv} disabled={!filtered.length}><Download size={15} /> Export CSV</button>} />
    <Feedback error={error} success={success} />
    <Panel className="focus-timer-panel"><div className="feature-panel-head"><div><div className="eyebrow">FOCUS TIMER</div><h2>{focusTimer ? focusTimer.purpose : 'Start a focused session'}</h2></div><Clock3 size={19} className="muted-icon"/></div>{!focusTimer?<form className="focus-start" onSubmit={event=>{event.preventDefault();setFocusTimer({purpose:focusPurpose.trim()||'Deep work',startedAt:Date.now(),accumulatedMs:0})}}><input aria-label="Focus session purpose" value={focusPurpose} onChange={event=>setFocusPurpose(event.target.value)} placeholder="What are you focusing on?" maxLength={120}/><button className="primary" type="submit"><Play size={16}/>Start focus</button></form>:<div className="focus-running"><strong>{formatElapsed(elapsedMs)}</strong><span>{focusTimer.startedAt?'Timer is running':'Timer is paused'}</span><div className="feature-actions">{focusTimer.startedAt?<button className="secondary" onClick={()=>setFocusTimer({...focusTimer,startedAt:null,accumulatedMs:focusTimer.accumulatedMs+Date.now()-focusTimer.startedAt!})}><Pause size={15}/>Pause</button>:<button className="secondary" onClick={()=>setFocusTimer({...focusTimer,startedAt:Date.now()})}><Play size={15}/>Resume</button>}<button className="primary" disabled={saving} onClick={()=>void finishFocus()}><StopCircle size={15}/>Finish and save</button><button className="text-button destructive-text" disabled={saving} onClick={()=>{setFocusTimer(null);setElapsedMs(0)}}>Discard</button></div></div>}</Panel>
    <Panel className="form-panel"><h2>{editing ? 'Edit activity' : 'Log an activity'}</h2><form className="feature-form activity-form" onSubmit={save}><FormField label="Activity"><input name="title" defaultValue={editing?.title ?? ''} placeholder="Study, workout, ride…" required maxLength={160} /></FormField><FormField label="Category"><input name="category" list="activity-categories" defaultValue={editing?.category ?? 'Personal'} maxLength={60} /><datalist id="activity-categories">{['Health','Fitness','Focus','Work','Business','Study','Coding','Learning','Reading','Travel','Adventure','Personal','Other'].map(item => <option key={item} value={item} />)}</datalist></FormField><FormField label="Date"><input name="activity_date" type="date" defaultValue={editing?.activity_date ?? userToday(userId)} required /></FormField><FormField label="Duration (minutes)"><input name="duration_minutes" type="number" min="0" max="1440" step="1" defaultValue={editing?.duration_minutes ?? ''} /></FormField><FormField label="Distance (km)"><input name="distance_km" type="number" min="0" step="0.01" defaultValue={editing?.distance_km ?? ''} /></FormField><FormField label="Quantity"><div className="input-pair"><input name="quantity" type="number" min="0" step="0.01" defaultValue={editing?.quantity ?? ''} /><input name="quantity_unit" placeholder="unit" defaultValue={editing?.quantity_unit ?? ''} maxLength={24} /></div></FormField><FormField label="Notes"><textarea name="notes" rows={2} defaultValue={editing?.notes ?? ''} maxLength={5000} /></FormField><div className="form-actions"><SubmitButton busy={saving}>{editing ? 'Save changes' : 'Save activity'}</SubmitButton>{editing && <button className="secondary" type="button" onClick={() => setEditing(null)}><X size={15} /> Cancel</button>}</div></form></Panel>
    <Panel className="history-panel"><div className="feature-panel-head"><div><div className="eyebrow">YOUR RECORDS</div><h2>Activity history</h2></div><span className="count">{filtered.length} shown</span></div><div className="filter-row"><label className="search-box"><Search size={16} /><input aria-label="Search activities" placeholder="Search activities…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></div>{busy ? <div className="loading-inline">Loading activity history…</div> : filtered.length === 0 ? <EmptyState title="No matching activities" body="Log an activity above. Your records will appear here." /> : <div className="activity-list">{filtered.map(row => <article className="activity-item" key={row.id}><div className="activity-date"><strong>{new Date(`${row.activity_date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><span>{row.activity_date.slice(0,4)}</span></div><div className="activity-info"><strong>{row.title}</strong><span>{row.category}{row.duration_minutes != null ? ` · ${row.duration_minutes} min` : ''}{row.distance_km != null ? ` · ${row.distance_km} km` : ''}</span>{row.notes && <p>{row.notes}</p>}</div><div className="activity-actions"><button className="icon-button" title="Edit activity" onClick={() => { setEditing(row); window.scrollTo({top:0,behavior:'smooth'}) }}><Pencil size={15} /></button><button className="icon-button" title="Delete activity" onClick={() => void remove(row)}><Trash2 size={15} /></button></div></article>)}</div>}</Panel>
  </>
}

function timerKey(userId:string){return `lifeos.focus-timer.v1.${userId}`}
function formatElapsed(milliseconds:number){const seconds=Math.floor(milliseconds/1000);const hours=Math.floor(seconds/3600);const minutes=Math.floor(seconds%3600/60);const remainder=seconds%60;return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`}
