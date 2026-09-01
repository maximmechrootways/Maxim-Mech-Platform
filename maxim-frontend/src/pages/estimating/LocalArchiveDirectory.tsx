import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatAxiosError } from '@/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  deleteLocalProject,
  fetchLocalProjectMatches,
  type LocalProjectMatch,
} from '@/api/localDocuments'

export function LocalArchiveDirectory() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState<LocalProjectMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchLocalProjectMatches()
      .then((rows) => setMatches(rows.filter((m) => !m.linked)))
      .catch((e: unknown) =>
        setError(
          formatAxiosError(e) ||
            'Could not reach the Local Archive (GX10). Check that the on-prem server is online and configured.'
        )
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const removeProject = async (name: string, fileCount: number) => {
    const ok = window.confirm(
      `Delete entire local archive project "${name}" (${fileCount} file${fileCount === 1 ? '' : 's'})?\n\nThis cannot be undone.`
    )
    if (!ok) return
    setBusy(name)
    setError(null)
    try {
      await deleteLocalProject(name)
      load()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Delete failed')
      setError(msg)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          Local Archive (Unlinked)
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">
          GX10 on-prem USB / field uploads that do not match a Maxim job title or site name yet.
          This is separate from cloud Project Documents. Linked projects appear under Current or Past Projects as Local Archive.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : error ? (
        <div className="space-y-3 rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-4">
          <p className="text-sm text-amber-950 dark:text-amber-100">{error}</p>
          <button type="button" onClick={load} className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline">
            Try again
          </button>
        </div>
      ) : matches.length === 0 ? (
        <Card padding="lg" className="text-sm text-neutral-500">
          No unlinked local projects. Everything on the GX10 is matched to a job, or the archive is empty.
        </Card>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <li key={m.gx10Project}>
              <Card padding="md" className="flex items-center justify-between gap-3">
                <Link
                  to={`/estimating/local-archive/${encodeURIComponent(m.gx10Project)}`}
                  className="min-w-0 flex-1 hover:opacity-90"
                >
                  <p className="font-medium text-neutral-900 dark:text-white">{m.gx10Project}</p>
                  <p className="text-sm text-neutral-500">{m.fileCount} file{m.fileCount === 1 ? '' : 's'}</p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/estimating/local-archive/${encodeURIComponent(m.gx10Project)}`)}
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={busy === m.gx10Project}
                    onClick={() => { void removeProject(m.gx10Project, m.fileCount) }}
                  >
                    {busy === m.gx10Project ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
