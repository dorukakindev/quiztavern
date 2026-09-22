import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ActivityApp } from './activity/ActivityApp'
import { ActivityErrorBoundary } from './activity/ActivityErrorBoundary'
import './activity/activity.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivityErrorBoundary><ActivityApp /></ActivityErrorBoundary>
  </StrictMode>,
)
