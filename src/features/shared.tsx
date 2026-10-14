import type { FormEvent, ReactNode } from 'react'
import { AlertCircle, Check, Plus, RefreshCw } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="welcome page-welcome"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel feature-panel ${className}`}>{children}</section> }

export function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return <div className={`feature-feedback ${error ? 'feature-error' : 'feature-success'}`} role={error ? 'alert' : 'status'}>{error ? <AlertCircle size={16} /> : <Check size={16} />}{error ?? success}</div>
}

export function SubmitButton({ children = 'Save', busy = false }: { children?: ReactNode; busy?: boolean }) {
  return <button className="primary" type="submit" disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}{busy ? 'Saving…' : children}</button>
}

export function FormField({ label, children }: { label: string; children: ReactNode }) { return <label className="feature-field">{label}{children}</label> }

export function asMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.' }

export function formValues(event: FormEvent<HTMLFormElement>) { return new FormData(event.currentTarget) }

export function isoToday(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(part=>[part.type,part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function userToday(userId:string) {
  return isoToday(localStorage.getItem(timezoneStorageKey(userId)) ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
}

export function timezoneStorageKey(userId:string) { return `lifeos.timezone.v1.${userId}` }

export function userDateOffset(userId:string,offset:number) {
  const today=userToday(userId);const [year,month,day]=today.split('-').map(Number)
  return new Date(Date.UTC(year,month-1,day+offset)).toISOString().slice(0,10)
}

export function EmptyState({ title, body }: { title: string; body: string }) { return <div className="feature-empty"><strong>{title}</strong><p>{body}</p></div> }
