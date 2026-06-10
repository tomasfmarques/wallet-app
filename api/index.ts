// Vercel serverless entry point.
//
// The whole Express app (built to backend/dist by the Vercel build step) is
// exported as the request handler. Vercel routes every /api/* request here via
// vercel.json; the SPA itself is served statically from the CDN.
//
// The app already detects Vercel (process.env.VERCEL) and skips app.listen()
// + static file serving, so importing it has no side effects here.
import app from '../backend/dist/index.js'

export default app
