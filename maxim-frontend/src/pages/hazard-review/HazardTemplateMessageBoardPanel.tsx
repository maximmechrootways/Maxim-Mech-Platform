import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription } from '@/components/ui/Card'
import { useUser } from '@/contexts/UserContext'
import {
  fetchHazardCommentsForTemplate,
  postHazardComment,
  moderateHazardComment,
  type HazardComment,
} from '@/api/hazardReview'

type Props = {
  templateKey: string
  /** Shown in the card subtitle (e.g. role short label). */
  roleLabel: string
}

export function HazardTemplateMessageBoardPanel({ templateKey, roleLabel }: Props) {
  const { user } = useUser()
  const isHrOrOwner = user?.role === 'owner' || user?.role === 'hr'

  const [comments, setComments] = useState<HazardComment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [remarkDraftId, setRemarkDraftId] = useState<string | null>(null)
  const [remarkText, setRemarkText] = useState('')

  const refresh = useCallback(async () => {
    if (!templateKey) return
    const list = await fetchHazardCommentsForTemplate(templateKey)
    setComments(list)
  }, [templateKey])

  useEffect(() => {
    if (!templateKey) return
    let cancelled = false
    setLoadError(null)
    setLoading(true)
    ;(async () => {
      try {
        const list = await fetchHazardCommentsForTemplate(templateKey)
        if (!cancelled) setComments(list)
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } }; message?: string }
        if (!cancelled) setLoadError(err?.response?.data?.error || err?.message || 'Failed to load discussion')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [templateKey])

  async function handlePost() {
    const trimmed = draft.trim()
    if (!trimmed || !templateKey) return
    setPosting(true)
    try {
      await postHazardComment(trimmed, templateKey)
      setDraft('')
      await refresh()
    } finally {
      setPosting(false)
    }
  }

  async function handleDeleteComment(id: string) {
    if (!isHrOrOwner) return
    if (!window.confirm('Remove this comment from the board?')) return
    await moderateHazardComment(id, 'delete')
    await refresh()
  }

  async function handleSaveRemark(id: string) {
    const r = remarkText.trim()
    if (!r) return
    await moderateHazardComment(id, 'remark', r)
    setRemarkDraftId(null)
    setRemarkText('')
    await refresh()
  }

  return (
    <div id="hazard-messages" className="scroll-mt-6 space-y-3">
      <h2 className="text-lg font-semibold font-display tracking-tight text-neutral-900 dark:text-white">
        Message board
      </h2>
      <Card>
        <CardDescription className="mb-4">
          Discussion for {roleLabel}. Posts are specific to this hazard assessment. HR can delete posts or add remarks.
        </CardDescription>
      {loading && <p className="text-sm text-neutral-500 px-1 pb-2">Loading discussion…</p>}
      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400 px-1 pb-2" role="alert">
          {loadError}
        </p>
      )}
      {!loading && !loadError && (
        <>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-200 dark:divide-neutral-700 max-h-[min(480px,50vh)] overflow-y-auto">
            {comments.length === 0 && (
              <p className="p-4 text-sm text-neutral-500">No messages yet. Start the conversation below.</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm text-neutral-900 dark:text-white">{c.authorName}</span>
                  <time className="text-xs text-neutral-500" dateTime={c.createdAt}>
                    {new Date(c.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="text-sm text-neutral-800 dark:text-neutral-200 mt-2 whitespace-pre-wrap">{c.body}</p>
                {c.hrRemark && (
                  <div className="mt-3 rounded-md border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/30 px-3 py-2 text-sm">
                    <span className="text-xs text-neutral-500">
                      HR remark{c.hrRemarkByName ? ` · ${c.hrRemarkByName}` : ''}
                      {c.hrRemarkAt ? ` · ${new Date(c.hrRemarkAt).toLocaleString()}` : ''}
                    </span>
                    <p className="text-neutral-800 dark:text-neutral-200 mt-1 whitespace-pre-wrap">{c.hrRemark}</p>
                  </div>
                )}
                {isHrOrOwner && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleDeleteComment(c.id)}>
                      Delete
                    </Button>
                    {remarkDraftId === c.id ? (
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center flex-1 min-w-0">
                        <input
                          type="text"
                          value={remarkText}
                          onChange={(e) => setRemarkText(e.target.value)}
                          placeholder="HR remark…"
                          className="flex-1 min-w-0 rounded-lg border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-sm bg-white dark:bg-neutral-800"
                        />
                        <Button type="button" size="sm" onClick={() => handleSaveRemark(c.id)}>
                          Save remark
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setRemarkDraftId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRemarkDraftId(c.id)
                          setRemarkText(c.hrRemark ?? '')
                        }}
                      >
                        {c.hrRemark ? 'Edit remark' : 'Add remark'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">Add a comment</label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
              placeholder="Questions or notes about this hazard assessment…"
            />
            <Button type="button" className="mt-2" onClick={handlePost} disabled={posting || !draft.trim()}>
              {posting ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </>
      )}
      </Card>
    </div>
  )
}
