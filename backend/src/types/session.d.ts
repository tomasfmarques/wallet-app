import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId?: string
    // Transient WebAuthn challenge (set during register/auth options, consumed on verify).
    webauthnChallenge?: string
  }
}
