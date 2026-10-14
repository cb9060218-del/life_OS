import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, ArrowUpRight, Check, Compass, Flame, Home, LockKeyhole, LogOut, Plus, ShieldCheck, Sparkles, Target, Timer, Trophy, X } from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { levelForXp } from '../lib/progression'
import { checkPin, makePinVerifier } from '../lib/localPin'
import { userToday } from '../features/shared'
import { FeatureHub } from './FeatureHub'
import type { FeatureView } from './FeatureHub'

type Routine = { id: string; name: string; routine_tasks: Task[] }
type Task = { id: string; title: string; xp_reward: number; routine_completions: { status: string; completed_on: string }[] }
type CompletionResult = { completed: boolean; xp_awarded: number; total_xp: number }

const routinePresets = [
  { name: 'Easy morning', tasks: ['Drink a glass of water', 'Make the bed', 'Choose today’s top priority'] },
  { name: 'Study sprint', tasks: ['Put my phone away', 'Focus for 25 minutes', 'Write down what I learned'] },
  { name: 'Move a little', tasks: ['Get dressed to move', 'Walk or stretch for 10 minutes', 'Drink some water'] },
  { name: 'Calm evening', tasks: ['Tidy one small area', 'Prepare one thing for tomorrow', 'Write a quick reflection'] },
]

