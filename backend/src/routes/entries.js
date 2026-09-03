import { Router } from 'express'
import asyncHandler from '../lib/asyncHandler.js'
import { getLoggingState } from '../lib/loggingState.js'
import redis from '../lib/redis.js'

const router = Router()

const MAX_VALUE_LENGTH = 1000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const LEGACY_INDEX_KEY = 'entries:index'
const SORTED_INDEX_KEY = 'entries:index:by-id'

const CREATE_ENTRY_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], 'id') == 1 then
  return 0
end
redis.call('HSET', KEYS[1], 'id', ARGV[1], 'value', ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
redis.call('SADD', KEYS[3], ARGV[1])
return 1
`

function validateId(raw) {
  const num = Number(raw)
  return Number.isInteger(num) && num > 0 ? num : null
}

function parsePagination(query) {
  const limit = Number(query.limit ?? DEFAULT_LIMIT)
  const offset = Number(query.offset ?? 0)

  return {
    limit: Number.isInteger(limit) && limit > 0
      ? Math.min(limit, MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isInteger(offset) && offset >= 0 ? offset : 0
  }
}

function entryKey(id) {
  return `entry:${id}`
}

async function syncSortedIndexIfNeeded() {
  const [legacyCount, sortedCount] = await Promise.all([
    redis.sCard(LEGACY_INDEX_KEY),
    redis.zCard(SORTED_INDEX_KEY)
  ])

  if (legacyCount === 0 || sortedCount >= legacyCount) {
    return
  }

  const ids = await redis.sMembers(LEGACY_INDEX_KEY)
  const scoredIds = ids
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)
    .map(id => ({ score: id, value: String(id) }))

  if (scoredIds.length > 0) {
    await redis.zAdd(SORTED_INDEX_KEY, scoredIds)
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query)

  await syncSortedIndexIfNeeded()

  const total = await redis.zCard(SORTED_INDEX_KEY)
  const ids = total > offset
    ? await redis.zRange(SORTED_INDEX_KEY, offset, offset + limit - 1)
    : []
  const entries = await Promise.all(ids.map(id => redis.hGetAll(entryKey(id))))
  const data = entries.filter(entry => entry && entry.id)
  const hasMore = offset + ids.length < total

  res.json({
    data,
    pagination: {
      offset,
      limit,
      total,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      previousOffset: offset > 0 ? Math.max(offset - limit, 0) : null
    },
    logging: await getLoggingState()
  })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const numId = validateId(req.params.id)
  if (!numId) return res.status(400).json({ error: 'id must be a positive integer' })

  const entry = await redis.hGetAll(entryKey(numId))
  if (!entry || !entry.id) return res.status(404).json({ error: 'Not found' })
  res.json({ data: entry, logging: await getLoggingState() })
}))

router.post('/', asyncHandler(async (req, res) => {
  const { id, value } = req.body
  const numId = validateId(id)
  if (!numId) return res.status(400).json({ error: 'id must be a positive integer' })

  if (!value || typeof value !== 'string' || !value.trim()) {
    return res.status(400).json({ error: 'value must be a non-empty string' })
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return res.status(400).json({ error: `value exceeds maximum length of ${MAX_VALUE_LENGTH}` })
  }

  const trimmedValue = value.trim()
  const created = await redis.eval(CREATE_ENTRY_SCRIPT, {
    keys: [entryKey(numId), SORTED_INDEX_KEY, LEGACY_INDEX_KEY],
    arguments: [String(numId), trimmedValue, String(numId)]
  })

  if (Number(created) !== 1) {
    return res.status(409).json({ error: `Entry with id ${numId} already exists` })
  }

  res.status(201).json({
    data: { id: String(numId), value: trimmedValue },
    logging: await getLoggingState()
  })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const numId = validateId(req.params.id)
  if (!numId) return res.status(400).json({ error: 'id must be a positive integer' })

  const id = String(numId)
  const exists = await redis.hExists(entryKey(id), 'id')
  if (!exists) return res.status(404).json({ error: 'Not found' })

  await redis
    .multi()
    .del(entryKey(id))
    .zRem(SORTED_INDEX_KEY, id)
    .sRem(LEGACY_INDEX_KEY, id)
    .exec()

  res.json({ message: 'deleted', logging: await getLoggingState() })
}))

export default router
