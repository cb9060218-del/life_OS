import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Flame, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { levelForXp } from '../lib/progression'
import type { PageProps } from '../app/FeatureHub'
import { EmptyState, Feedback, userDateOffset, userToday, PageHeader, Panel } from './shared'

type ActivityRow = { activity_date: string; category: string; duration_minutes: number | null }
type Completion = { completed_on: string; status: string }
type StreakResult={current_streak:number;best_streak:number}

export default function ProgressPage({ userId }: PageProps) {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [xp, setXp] = useState(0)
  const [challenges, setChallenges] = useState<{status:string}[]>([])
  const [streaks,setStreaks]=useState<StreakResult|null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const today = userToday(userId)
  const firstDate = userDateOffset(userId,-6)

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    const [activityResult, completionResult, xpResult, challengeResult, streakResult] = await Promise.all([
      supabase.from('activities').select('activity_date,category,duration_minutes').eq('user_id',userId).gte('activity_date',firstDate).lte('activity_date',today),
      supabase.from('routine_completions').select('completed_on,status').eq('user_id',userId).gte('completed_on',firstDate).lte('completed_on',today),
      supabase.rpc('get_current_total_xp'),
      supabase.from('challenges').select('status').eq('user_id',userId),
      supabase.rpc('get_routine_streaks'),
    ])
    const errors = [activityResult.error,completionResult.error,challengeResult.error].filter(Boolean)
    if (errors.length) setError(errors.map(item => item?.message).join(' · '))
    setActivities((activityResult.data ?? []) as ActivityRow[])
    setCompletions((completionResult.data ?? []) as Completion[])
    setChallenges((challengeResult.data ?? []) as {status:string}[])
    setStreaks(streakResult.error?null:streakResult.data as StreakResult)
    if (xpResult.error) {
      const { data, error: ledgerError } = await supabase.from('xp_events').select('amount').eq('user_id',userId)
      if (ledgerError) setError(ledgerError.message); else setXp(Math.max(0, (data ?? []).reduce((sum,row) => sum + row.amount,0)))
    } else setXp(Math.max(0, Number(xpResult.data ?? 0)))
    setBusy(false)
  },[userId,firstDate,today])
  useEffect(() => { void load() },[load])

  const days = useMemo(() => Array.from({length:7},(_,index) => {
    const date = userDateOffset(userId,-6+index)
    const records = activities.filter(item => item.activity_date === date)
    return {date,label:new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'}),minutes:records.reduce((sum,item)=>sum+(item.duration_minutes ?? 0),0),activityCount:records.length,tasks:completions.filter(item=>item.completed_on===date&&item.status==='completed').length}
  }),[activities,completions,today,userId])
  const maxMinutes = Math.max(1,...days.map(day=>day.minutes))
  const totalMinutes = activities.reduce((sum,item)=>sum+(item.duration_minutes ?? 0),0)
  const doneTasks = completions.filter(item=>item.status==='completed').length
  const activeChallenges = challenges.filter(item=>item.status==='active').length
  const progression = levelForXp(xp)
  const categories = [...activities.reduce((map,item)=>map.set(item.category,(map.get(item.category) ?? 0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]).slice(0,5)

  return <>
    <PageHeader eyebrow="YOUR LAST SEVEN DAYS" title="Progress" description="A source-based weekly review of your activity, routines, and current level." />
    <Feedback error={error} />
    {busy ? <Panel><div className="loading-inline">Calculating your weekly summary…</div></Panel> : <>
      <section className="feature-stats"><Metric icon={<Clock3 size={17}/>} title="Tracked time" value={`${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`} detail="Activity duration this week"/><Metric icon={<CheckCircle2 size={17}/>} title="Completed tasks" value={String(doneTasks)} detail="Dated routine completions"/><Metric icon={<Sparkles size={17}/>} title="Total XP" value={xp.toLocaleString()} detail={`Level ${progression.level} · ${Math.round(progression.progress)}% to next`}/><Metric icon={<Activity size={17}/>} title="Active challenges" value={String(activeChallenges)} detail="Currently in progress"/><Metric icon={<Flame size={17}/>} title="Current streak" value={String(streaks?.current_streak??'—')} detail={streaks?`Best: ${streaks.best_streak} days`:'Streak data unavailable'}/></section>
      <Panel className="chart-panel"><div className="feature-panel-head"><div><div className="eyebrow">DAILY TREND</div><h2>Time and task completions</h2></div><span className="count">{firstDate} – {today}</span></div>{activities.length===0&&completions.length===0?<EmptyState title="Your week is ready" body="Log activities and check off routine tasks to build this chart from your own records."/>:<div className="week-bars" role="img" aria-label="Bar chart of daily tracked minutes and completed tasks for the last seven days">{days.map(day=><div className="week-day" key={day.date}><div className="bar-pair"><span className="bar-minutes" style={{height:`${Math.max(day.minutes?5:0,day.minutes/maxMinutes*100)}%`}} title={`${day.minutes} tracked minutes`}/><span className="bar-tasks" style={{height:`${Math.max(day.tasks?5:0,day.tasks/Math.max(1,...days.map(item=>item.tasks))*100)}%`}} title={`${day.tasks} tasks completed`}/></div><strong>{day.label}</strong><small>{day.activityCount} logs · {day.tasks} tasks</small></div>)}</div>}<div className="chart-legend"><span><i className="legend-purple"/>Tracked minutes</span><span><i className="legend-green"/>Completed tasks</span></div></Panel>
      <Panel><div className="feature-panel-head"><div><div className="eyebrow">ACTIVITY MIX</div><h2>Top categories</h2></div><Flame size={18} className="muted-icon"/></div>{categories.length===0?<EmptyState title="No activity logged this week" body="Your category summary will appear after your first activity."/>:<div className="category-bars">{categories.map(([name,count])=><div className="category-row" key={name}><span>{name}</span><div className="progress-track"><i style={{width:`${count/Math.max(...categories.map(([,value])=>value))*100}%`}}/></div><strong>{count}</strong></div>)}</div>}</Panel>
    </>}
  </>
}

function Metric({icon,title,value,detail}:{icon:React.ReactNode;title:string;value:string;detail:string}){return <article className="stat-card feature-metric"><div className="stat-heading">{title}<span className="tiny-icon purple">{icon}</span></div><div className="stat-number">{value}</div><div className="stat-foot">{detail}</div></article>}
