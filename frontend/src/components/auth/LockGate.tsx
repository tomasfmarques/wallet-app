import { type ReactNode } from 'react'
import { useLock } from '@/hooks/useLock'
import { LockScreen } from './LockScreen'

// Renders the app-lock screen instead of the app when a PIN is set and the
// current launch hasn't been unlocked yet. Must sit inside AuthGuard (auth'd
// only) and inside LockProvider.
export function LockGate({ children }: { children: ReactNode }) {
  const { locked } = useLock()
  return locked ? <LockScreen /> : <>{children}</>
}

export default LockGate
