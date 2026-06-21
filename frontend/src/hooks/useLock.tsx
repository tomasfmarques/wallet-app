import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth'

// "Unlocked this launch" flag. sessionStorage clears when the tab/PWA is closed,
// so a cold start re-locks (re-lock timing = launch only). A reload within the
// same session stays unlocked.
const UNLOCK_KEY = 'w360:unlocked'

/** Clear the unlock flag from anywhere (e.g. on logout, outside the provider). */
export function clearUnlockFlag(): void {
  try { sessionStorage.removeItem(UNLOCK_KEY) } catch { /* ignore */ }
}

interface LockState {
  locked: boolean       // PIN is set AND not yet unlocked this launch
  pinEnabled: boolean
  unlock: () => void
  lock: () => void
}

const LockContext = createContext<LockState | undefined>(undefined)

export function LockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const pinEnabled = !!user?.hasPin
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return sessionStorage.getItem(UNLOCK_KEY) === '1' } catch { return false }
  })

  const unlock = useCallback(() => {
    try { sessionStorage.setItem(UNLOCK_KEY, '1') } catch { /* ignore */ }
    setUnlocked(true)
  }, [])
  const lock = useCallback(() => {
    clearUnlockFlag()
    setUnlocked(false)
  }, [])

  return (
    <LockContext.Provider value={{ locked: pinEnabled && !unlocked, pinEnabled, unlock, lock }}>
      {children}
    </LockContext.Provider>
  )
}

export function useLock(): LockState {
  const ctx = useContext(LockContext)
  if (!ctx) throw new Error('useLock must be used within LockProvider')
  return ctx
}
