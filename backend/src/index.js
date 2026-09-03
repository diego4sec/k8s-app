import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { getLoggingState } from './lib/loggingState.js'
import entriesRouter from './routes/entries.js'
import loggingRouter from './routes/logging.js'

const app = express()

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost'
}))

app.use(express.json({ limit: '10kb' }))

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health'
}))

app.use(async (req, res, next) => {
  try {
    if (await getLoggingState()) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
    }
  } catch (err) {
    console.warn('Failed to read logging state:', err.message)
  }
  next()
})

app.use('/api/entries', entriesRouter)
app.use('/api/logging', loggingRouter)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  console.error('Unhandled request error:', err.message)
  res.status(err.status || 500).json({
    error: err.expose ? err.message : 'Internal server error'
  })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Backend listening on :${port}`))
