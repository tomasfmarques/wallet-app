import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

router.use(requireAuth)

// GET /api/quotes?symbols=NVDA,AAPL,...
// Proxy to Finnhub — keeps the API key server-side
router.get('/', async (req, res) => {
  const symbols = req.query.symbols as string | undefined
  if (!symbols) {
    res.status(400).json({ error: 'symbols query param required' })
    return
  }

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Finnhub API key not configured' })
    return
  }

  // TODO: fetch quotes for each symbol from Finnhub
  // GET https://finnhub.io/api/v1/quote?symbol=<ticker>&token=<apiKey>
  res.status(501).json({ error: 'Not implemented yet' })
})

export default router