const nav: { name: string; id: FeatureView | 'today'; icon: typeof Home }[] = [{ name: 'Today', id: 'today', icon: Home }, { name: 'Routines', id: 'routines', icon: Check }, { name: 'Activities', id: 'activities', icon: Activity }, { name: 'Challenges', id: 'challenges', icon: Trophy }, { name: 'Progress', id: 'progress', icon: Target }]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pinMode, setPinMode] = useState<'checking' | 'setup' | 'unlock' | 'open'>('checking')
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [totalXp, setTotalXp] = useState(0)
  const [streaks, setStreaks] = useState<{current_streak:number;best_streak:number}|null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FeatureView | 'today'>('today')
  const [routineName, setRoutineName] = useState('')
  const [routineTasks, setRoutineTasks] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const key = unlockedSessionKey(data.session.user.id)
        if (sessionStorage.getItem(key) !== 'locked') sessionStorage.setItem(key, '1')
      }
      setSession(data.session); setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, current) => {
      if (current && event === 'SIGNED_IN') sessionStorage.setItem(unlockedSessionKey(current.user.id), 'locked')
      if (event === 'SIGNED_OUT' && session) sessionStorage.removeItem(unlockedSessionKey(session.user.id))
      setSession(current); setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setPinError('')
    setPinValue('')
    setPinConfirm('')
    if (!session) { setPinMode('checking'); return }
    const isExplicitlyLocked = sessionStorage.getItem(unlockedSessionKey(session.user.id)) === 'locked'
    const hasPin = Boolean(localStorage.getItem(pinStorageKey(session.user.id)))
    setPinMode(!hasPin ? 'setup' : isExplicitlyLocked ? 'unlock' : 'open')
  }, [session?.user.id])

  useEffect(() => { if (session && pinMode === 'open' && activeTab === 'today') void loadToday() }, [session?.user.id, pinMode, activeTab])

  async function loadToday() {
    if (!supabase || !session) return
    setBusy(true)
    const today = userToday(session.user.id)
    const [{ data, error }, { data: totalXpFromRpc, error: xpError }, {data:streakData,error:streakError}] = await Promise.all([
      supabase.from('routines').select('id,name,routine_tasks(id,title,xp_reward,routine_completions(status,completed_on))').eq('user_id', session.user.id).eq('is_archived', false).eq('routine_tasks.routine_completions.completed_on', today).order('sort_order').limit(12),
      supabase.rpc('get_current_total_xp'),
      supabase.rpc('get_routine_streaks'),
    ])
    if (error) setNotice(error.message)
    let xpTotal = Number(totalXpFromRpc ?? 0)
    let xpLoaded = !xpError
    if (xpError) {
      const { data: ledger, error: ledgerError } = await supabase.from('xp_events').select('amount').eq('user_id', session.user.id)
      if (ledgerError) setNotice(ledgerError.message)
      else { xpTotal = (ledger ?? []).reduce((sum, row) => sum + row.amount, 0); xpLoaded = true }
    }
    setRoutines((data ?? []) as Routine[])
    if (xpLoaded) {
      setTotalXp(Math.max(0, xpTotal))
      if (xpTotal < 0) setNotice('Your XP history needs a quick database repair. Your workspace is open and showing 0 XP until it is repaired.')
    }
    if (!streakError) setStreaks(streakData as {current_streak:number;best_streak:number})
    setBusy(false)
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setAuthError('')
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    if (!supabase) return
    if (password.length < 8) { setAuthError('Use a password with at least 8 characters.'); return }
    if (password !== confirmPassword) { setAuthError('The passwords do not match.'); return }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setAuthError(error.message); return }
    if (data.session) setAuthMessage('Your account is ready. You are signed in.')
    else setAuthMessage('Account created. Check your email for a verification link before signing in.')
  }

  async function savePin(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    setPinError('')
    if (!/^\d{4}$/.test(pinValue)) { setPinError('Choose exactly four digits.'); return }
    if (pinValue !== pinConfirm) { setPinError('Those PINs do not match.'); return }
    setPinBusy(true)
    try {
      localStorage.setItem(pinStorageKey(session.user.id), await makePinVerifier(pinValue))
      localStorage.removeItem(`${pinStorageKey(session.user.id)}:attempts`)
      setPinMode('unlock')
      setPinValue('')
      setPinConfirm('')
      setPinError('')
    } catch {
      setPinError('Your browser could not save a secure PIN. Try again in a supported browser.')
    } finally { setPinBusy(false) }
  }

  async function unlockWithPin(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    setPinError('')
    const verifier = localStorage.getItem(pinStorageKey(session.user.id))
    if (!verifier) { setPinMode('setup'); setPinError('Set a new four-digit PIN to continue.'); return }
    const failedAttempts = Number(localStorage.getItem(`${pinStorageKey(session.user.id)}:attempts`) ?? 0)
    if (failedAttempts >= 5) { setPinError('Too many incorrect tries. Use “Forgot PIN?” to sign in again and reset it.'); return }
    setPinBusy(true)
    try {
      if (await checkPin(pinValue, verifier)) {
        localStorage.removeItem(`${pinStorageKey(session.user.id)}:attempts`)
        sessionStorage.setItem(unlockedSessionKey(session.user.id), '1')
        setPinMode('open')
      } else {
        const attemptsKey = `${pinStorageKey(session.user.id)}:attempts`
        const attempts = Number(localStorage.getItem(attemptsKey) ?? 0) + 1
        localStorage.setItem(attemptsKey, String(attempts))
        if (attempts >= 5) {
          setPinError('Too many incorrect tries. Use “Forgot PIN?” to sign in again and reset it.')
          setPinValue('')
        } else setPinError('That PIN didn’t match. Try again.')
      }
    } catch { setPinError('PIN check failed. Try again.') }
    finally { setPinBusy(false) }
  }

  async function resetPinAndSignOut() {
    if (session) {
      localStorage.removeItem(pinStorageKey(session.user.id))
      localStorage.removeItem(`${pinStorageKey(session.user.id)}:attempts`)
    }
    await signOut()
  }

  async function signOut() {
    if (session) sessionStorage.removeItem(unlockedSessionKey(session.user.id))
    await supabase?.auth.signOut()
  }

  function lockApp() {
    if (session) sessionStorage.removeItem(unlockedSessionKey(session.user.id))
    setPinValue('')
    setPinError('')
    setPinMode('unlock')
  }

  async function completeTask(task: Task) {
    if (!supabase || !session || completingTask) return
    setNotice('')
    setCompletingTask(task.id)
    try {
      const isDone = task.routine_completions?.some(c => c.status === 'completed' && c.completed_on === userToday(session.user.id))
      const { data, error } = await supabase.rpc(isDone ? 'uncomplete_routine_task' : 'complete_routine_task', { p_task_id: task.id, p_completed_on: userToday(session.user.id) })
      if (error) {
        const missingUndoRpc = isDone && (error.code === 'PGRST202' || error.message.includes('uncomplete_routine_task'))
        const missingSettingsTable = error.message.includes('user_settings')
        setNotice(missingUndoRpc
          ? 'Task undo needs database migration 004. Apply the file supabase/migrations/202610140004_routine_completion_toggle.sql in Supabase, then refresh.'
          : missingSettingsTable
            ? 'Your Supabase project is missing its LifeOS settings table. Apply migrations 002 and 003, then reload; task undo uses the saved timezone from those settings.'
          : `Could not ${isDone ? 'undo' : 'complete'} this task: ${error.message}`)
        return
      }
      const result = data as CompletionResult
      setNotice(isDone ? 'Task unchecked. Its task XP was removed.' : result.xp_awarded ? `Task complete · +${result.xp_awarded} XP` : 'This task was already recorded for today.')
      setTotalXp(Math.max(0, result.total_xp))
      await loadToday()
    } catch (error) {
      setNotice(`Could not complete this task: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally { setCompletingTask(null) }
  }

  async function createRoutine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('routine') ?? '').trim()
    const taskNames = String(form.get('tasks') ?? '').split('\n').map(value => value.trim()).filter(Boolean)
    if (!name || taskNames.length === 0) { setNotice('Add a routine name and at least one task.'); return }
    const { data: routine, error } = await supabase.from('routines').insert({ user_id: session.user.id, name }).select('id').single()
    if (error || !routine) { setNotice(error?.message ?? 'Could not create routine.'); return }
    const { error: taskError } = await supabase.from('routine_tasks').insert(taskNames.map((title, sort_order) => ({ routine_id: routine.id, user_id: session.user.id, title, sort_order })))
    if (taskError) {
      await supabase.from('routines').delete().eq('id', routine.id).eq('user_id', session.user.id)
      setNotice(taskError.message)
    } else { setNotice('Routine created.'); formElement.reset(); setRoutineName(''); setRoutineTasks(''); await loadToday() }
  }

  if (!isSupabaseConfigured) return <Setup />
  if (loading) return <div className="loading">Loading your private workspace…</div>
  if (session && pinMode === 'checking') return <div className="loading">Unlocking your workspace…</div>
  if (session && pinMode === 'setup') return <PinScreen mode="setup" email={session.user.email ?? ''} pin={pinValue} setPin={setPinValue} confirm={pinConfirm} setConfirm={setPinConfirm} error={pinError} busy={pinBusy} onSubmit={savePin} onSignOut={() => void signOut()} />
  if (session && pinMode === 'unlock') return <PinScreen mode="unlock" email={session.user.email ?? ''} pin={pinValue} setPin={setPinValue} confirm={pinConfirm} setConfirm={setPinConfirm} error={pinError} busy={pinBusy} onSubmit={unlockWithPin} onSignOut={() => void resetPinAndSignOut()} />
  if (!session) return <main className="auth-screen"><section className="auth-card"><Brand /><div className="eyebrow">YOUR PRIVATE WORKSPACE</div><h1>{authMode === 'signin' ? 'Sign in to LifeOS' : 'Create your LifeOS account'}</h1><p className="muted">Your routines, progress, and personal records stay yours.</p><form onSubmit={authMode === 'signin' ? signIn : signUp} className="stack"><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={authMode === 'signup' ? 8 : undefined} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label>{authMode === 'signup' && <label>Confirm password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>}<button className="primary wide" type="submit">{authMode === 'signin' ? 'Sign in' : 'Create account'} <ArrowUpRight size={17} /></button></form>{authError && <p className="error" role="alert">{authError}</p>}{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<div className="auth-links">{authMode === 'signin' && <button className="text-button" onClick={async () => { setAuthError(''); setAuthMessage(''); if (supabase && email) { const { error } = await supabase.auth.resetPasswordForEmail(email); if (error) setAuthError(error.message); else setAuthMessage('Password reset link sent if the account exists.') } else setAuthError('Enter your email address first.') }}>Forgot password?</button>}<button className="text-button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthMessage('') }}>{authMode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></div></section></main>

  const tasks = routines.flatMap(routine => routine.routine_tasks.map(task => ({ ...task, routineName: routine.name })))
  const today = userToday(session.user.id)
  const done = tasks.filter(task => task.routine_completions?.some(c => c.status === 'completed' && c.completed_on === today)).length
  const percentage = tasks.length ? Math.round(done / tasks.length * 100) : 0
  const visibleXp = Math.max(0, totalXp)
  const progression = levelForXp(visibleXp)
  const firstName = session.user.email?.split('@')[0] ?? 'there'

  return <div className="app-shell">
    <aside className="sidebar"><Brand /><div className="eyebrow section-label">WORKSPACE</div><nav>{nav.map(({ name, id, icon: Icon }) => <button className={`nav-item ${activeTab === id ? 'selected' : ''}`} key={id} onClick={() => setActiveTab(id)}><Icon size={18} />{name}{activeTab === id && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="privacy"><ShieldCheck size={17} /><span>Private by design</span></div><div className="account"><div className="avatar">{firstName[0]?.toUpperCase()}</div><div className="account-text"><strong>{firstName}</strong><span>Personal account</span></div><button title="Lock LifeOS" className="icon-button" onClick={lockApp}><LockKeyhole size={17} /></button><button title="Sign out" className="icon-button" onClick={() => void signOut()}><LogOut size={17} /></button></div></div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="date-label">{format(new Date(), 'EEEE, MMMM d')}</div><div className="top-actions"><span className="connection"><i /> Synced</span><button className="avatar small avatar-button" title="Settings and profile" onClick={() => setActiveTab('profile')}>{firstName[0]?.toUpperCase()}</button><button className="icon-button mobile-lock" title="Lock LifeOS" onClick={lockApp}><LockKeyhole size={17} /></button></div></header>
      <div className="content">{activeTab === 'today' ? <><div className="welcome"><div><div className="eyebrow">YOUR DAILY OVERVIEW</div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {firstName}<span className="wave">✦</span></h1><p className="muted">A little progress, every day.</p></div><button className="secondary" onClick={() => document.getElementById('new-routine')?.scrollIntoView({ behavior: 'smooth' })}><Plus size={17} /> Add routine</button></div>
        {notice && <div className="notice"><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')}><X size={16} /></button></div>}
        <section className="stats"><article className="stat-card progress-card"><div className="stat-heading">TODAY'S PROGRESS <span className="tiny-icon purple"><Target size={16} /></span></div><div className="progress-row"><div className="ring" style={{ '--progress': `${percentage * 3.6}deg` } as React.CSSProperties}><div><strong>{tasks.length ? `${percentage}%` : '—'}</strong><span>{tasks.length ? 'complete' : 'no tasks'}</span></div></div><div className="progress-copy"><strong>{done} <span>/ {tasks.length}</span></strong><p>tasks completed</p><div className="progress-track"><i style={{ width: `${percentage}%` }} /></div></div></div></article><article className="stat-card"><div className="stat-heading">TOTAL EXPERIENCE <span className="tiny-icon gold"><Sparkles size={16} /></span></div><div className="stat-number">{visibleXp.toLocaleString()}<small> XP</small></div><div className="stat-foot">Level {progression.level} · {Math.max(0, progression.nextLevelXp - visibleXp)} XP to next level</div></article><article className="stat-card"><div className="stat-heading">CURRENT STREAK <span className="tiny-icon orange"><Flame size={16} /></span></div><div className="stat-number">{streaks?.current_streak ?? '—'}<small> days</small></div><div className="stat-foot">{streaks ? `Best streak: ${streaks.best_streak} days` : 'Streak summary unavailable'}</div></article></section>
        <section className="main-grid"><div className="panel routine-panel"><div className="panel-head"><div><div className="eyebrow">STAY ON TRACK</div><h2>Today's routines</h2></div><button className="secondary compact" onClick={() => document.getElementById('new-routine')?.scrollIntoView({ behavior: 'smooth' })}><Plus size={16} /> New</button></div>{busy ? <div className="empty">Loading routines…</div> : routines.length === 0 ? <div className="empty"><div className="empty-icon"><Check size={20} /></div><strong>Start with one small routine</strong><p>Add a routine and a few tasks to build your daily rhythm.</p><button className="text-button" onClick={() => document.getElementById('new-routine')?.scrollIntoView({ behavior: 'smooth' })}>Create your first routine <ArrowUpRight size={15} /></button></div> : routines.map(routine => <div className="routine" key={routine.id}><div className="routine-title"><span className="routine-mark"><Timer size={16} /></span><strong>{routine.name}</strong><span className="count">{routine.routine_tasks.filter(t => t.routine_completions?.some(c => c.status === 'completed' && c.completed_on === today)).length}/{routine.routine_tasks.length}</span></div>{routine.routine_tasks.map(task => { const isDone = task.routine_completions?.some(c => c.status === 'completed' && c.completed_on === today); return <button className={`task ${isDone ? 'task-done' : ''} ${completingTask === task.id ? 'task-pending' : ''}`} key={task.id} disabled={completingTask !== null} aria-label={`${isDone ? 'Uncheck' : 'Complete'} ${task.title}`} onClick={() => void completeTask(task)}><span className="checkmark">{completingTask === task.id ? '…' : isDone && <Check size={13} />}</span><span className="task-name">{task.title}</span><span className="reward">{completingTask === task.id ? 'Saving…' : isDone ? 'Undo' : `+${task.xp_reward} XP`}</span></button> })}</div>)}</div>
          <div className="right-column"><article className="panel focus-panel"><div className="eyebrow">MAKE SPACE FOR DEEP WORK</div><div className="focus-icon"><Timer size={21} /></div><h2>Focus on what matters</h2><p className="muted">Start, pause, and save a timer-based work session.</p><button className="primary" onClick={() => setActiveTab('activities')}>Open focus timer <Timer size={16} /></button></article><article className="panel challenge-panel"><div className="challenge-head"><span className="challenge-icon"><Compass size={16} /></span><span className="eyebrow">YOUR NEXT CHALLENGE</span></div><h3>Set a challenge</h3><p className="muted">Create a target and track your dated check-ins.</p><button className="text-button" onClick={() => setActiveTab('challenges')}>View challenges <ArrowUpRight size={15} /></button></article></div></section>
        <section className="panel create-panel" id="new-routine"><div><div className="eyebrow">MAKE TODAY YOURS</div><h2>Create a routine</h2><p className="muted">Pick a starter and change anything, or make your own.</p><div className="preset-list" aria-label="Routine starter templates">{routinePresets.map(preset => <button type="button" key={preset.name} className={`preset-chip ${routineName === preset.name ? 'selected' : ''}`} onClick={() => { setRoutineName(preset.name); setRoutineTasks(preset.tasks.join('\n')) }}>{preset.name}</button>)}</div></div><form onSubmit={createRoutine} className="create-form"><label>Routine name<input name="routine" value={routineName} onChange={event => setRoutineName(event.target.value)} placeholder="e.g. My morning reset" required maxLength={100} /></label><label>My tasks <span className="label-hint">One per line · edit these starters freely</span><textarea name="tasks" value={routineTasks} onChange={event => setRoutineTasks(event.target.value)} placeholder={'Drink a glass of water\nPlan the day\nRead for 10 minutes'} required rows={4} /></label><button className="primary" type="submit" disabled={busy || Boolean(completingTask)}><Plus size={17} /> Save routine</button></form></section>
        <footer>Plan <span>→</span> Act <span>→</span> Log <span>→</span> Improve <span className="footer-star">✦</span></footer></> : <FeatureHub view={activeTab} userId={session.user.id} onNavigate={setActiveTab} />}
      </div></main><div className="mobile-nav">{nav.map(({ name, id, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={activeTab === id ? 'active' : ''}><Icon size={19} /><span>{name}</span></button>)}</div>
  </div>
}

function Brand() { return <div className="brand"><div className="brand-icon"><Sparkles size={19} /></div><span>life<span className="brand-accent">os</span></span></div> }
function Setup() { return <main className="auth-screen"><section className="auth-card setup-card"><Brand /><div className="eyebrow">ONE QUICK SETUP STEP</div><h1>Connect your private workspace</h1><p className="muted">LifeOS stores your account and records in your own Supabase project. Add its project URL and public anon key to a local <code>.env</code> file, then restart the app.</p><div className="setup-box"><strong>Required settings</strong><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code></div><p className="muted small-copy">The browser uses only the public anon key. Never put a service role key in frontend configuration.</p></section></main> }

function pinStorageKey(userId: string) { return `lifeos.local-pin.v1.${userId}` }
function unlockedSessionKey(userId: string) { return `lifeos.unlocked-session.v1.${userId}` }

type PinScreenProps = {
  mode: 'setup' | 'unlock'
  email: string
  pin: string
  setPin: (value: string) => void
  confirm: string
  setConfirm: (value: string) => void
  error: string
  busy: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onSignOut: () => void
}

function PinScreen({ mode, email, pin, setPin, confirm, setConfirm, error, busy, onSubmit, onSignOut }: PinScreenProps) {
  const setup = mode === 'setup'
  const numericInput = (value: string) => value.replace(/\D/g, '').slice(0, 4)
  return <main className="auth-screen"><section className="auth-card pin-card"><Brand /><div className="eyebrow">{setup ? 'QUICK ACCESS' : 'WELCOME BACK'}</div><h1>{setup ? 'Create your four-digit PIN' : 'Enter your PIN'}</h1><p className="muted">{setup ? 'Your email and password secure your account. This PIN locks LifeOS on this device.' : `Signed in as ${email}`}</p><form onSubmit={onSubmit} className="stack"><label>{setup ? 'Four-digit PIN' : 'PIN'}<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={event => setPin(numericInput(event.target.value))} required autoComplete="off" aria-label={setup ? 'Choose a four-digit PIN' : 'Enter your four-digit PIN'} /></label>{setup && <label>Confirm PIN<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={confirm} onChange={event => setConfirm(numericInput(event.target.value))} required autoComplete="off" aria-label="Confirm your four-digit PIN" /></label>}<button className="primary wide" type="submit" disabled={busy}>{busy ? 'Checking…' : setup ? 'Save PIN' : 'Unlock LifeOS'} <LockKeyhole size={16} /></button></form>{error && <p className="error" role="alert">{error}</p>}<button className="text-button pin-signout" onClick={onSignOut}>{setup ? 'Sign out' : 'Forgot PIN? Sign in again'}</button><p className="pin-note">The PIN is stored as a salted verifier in this browser and is not a replacement for your account password.</p></section></main>
}
