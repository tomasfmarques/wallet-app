import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { apiErrorMessage } from '@/lib/apiError'
import type { User } from '@/types'

// Type-only shim for the Google Identity Services global.
// Loaded by the <script> tag in index.html — may not be available yet on
// the very first render, so we poll for it.
interface GoogleCredentialResponse {
  credential: string
  select_by?: string
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string
    callback: (resp: GoogleCredentialResponse) => void
    auto_select?: boolean
    use_fedcm_for_prompt?: boolean
    cancel_on_tap_outside?: boolean
  }) => void
  prompt: () => void
  disableAutoSelect: () => void
  renderButton: (
    el: HTMLElement,
    config: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'small' | 'medium' | 'large'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number | string
      locale?: string
    },
  ) => void
}
type GlobalWithGoogle = {
  google?: { accounts?: { id?: GoogleAccountsId } }
}

function useGoogleSignIn() {
  const qc = useQueryClient()
  return useMutation<{ user: User }, ApiError, { credential: string }>(
    (input) => api.post<{ user: User }>('/api/auth/google', input),
    {
      onSuccess: (data) => {
        // Mirror the email/password flow: prime the /me cache
        qc.setQueryData(['auth', 'me'], data)
      },
    },
  )
}

interface Props {
  /** Button text variant. Use 'signup_with' on the signup page. */
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  /** Where to navigate on success. Default '/overview'. */
  redirectTo?: string
}

export function GoogleSignInButton({ text = 'continue_with', redirectTo = '/overview' }: Props) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  const buttonRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const navigate = useNavigate()
  const signIn = useGoogleSignIn()

  // Poll for the GSI library to load
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const g = (window as unknown as GlobalWithGoogle).google?.accounts?.id
      if (g) { setReady(true); return }
      setTimeout(tick, 100)
    }
    tick()
    return () => { cancelled = true }
  }, [clientId])

  // Initialize + render once GSI is loaded and we have a target div
  useEffect(() => {
    if (!ready || !clientId || !buttonRef.current) return
    const g = (window as unknown as GlobalWithGoogle).google!.accounts!.id!
    g.initialize({
      client_id: clientId,
      callback: async (resp) => {
        setErr(null)
        try {
          await signIn.mutateAsync({ credential: resp.credential })
          navigate(redirectTo, { replace: true })
        } catch (e) {
          setErr(apiErrorMessage(e))
        }
      },
      // Silently sign in a remembered account; show the chooser only when none
      // is remembered (One Tap). disableAutoSelect() on logout prevents an
      // instant re-sign right after an explicit logout.
      auto_select: true,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: true,
    })
    g.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 320,
      locale: 'pt',
    })
    // One Tap: auto-signs a remembered account, else prompts to choose.
    g.prompt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, clientId, text])

  // If Google isn't configured, render nothing — keeps the auth screen clean
  if (!clientId) return null

  return (
    <div className="gsi-wrap">
      <div ref={buttonRef} className="gsi-button" />
      {signIn.isLoading && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A entrar…</div>}
      {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  )
}

export default GoogleSignInButton
