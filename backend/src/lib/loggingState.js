import redis from './redis.js'

const LOGGING_KEY = 'config:logging'

const TOGGLE_LOGGING_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == 'false' then
  redis.call('SET', KEYS[1], 'true')
  return 1
end
redis.call('SET', KEYS[1], 'false')
return 0
`

export async function getLoggingState() {
  const val = await redis.get(LOGGING_KEY)
  return val !== 'false'
}

export async function toggleLoggingState() {
  const logging = await redis.eval(TOGGLE_LOGGING_SCRIPT, {
    keys: [LOGGING_KEY],
    arguments: []
  })

  return Number(logging) === 1
}
