import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './i18n' // initialise i18next before any component renders
import './lib/chartSetup' // registers Chart.js scales/elements + sets defaults
import './index.css'
import { initObservability } from './lib/observability'

void initObservability() // no-op unless VITE_SENTRY_DSN is set (lazy-loads Sentry)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
