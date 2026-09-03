import { Router } from 'express'
import asyncHandler from '../lib/asyncHandler.js'
import { getLoggingState, toggleLoggingState } from '../lib/loggingState.js'

const router = Router()

router.get('/status', asyncHandler(async (req, res) => {
  res.json({ logging: await getLoggingState() })
}))

router.post('/toggle', asyncHandler(async (req, res) => {
  res.json({ logging: await toggleLoggingState() })
}))

export default router
