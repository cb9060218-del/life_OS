import { useCallback, useEffect, useState } from 'react'
import { Archive, Check, Pencil, Plus, RotateCcw, Timer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EmptyState, Feedback, FormField, formValues, userToday, PageHeader, Panel, SubmitButton } from './shared'
import type { PageProps } from '../app/FeatureHub'

type Task = { id: string; title: string; xp_reward: number; sort_order: number; is_archived: boolean; routine_completions: { status: string; completed_on: string }[] }
type Routine = { id: string; name: string; sort_order: number; is_archived: boolean; routine_tasks: Task[] }
type RpcResult = { xp_awarded: number; total_xp: number }

export default function RoutinesPage({ userId }: PageProps) {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [includeArchived, setIncludeArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    const today = userToday(userId)
    const { data, error: queryError } = await supabase.from('routines').select('id,name,sort_order,is_archived,routine_tasks(id,title,xp_reward,sort_order,is_archived,routine_completions(status,completed_on))').eq('user_id', userId).eq('routine_tasks.routine_completions.completed_on', today).order('sort_order')
    if (queryError) setError(queryError.message)
    setRoutines((data ?? []) as Routine[])
    setBusy(false)
  }, [userId])

  useEffect(() => { void load() }, [load])

  async function createRoutine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const values = formValues(event)
    const name = String(values.get('name') ?? '').trim()
    const taskNames = String(values.get('tasks') ?? '').split('\n').map(value => value.trim()).filter(Boolean)
    if (!name || taskNames.length === 0) { setError('Enter a routine name and at least one task.'); return }
    setSaving(true); setError(''); setSuccess('')
    const { data: routine, error: routineError } = await supabase.from('routines').insert({ user_id: userId, name }).select('id').single()
    if (routineError || !routine) { setError(routineError?.message ?? 'Could not create the routine.'); setSaving(false); return }
    const { error: tasksError } = await supabase.from('routine_tasks').insert(taskNames.map((title, sort_order) => ({ user_id: userId, routine_id: routine.id, title, sort_order })))
    if (tasksError) {
      await supabase.from('routines').delete().eq('id', routine.id).eq('user_id', userId)
      setError(tasksError.message)
    } else { setSuccess('Routine created.'); (event.currentTarget as HTMLFormElement).reset(); await load() }
    setSaving(false)
  }

  async function addTask(event: React.FormEvent<HTMLFormElement>, routineId: string, currentCount: number) {
    event.preventDefault(); if (!supabase) return
    const form = event.currentTarget
    const title = String(new FormData(form).get('task') ?? '').trim()
    if (!title) return
    setError(''); setSuccess('')
    const { error: writeError } = await supabase.from('routine_tasks').insert({ user_id: userId, routine_id: routineId, title, sort_order: currentCount })
    if (writeError) setError(writeError.message)
    else { setSuccess('Task added.'); form.reset(); await load() }
  }

  async function updateRoutine(id: string, values: Record<string, unknown>) {
    if (!supabase) return
    setError(''); setSuccess('')
    const { error: writeError } = await supabase.from('routines').update(values).eq('id', id).eq('user_id', userId)
    if (writeError) setError(writeError.message)
    else { setSuccess('Routine updated.'); await load() }
  }

  async function archiveTask(task: Task, archived: boolean) {
    if (!supabase) return
    const { error: writeError } = await supabase.from('routine_tasks').update({ is_archived: archived }).eq('id', task.id).eq('user_id', userId)
    if (writeError) setError(writeError.message); else { setSuccess(archived ? 'Task archived.' : 'Task restored.'); await load() }
  }

  async function renameTask(event: React.FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault(); if (!supabase) return
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim()
    if (!title) return
    const { error: writeError } = await supabase.from('routine_tasks').update({ title }).eq('id', task.id).eq('user_id', userId)
    if (writeError) setError(writeError.message)
    else { setSuccess('Task name updated.'); setEditingTask(null); await load() }
  }

  async function complete(task: Task, undo: boolean) {
    if (!supabase || completing) return
    setError(''); setSuccess('')
    setCompleting(task.id)
    try {
      const { data, error: writeError } = await supabase.rpc(undo ? 'uncomplete_routine_task' : 'complete_routine_task', { p_task_id: task.id, p_completed_on: userToday(userId) })
      if (writeError) {
        setError(undo && (writeError.code === 'PGRST202' || writeError.message.includes('uncomplete_routine_task'))
          ? 'Task undo needs database migration 004. Apply supabase/migrations/202610140004_routine_completion_toggle.sql in Supabase, then refresh.'
          : writeError.message)
        return
      }
      const result = data as RpcResult
      setSuccess(undo ? 'Task unchecked. Its task XP was removed.' : result.xp_awarded ? `Task completed · +${result.xp_awarded} XP` : 'Already completed today.')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this task. Please try again.') }
    finally { setCompleting(null) }
  }

  const shown = routines.filter(routine => includeArchived || !routine.is_archived)
  return <>
    <PageHeader eyebrow="YOUR DAILY SYSTEM" title="Routines" description="Build repeatable routines, adjust them over time, and keep every day’s completion history." action={<button className="secondary compact" onClick={() => setIncludeArchived(!includeArchived)}>{includeArchived ? 'Hide archived' : 'Show archived'}</button>} />
    <Feedback error={error} success={success} />
    <Panel className="form-panel"><h2>Create a routine</h2><form className="feature-form two-col" onSubmit={createRoutine}><FormField label="Routine name"><input name="name" placeholder="Morning reset" required maxLength={100} /></FormField><FormField label="Tasks · one per line"><textarea name="tasks" rows={3} placeholder={'Drink water\nPlan the day'} required /></FormField><SubmitButton busy={saving}>Create routine</SubmitButton></form></Panel>
    <div className="feature-list">{busy ? <Panel><div className="loading-inline">Loading routines…</div></Panel> : shown.length === 0 ? <Panel><EmptyState title="No routines yet" body="Create one above, then add and check off tasks as you go." /></Panel> : shown.map(routine => {
      const tasks = (routine.routine_tasks ?? []).filter(task => includeArchived || !task.is_archived)
      const completeCount = tasks.filter(task => task.routine_completions?.some(item => item.status === 'completed' && item.completed_on === userToday(userId))).length
      return <Panel key={routine.id} className={routine.is_archived ? 'muted-panel' : ''}><div className="feature-panel-head"><div><div className="eyebrow">{routine.is_archived ? 'ARCHIVED' : 'ROUTINE'}</div><h2>{routine.name}</h2></div><span className="count">{completeCount}/{tasks.length} today</span></div>
        <div className="feature-task-list">{tasks.map(task => { const done = task.routine_completions?.some(item => item.status === 'completed' && item.completed_on === userToday(userId)); return <div className="feature-task" key={task.id}><button className={`feature-task-toggle ${done ? 'checked' : ''}`} aria-label={`${done ? 'Uncheck' : 'Complete'} ${task.title}`} title={done ? 'Undo completion' : 'Mark complete'} disabled={Boolean(completing) || task.is_archived} onClick={() => void complete(task, done)}>{completing === task.id ? '…' : done && <Check size={14} />}</button>{editingTask === task.id ? <form className="rename-form task-rename" onSubmit={event => void renameTask(event, task)}><input autoFocus name="title" aria-label="Task name" defaultValue={task.title} maxLength={160} required /><button className="icon-button small-icon" title="Save task name"><Check size={15} /></button><button type="button" className="icon-button small-icon" title="Cancel edit" onClick={() => setEditingTask(null)}>×</button></form> : <><span className={done ? 'completed-text' : ''}>{task.title}</span><span className="reward">{done ? 'Undo' : `+${task.xp_reward} XP`}</span>{!task.is_archived && <button className="icon-button small-icon" title="Edit task name" onClick={() => setEditingTask(task.id)}><Pencil size={14} /></button>}</>}{!task.is_archived && <button className="icon-button small-icon" title="Archive task" onClick={() => void archiveTask(task, true)}><Archive size={15} /></button>}{includeArchived && task.is_archived && <button className="icon-button small-icon" title="Restore task" onClick={() => void archiveTask(task, false)}><RotateCcw size={15} /></button>}</div> })}</div>
        {!routine.is_archived && <form className="inline-add" onSubmit={event => void addTask(event, routine.id, tasks.length)}><input name="task" aria-label={`New task for ${routine.name}`} placeholder="Add a task…" required maxLength={160} /><button className="text-button" type="submit"><Plus size={15} /> Add task</button></form>}
        <div className="feature-actions"><form className="rename-form" onSubmit={event => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('name') ?? '').trim(); if (value) void updateRoutine(routine.id, { name: value }) }}><input name="name" defaultValue={routine.name} aria-label="Edit routine name" maxLength={100} /><button className="icon-button small-icon" title="Save routine name"><Pencil size={15} /></button></form><button className="text-button" onClick={() => void updateRoutine(routine.id, { is_archived: !routine.is_archived })}>{routine.is_archived ? <><RotateCcw size={15} /> Restore</> : <><Archive size={15} /> Archive routine</>}</button><span className="routine-source"><Timer size={14} /> Completions are stored by date</span></div>
      </Panel>
    })}</div>
  </>
}
