import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CircleCheck, Pause, Play, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PageProps } from '../app/FeatureHub'
import { EmptyState, Feedback, FormField, formValues, userToday, PageHeader, Panel, SubmitButton } from './shared'

type Checkin = { id: string; checked_on: string; value: number; notes: string }
type Challenge = { id: string; title: string; description: string; category: string; difficulty: string; target_count: number; starts_on: string; ends_on: string; status: string; challenge_checkins: Checkin[] }

export default function ChallengesPage({ userId }: PageProps) {
  const [rows, setRows] = useState<Challenge[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    const { data, error: queryError } = await supabase.from('challenges').select('id,title,description,category,difficulty,target_count,starts_on,ends_on,status,challenge_checkins(id,checked_on,value,notes)').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    if (queryError) setError(queryError.message)
    setRows((data ?? []) as Challenge[])
    setBusy(false)
  }, [userId])
  useEffect(() => { void load() }, [load])

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const values = formValues(event)
    const start = String(values.get('starts_on') ?? userToday(userId))
    const payload = { user_id: userId, title: String(values.get('title') ?? '').trim(), description: String(values.get('description') ?? '').trim(), category: String(values.get('category') ?? 'Personal'), difficulty: String(values.get('difficulty') ?? 'medium'), target_count: Number(values.get('target_count')), starts_on: start, ends_on: String(values.get('ends_on') ?? '') }
    if (payload.ends_on < start) { setError('Challenge end date must be on or after its start date.'); return }
    setSaving(true); setError(''); setSuccess('')
    const { error: writeError } = await supabase.from('challenges').insert(payload)
    if (writeError) setError(writeError.message)
    else { setSuccess('Challenge created.'); (event.currentTarget as HTMLFormElement).reset(); await load() }
    setSaving(false)
  }

  async function checkIn(challenge: Challenge) {
    if (!supabase) return
    setError(''); setSuccess('')
    const { error: writeError } = await supabase.from('challenge_checkins').insert({ challenge_id: challenge.id, user_id: userId, checked_on: userToday(userId), value: 1 })
    if (writeError) setError(writeError.code === '23505' ? 'You already checked in for this challenge today.' : writeError.message)
    else { setSuccess('Check-in recorded.'); await load() }
  }

  async function changeStatus(challenge: Challenge, status: string) {
    if (!supabase) return
    if (status === 'abandoned' && !window.confirm(`Abandon “${challenge.title}”? Its check-ins will be kept.`)) return
    const { error: writeError } = await supabase.from('challenges').update({ status }).eq('id', challenge.id).eq('user_id', userId)
    if (writeError) setError(writeError.message); else { setSuccess(`Challenge ${status}.`); await load() }
  }

  return <>
    <PageHeader eyebrow="COMMIT TO A TARGET" title="Challenges" description="Set a measurable target, check in once each day, and keep a record of every attempt." />
    <Feedback error={error} success={success} />
    <Panel className="form-panel"><h2>Create a challenge</h2><form className="feature-form challenge-form" onSubmit={create}><FormField label="Name"><input name="title" placeholder="Read every day" required maxLength={160} /></FormField><FormField label="Target check-ins"><input name="target_count" type="number" min="1" max="10000" defaultValue="7" required /></FormField><FormField label="Category"><input name="category" defaultValue="Personal" maxLength={60} /></FormField><FormField label="Difficulty"><select name="difficulty" defaultValue="medium"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></FormField><FormField label="Start date"><input name="starts_on" type="date" defaultValue={userToday(userId)} required /></FormField><FormField label="End date"><input name="ends_on" type="date" defaultValue={new Date(Date.now() + 6 * 86400000).toISOString().slice(0,10)} required /></FormField><FormField label="Description"><textarea name="description" rows={2} maxLength={2000} /></FormField><SubmitButton busy={saving}>Create challenge</SubmitButton></form></Panel>
    <div className="feature-list">{busy ? <Panel><div className="loading-inline">Loading challenges…</div></Panel> : rows.length === 0 ? <Panel><EmptyState title="No challenges yet" body="Set a target above and add one check-in each day you make progress." /></Panel> : rows.map(row => {
      const progress = row.challenge_checkins.reduce((sum, item) => sum + Number(item.value), 0)
      const percent = Math.min(100, Math.round(progress / row.target_count * 100))
      const checkedToday = row.challenge_checkins.some(item => item.checked_on === userToday(userId))
      const active = row.status === 'active'
      const remaining = Math.max(0, Math.ceil((new Date(`${row.ends_on}T23:59:59`).getTime() - Date.now()) / 86400000))
      return <Panel key={row.id} className="challenge-card"><div className="feature-panel-head"><div><div className="eyebrow">{row.category.toUpperCase()} · {row.difficulty.toUpperCase()}</div><h2>{row.title}</h2></div><span className={`status-pill status-${row.status}`}>{row.status}</span></div>{row.description && <p className="feature-description">{row.description}</p>}<div className="challenge-metrics"><strong>{progress}<span> / {row.target_count}</span></strong><span><CalendarDays size={14} /> {remaining} days left</span></div><div className="feature-progress"><i style={{width:`${percent}%`}} /></div><p className="subtle-copy">{percent}% complete · {row.challenge_checkins.length} dated check-ins</p><div className="feature-actions">{active && progress < row.target_count && <button className="primary" disabled={checkedToday || row.starts_on > userToday(userId)} onClick={() => void checkIn(row)}><CircleCheck size={16} />{checkedToday ? 'Checked in today' : 'Check in today'}</button>}{active && progress >= row.target_count && <button className="primary" onClick={() => void changeStatus(row,'completed')}><Trophy size={16} />Mark complete</button>}{active && <button className="secondary" onClick={() => void changeStatus(row,'paused')}><Pause size={15} />Pause</button>}{row.status === 'paused' && <button className="secondary" onClick={() => void changeStatus(row,'active')}><Play size={15} />Resume</button>}{!['completed','abandoned','failed'].includes(row.status) && <button className="text-button destructive-text" onClick={() => void changeStatus(row,'abandoned')}>Abandon</button>}</div><div className="checkin-dates">{row.challenge_checkins.slice(0,8).map(item => <span key={item.id} title={item.notes || item.checked_on}>{item.checked_on.slice(5)}</span>)}</div></Panel>
    })}</div>
  </>
}
