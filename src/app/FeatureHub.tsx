import { lazy, Suspense } from 'react'
import type { FeatureView } from './FeatureViews'

export type { FeatureView } from './FeatureViews'

const pages = {
  routines: lazy(() => import('../features/RoutinesPage')),
  activities: lazy(() => import('../features/ActivitiesPage')),
  challenges: lazy(() => import('../features/ChallengesPage')),
  progress: lazy(() => import('../features/ProgressPage')),
  profile: lazy(() => import('../features/ProfilePage')),
  health: lazy(() => import('../features/HealthPage')),
  goals: lazy(() => import('../features/GoalsPage')),
  journal: lazy(() => import('../features/JournalPage')),
  achievements: lazy(() => import('../features/AchievementsPage')),
} satisfies Record<FeatureView, React.LazyExoticComponent<React.ComponentType<PageProps>>>

export type PageProps = { userId: string; onNavigate: (view: FeatureView | 'today') => void }

export function FeatureHub({ view, userId, onNavigate }: PageProps & { view: FeatureView }) {
  const Page = pages[view]
  return <Suspense fallback={<div className="loading page-loading">Loading {view}…</div>}><Page userId={userId} onNavigate={onNavigate} /></Suspense>
}
