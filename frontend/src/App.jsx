import { useState, useEffect } from 'react'

const PAGE_SIZE = 25

const EMPTY_PAGINATION = {
  offset: 0,
  limit: PAGE_SIZE,
  total: 0,
  hasMore: false,
  nextOffset: null,
  previousOffset: null
}

async function requestJson(path, options = {}) {
  const res = await fetch(path, options)
  let data = null

  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Server returned an invalid response')
  }

  return data
}

export default function App() {
  const [entries, setEntries] = useState([])
  const [id, setId] = useState('')
  const [value, setValue] = useState('')
  const [logging, setLogging] = useState(false)
  const [offset, setOffset] = useState(0)
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [togglingLogging, setTogglingLogging] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function fetchEntries() {
      setLoading(true)
      setLoadError('')

      try {
        const data = await requestJson(
          `/api/entries?limit=${PAGE_SIZE}&offset=${offset}`,
          { signal: controller.signal }
        )

        if (!Array.isArray(data.data)) {
          throw new Error('Server returned an invalid entries payload')
        }

        setEntries(data.data)
        setPagination(data.pagination || EMPTY_PAGINATION)
        if (typeof data.logging === 'boolean') {
          setLogging(data.logging)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setEntries([])
          setPagination(EMPTY_PAGINATION)
          setLoadError(err.message || 'Failed to load entries')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchEntries()

    return () => controller.abort()
  }, [offset, refreshKey])

  function refreshEntries() {
    setRefreshKey(key => key + 1)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const parsedId = Number(id)
    const trimmedValue = value.trim()

    setActionError('')
    setMessage('')

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setActionError('ID must be a positive integer.')
      return
    }

    if (!trimmedValue) {
      setActionError('Value must be a non-empty string.')
      return
    }

    setSubmitting(true)

    try {
      const data = await requestJson('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parsedId, value: trimmedValue })
      })

      if (typeof data.logging === 'boolean') {
        setLogging(data.logging)
      }

      setId('')
      setValue('')
      setMessage(`Entry ${parsedId} added.`)
      setOffset(0)
      refreshEntries()
    } catch (err) {
      setActionError(err.message || 'Failed to create entry')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(entryId) {
    if (!window.confirm(`Delete entry ${entryId}?`)) {
      return
    }

    setActionError('')
    setMessage('')
    setDeletingId(entryId)

    try {
      const data = await requestJson(`/api/entries/${entryId}`, { method: 'DELETE' })

      if (typeof data.logging === 'boolean') {
        setLogging(data.logging)
      }

      setMessage(`Entry ${entryId} deleted.`)
      if (entries.length === 1 && offset > 0) {
        setOffset(Math.max(offset - PAGE_SIZE, 0))
      } else {
        refreshEntries()
      }
    } catch (err) {
      setActionError(err.message || 'Failed to delete entry')
    } finally {
      setDeletingId('')
    }
  }

  async function handleToggleLogging() {
    setActionError('')
    setMessage('')
    setTogglingLogging(true)

    try {
      const data = await requestJson('/api/logging/toggle', { method: 'POST' })
      setLogging(data.logging)
      setMessage(`Logging ${data.logging ? 'enabled' : 'disabled'}.`)
    } catch (err) {
      setActionError(err.message || 'Failed to update logging')
    } finally {
      setTogglingLogging(false)
    }
  }

  function handlePageChange(nextOffset) {
    setMessage('')
    setActionError('')
    setOffset(nextOffset)
  }

  const firstVisibleEntry = pagination.total === 0 ? 0 : pagination.offset + 1
  const lastVisibleEntry = Math.min(
    pagination.offset + entries.length,
    pagination.total
  )

  return (
    <div className="container">
      <header>
        <h1>K8s App</h1>
        <button
          className={`toggle-btn ${logging ? 'active' : ''}`}
          onClick={handleToggleLogging}
          disabled={togglingLogging}
        >
          {togglingLogging ? 'Updating...' : `Logging: ${logging ? 'ON' : 'OFF'}`}
        </button>
      </header>

      <section className="form-section">
        <h2>Add Entry</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            placeholder="Numeric ID"
            value={id}
            onChange={e => setId(e.target.value)}
            min="1"
            step="1"
            disabled={submitting}
            required
          />
          <input
            type="text"
            placeholder="Text value"
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={submitting}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add'}
          </button>
        </form>
        {actionError && <p className="error" role="alert">{actionError}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </section>

      <section className="list-section">
        <div className="section-header">
          <h2>Entries</h2>
          <span className="entry-count">
            {loading
              ? 'Loading...'
              : `${firstVisibleEntry}-${lastVisibleEntry} of ${pagination.total}`}
          </span>
        </div>

        {loadError ? (
          <div className="state">
            <p className="error" role="alert">{loadError}</p>
            <button type="button" className="secondary-btn" onClick={refreshEntries}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="empty">Loading entries...</p>
        ) : entries.length === 0 ? (
          <p className="empty">No entries yet.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Value</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id}>
                      <td>{entry.id}</td>
                      <td>{entry.value}</td>
                      <td>
                        <button
                          className="delete-btn"
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                        >
                          {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handlePageChange(pagination.previousOffset)}
                disabled={pagination.previousOffset === null || loading}
              >
                Previous
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handlePageChange(pagination.nextOffset)}
                disabled={!pagination.hasMore || loading}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
