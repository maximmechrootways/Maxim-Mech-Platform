import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import {
  createProductFeedbackComment,
  deleteProductFeedback,
  fetchProductFeedback,
  retryProductFeedbackForward,
  submitProductFeedback,
  updateProductFeedback,
  type ProductFeedbackRecord,
} from '@/api/feedback'

const SCREENSHOT_TOKEN_PREFIX = '[[screenshot:'
const SCREENSHOT_TOKEN_SUFFIX = ']]'
const SCREENSHOT_TOKEN_REGEX = /\[\[screenshot:(data:image\/[a-zA-Z0-9.+-]+;base64,[^\]]+)\]\]/g
const MAX_FEEDBACK_TEXT_CHARS = 20000
const MAX_SCREENSHOT_DIMENSION = 1600
const SCREENSHOT_JPEG_QUALITY = 0.82
const MIN_SCREENSHOT_JPEG_QUALITY = 0.45
const MAX_SCREENSHOT_BASE64_LENGTH = 900_000
const MAX_FEEDBACK_COMMENT_CHARS = 4000

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read pasted image'))
    reader.readAsDataURL(file)
  })
}

function compressScreenshotDataUrl(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      let width = img.naturalWidth || img.width
      let height = img.naturalHeight || img.height
      if (!width || !height) {
        resolve(dataUrl)
        return
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }

      // Step down size/quality until the screenshot is a safer payload size.
      let quality = SCREENSHOT_JPEG_QUALITY
      let best = dataUrl
      for (let i = 0; i < 6; i += 1) {
        const scale = Math.min(1, MAX_SCREENSHOT_DIMENSION / Math.max(width, height))
        const targetWidth = Math.max(1, Math.round(width * scale))
        const targetHeight = Math.max(1, Math.round(height * scale))
        canvas.width = targetWidth
        canvas.height = targetHeight
        ctx.clearRect(0, 0, targetWidth, targetHeight)
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        const candidate = canvas.toDataURL('image/jpeg', quality)
        if (candidate.length < best.length) best = candidate
        if (best.length <= MAX_SCREENSHOT_BASE64_LENGTH) break

        quality = Math.max(MIN_SCREENSHOT_JPEG_QUALITY, quality - 0.1)
        width = Math.max(1, Math.round(targetWidth * 0.85))
        height = Math.max(1, Math.round(targetHeight * 0.85))
      }

      resolve(best)
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function parseFeedbackMessageWithScreenshots(raw: string) {
  const screenshots: string[] = []
  const text = raw.replace(SCREENSHOT_TOKEN_REGEX, (_full, dataUrl: string) => {
    screenshots.push(dataUrl)
    return ''
  }).trim()
  return { text, screenshots }
}

export function FeedbackPage() {
  const { user } = useUser()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [pastedScreenshots, setPastedScreenshots] = useState<string[]>([])

  const [allFeedback, setAllFeedback] = useState<ProductFeedbackRecord[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingMessage, setEditingMessage] = useState('')
  const [editingBusy, setEditingBusy] = useState(false)
  const [editingError, setEditingError] = useState<string | null>(null)
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [retryBusyId, setRetryBusyId] = useState<string | null>(null)
  const [commentDraftById, setCommentDraftById] = useState<Record<string, string>>({})
  const [commentErrorById, setCommentErrorById] = useState<Record<string, string | null>>({})
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null)
  const [showCompletedRequests, setShowCompletedRequests] = useState(false)

  const loadAll = async () => {
    if (!isOwnerOrHr) return
    setLoadingAll(true)
    setLoadError(null)
    try {
      const list = await fetchProductFeedback()
      setAllFeedback(list)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setLoadError(msg || 'Could not load feedback.')
    } finally {
      setLoadingAll(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [isOwnerOrHr])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed && pastedScreenshots.length === 0) {
      setSaveError('Please describe the problem or paste a screenshot before sending.')
      return
    }
    const screenshotTokens = pastedScreenshots.map((dataUrl) => `${SCREENSHOT_TOKEN_PREFIX}${dataUrl}${SCREENSHOT_TOKEN_SUFFIX}`)
    const messageToSend = [trimmed, screenshotTokens.join('\n')].filter(Boolean).join('\n\n')
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      await submitProductFeedback({
        message: messageToSend,
        pageUrl: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      })
      setMessage('')
      setPastedScreenshots([])
      setSaveSuccess('Thanks, your feedback was sent.')
      if (isOwnerOrHr) await loadAll()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setSaveError(msg || 'Could not send feedback right now.')
    } finally {
      setSaving(false)
    }
  }

  const handlePasteScreenshot = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    const dataUrls = await Promise.all(
      imageItems.map(async (item) => {
        const file = item.getAsFile()
        if (!file) return null
        const rawDataUrl = await readFileAsDataUrl(file)
        return await compressScreenshotDataUrl(rawDataUrl)
      })
    )
    const validDataUrls = dataUrls.filter((u): u is string => Boolean(u))
    if (validDataUrls.length === 0) return
    setSaveError(null)
    setSaveSuccess(`${validDataUrls.length} screenshot${validDataUrls.length > 1 ? 's' : ''} pasted. It will be sent with your feedback.`)
    setPastedScreenshots((prev) => [...prev, ...validDataUrls])
  }

  const beginEdit = (row: ProductFeedbackRecord) => {
    setEditingId(row.id)
    setEditingMessage(row.message)
    setEditingError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingMessage('')
    setEditingError(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const trimmed = editingMessage.trim()
    if (!trimmed) {
      setEditingError('Message cannot be empty.')
      return
    }
    setEditingBusy(true)
    setEditingError(null)
    try {
      const updated = await updateProductFeedback(editingId, { message: trimmed })
      setAllFeedback((prev) => prev.map((x) => (x.id === updated.id ? { ...updated, comments: x.comments } : x)))
      cancelEdit()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setEditingError(msg || 'Could not save feedback changes.')
    } finally {
      setEditingBusy(false)
    }
  }

  const toggleCompleted = async (row: ProductFeedbackRecord, nextCompleted: boolean) => {
    setToggleBusyId(row.id)
    try {
      const updated = await updateProductFeedback(row.id, { completed: nextCompleted })
      setAllFeedback((prev) => prev.map((x) => (x.id === updated.id ? { ...updated, comments: x.comments } : x)))
    } catch {
      // Keep UX simple; row status remains unchanged if request fails.
    } finally {
      setToggleBusyId(null)
    }
  }

  const handleDelete = async (row: ProductFeedbackRecord) => {
    if (!window.confirm(`Delete feedback from ${row.userName}? This cannot be undone.`)) return
    setDeletingId(row.id)
    try {
      await deleteProductFeedback(row.id)
      setAllFeedback((prev) => prev.filter((x) => x.id !== row.id))
      if (editingId === row.id) cancelEdit()
    } catch {
      // Keep UX simple; no-op on error.
    } finally {
      setDeletingId(null)
    }
  }

  const handleRetryForward = async (row: ProductFeedbackRecord) => {
    setRetryBusyId(row.id)
    try {
      const updated = await retryProductFeedbackForward(row.id)
      setAllFeedback((prev) => prev.map((x) => (x.id === updated.id ? { ...updated, comments: x.comments } : x)))
    } catch {
      // Keep UX simple; status line remains unchanged on failure.
    } finally {
      setRetryBusyId(null)
    }
  }

  const handleCommentSubmit = async (row: ProductFeedbackRecord) => {
    const draft = String(commentDraftById[row.id] || '')
    const trimmed = draft.trim()
    if (!trimmed) {
      setCommentErrorById((prev) => ({ ...prev, [row.id]: 'Comment cannot be empty.' }))
      return
    }
    setCommentBusyId(row.id)
    setCommentErrorById((prev) => ({ ...prev, [row.id]: null }))
    try {
      const created = await createProductFeedbackComment(row.id, { body: trimmed })
      setAllFeedback((prev) =>
        prev.map((x) =>
          x.id === row.id
            ? { ...x, comments: [...(Array.isArray(x.comments) ? x.comments : []), created] }
            : x
        )
      )
      setCommentDraftById((prev) => ({ ...prev, [row.id]: '' }))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setCommentErrorById((prev) => ({ ...prev, [row.id]: msg || 'Could not add comment.' }))
    } finally {
      setCommentBusyId(null)
    }
  }

  const inProcessFeedback = allFeedback.filter((f) => !f.completed)
  const completedFeedback = allFeedback.filter((f) => Boolean(f.completed))

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">Product feedback</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Tell us what is broken, confusing, or slow. We send this to the team right away.
        </p>
      </div>

      <Card padding="lg">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              What problem are you having?
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={(e) => { void handlePasteScreenshot(e) }}
              rows={6}
              maxLength={MAX_FEEDBACK_TEXT_CHARS}
              placeholder="Example: On Hazard Review, the Save button does not work after I add a signature."
              className="w-full min-h-[140px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              aria-label="Feedback message"
            />
          </label>
          {pastedScreenshots.length > 0 && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-900/30">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-2">Pasted screenshots</p>
              <div className="flex flex-wrap gap-2">
                {pastedScreenshots.map((src, idx) => (
                  <div key={`${idx}-${src.slice(0, 32)}`} className="relative">
                    <img src={src} alt={`Pasted screenshot ${idx + 1}`} className="h-24 w-auto rounded border border-neutral-200 dark:border-neutral-700 object-cover" />
                    <button
                      type="button"
                      onClick={() => setPastedScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-2 -right-2 rounded-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 px-1.5 py-0.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      aria-label={`Remove screenshot ${idx + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">{message.length}/{MAX_FEEDBACK_TEXT_CHARS} · {pastedScreenshots.length} screenshot{pastedScreenshots.length !== 1 ? 's' : ''} · paste with Ctrl+V</p>
            <Button type="submit" disabled={saving}>
              {saving ? 'Sending…' : 'Send feedback'}
            </Button>
          </div>
          {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{saveSuccess}</p>}
        </form>
      </Card>

      {isOwnerOrHr && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">All feedback responses</h2>
          {loadingAll ? (
            <p className="text-sm text-neutral-500">Loading feedback…</p>
          ) : loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : allFeedback.length === 0 ? (
            <p className="text-sm text-neutral-500">No feedback yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  In process: <span className="font-semibold text-neutral-900 dark:text-white">{inProcessFeedback.length}</span>
                  {' '}· Completed: <span className="font-semibold text-neutral-900 dark:text-white">{completedFeedback.length}</span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCompletedRequests((prev) => !prev)}
                >
                  {showCompletedRequests ? 'Hide completed requests' : `See completed requests (${completedFeedback.length})`}
                </Button>
              </div>

              {inProcessFeedback.length === 0 ? (
                <p className="text-sm text-neutral-500">No in-process feedback requests.</p>
              ) : (
                <ul className="space-y-3">
                  {inProcessFeedback.map((f) => (
                    <li key={f.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900/30">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">{f.userName}</span>
                        <span>{f.userRole}</span>
                        <span>{new Date(f.createdAt).toLocaleString()}</span>
                        {f.pageUrl ? <span>{f.pageUrl}</span> : null}
                      </div>
                      <label className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={Boolean(f.completed)}
                          disabled={toggleBusyId === f.id || editingBusy}
                          onChange={(e) => void toggleCompleted(f, e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300 text-brand-600"
                        />
                        <span>
                          Completed
                          {f.completedAt ? ` · ${new Date(f.completedAt).toLocaleString()}` : ''}
                        </span>
                      </label>
                      {editingId === f.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingMessage}
                            onChange={(e) => setEditingMessage(e.target.value)}
                            rows={4}
                            maxLength={MAX_FEEDBACK_TEXT_CHARS}
                            className="w-full min-h-[96px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                            aria-label="Edit feedback message"
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={saveEdit} disabled={editingBusy}>
                              {editingBusy ? 'Saving…' : 'Save'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit} disabled={editingBusy}>
                              Cancel
                            </Button>
                            <span className="text-xs text-neutral-500 ml-auto">{editingMessage.length}/{MAX_FEEDBACK_TEXT_CHARS}</span>
                          </div>
                          {editingError && <p className="text-sm text-red-600 dark:text-red-400">{editingError}</p>}
                        </div>
                      ) : (
                        (() => {
                          const parsed = parseFeedbackMessageWithScreenshots(f.message)
                          return (
                            <div className="mt-2 space-y-2">
                              {parsed.text && <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">{parsed.text}</p>}
                              {parsed.screenshots.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {parsed.screenshots.map((src, idx) => (
                                    <img key={`${f.id}-img-${idx}`} src={src} alt={`Feedback screenshot ${idx + 1}`} className="max-h-48 w-auto rounded border border-neutral-200 dark:border-neutral-700 object-contain" />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()
                      )}
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {f.forwardedAt
                          ? 'Forwarded by email'
                          : f.forwardError
                            ? `Email forward failed at submission time: ${f.forwardError}`
                            : 'Awaiting email forward'}
                      </p>
                      {editingId !== f.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => beginEdit(f)}>
                            Edit
                          </Button>
                          {f.forwardError && !f.forwardedAt && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleRetryForward(f)}
                              disabled={retryBusyId === f.id}
                            >
                              {retryBusyId === f.id ? 'Retrying…' : 'Retry email'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void handleDelete(f)}
                            disabled={deletingId === f.id}
                          >
                            {deletingId === f.id ? 'Deleting…' : 'Delete'}
                          </Button>
                        </div>
                      )}
                      <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-900/20">
                        <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-2">
                          Comments ({Array.isArray(f.comments) ? f.comments.length : 0})
                        </p>
                        {Array.isArray(f.comments) && f.comments.length > 0 ? (
                          <ul className="space-y-2 mb-3">
                            {f.comments.map((comment) => (
                              <li key={comment.id} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2">
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-wrap gap-x-2">
                                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{comment.authorName}</span>
                                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap mt-1">{comment.body}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-neutral-500 mb-3">No comments yet.</p>
                        )}
                        <div className="space-y-2">
                          <textarea
                            value={commentDraftById[f.id] || ''}
                            onChange={(e) => setCommentDraftById((prev) => ({ ...prev, [f.id]: e.target.value }))}
                            rows={2}
                            maxLength={MAX_FEEDBACK_COMMENT_CHARS}
                            placeholder={`Comment as ${user?.name || 'current user'}`}
                            className="w-full min-h-[64px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                            aria-label="Add feedback comment"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => void handleCommentSubmit(f)}
                              disabled={commentBusyId === f.id}
                            >
                              {commentBusyId === f.id ? 'Posting…' : 'Post comment'}
                            </Button>
                            <span className="text-xs text-neutral-500 ml-auto">
                              {(commentDraftById[f.id] || '').length}/{MAX_FEEDBACK_COMMENT_CHARS}
                            </span>
                          </div>
                          {commentErrorById[f.id] && (
                            <p className="text-sm text-red-600 dark:text-red-400">{commentErrorById[f.id]}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {showCompletedRequests && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Completed requests</h3>
                  {completedFeedback.length === 0 ? (
                    <p className="text-sm text-neutral-500">No completed feedback requests yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {completedFeedback.map((f) => (
                        <li key={f.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900/30">
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-medium text-neutral-700 dark:text-neutral-300">{f.userName}</span>
                            <span>{f.userRole}</span>
                            <span>{new Date(f.createdAt).toLocaleString()}</span>
                            {f.pageUrl ? <span>{f.pageUrl}</span> : null}
                          </div>
                          <label className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                            <input
                              type="checkbox"
                              checked={Boolean(f.completed)}
                              disabled={toggleBusyId === f.id || editingBusy}
                              onChange={(e) => void toggleCompleted(f, e.target.checked)}
                              className="h-4 w-4 rounded border-neutral-300 text-brand-600"
                            />
                            <span>
                              Completed
                              {f.completedAt ? ` · ${new Date(f.completedAt).toLocaleString()}` : ''}
                            </span>
                          </label>
                          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            {f.forwardedAt
                              ? 'Forwarded by email'
                              : f.forwardError
                                ? `Email forward failed at submission time: ${f.forwardError}`
                                : 'Awaiting email forward'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
