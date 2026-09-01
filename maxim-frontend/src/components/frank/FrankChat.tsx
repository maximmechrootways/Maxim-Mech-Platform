import { useState, useRef, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useFrank } from '@/contexts/FrankContext'
import { useUser } from '@/contexts/UserContext'
import { useAuth } from '@/contexts/AuthContext'
import { getAuthToken, apiPath } from '@/api'
import { fetchLocalDocumentBlob } from '@/api/localDocuments'
import { Button } from '@/components/ui/Button'
import { BeamsBackground } from '@/components/ui/beams-background'
import { FileViewer, type FileViewerSource } from '@/components/files/FileViewer'

const INITIAL_MESSAGE = {
  id: 'frank-init',
  role: 'assistant' as const,
  text: "Hi, I'm Frank. Ask me about your team, jobs, certs, incidents, safety docs, or anything else in Maxim.",
  sources: [] as string[]
}

/** A document Frank retrieved passages from while answering (cloud library or on-prem local archive). */
type DocumentCitation = {
  documentName: string
  source: 'cloud' | 'local'
  /** Project (top-level archive folder) the document belongs to, if any. */
  project?: string
  pageNumber?: number | null
  documentId?: string
  /** Same-origin backend proxy path for local archive files (preview/download). */
  fileUrl?: string
}

function collectCitations(toolName: string, result: unknown, into: Map<string, DocumentCitation>) {
  if (toolName !== 'search_documents' && toolName !== 'search_local_documents') return
  const payload = result as { found?: boolean; results?: Array<Record<string, unknown>> } | undefined
  if (!payload?.found || !Array.isArray(payload.results)) return
  for (const r of payload.results) {
    const documentName = typeof r.documentName === 'string' ? r.documentName : null
    if (!documentName) continue
    const source: 'cloud' | 'local' = r.source === 'local' ? 'local' : 'cloud'
    const project = typeof r.project === 'string' && r.project ? r.project : undefined
    const documentId = typeof r.documentId === 'string' ? r.documentId : undefined
    const key = `${source}:${project ?? ''}:${documentName}`
    if (into.has(key)) continue
    into.set(key, {
      documentName,
      source,
      project,
      documentId,
      pageNumber: typeof r.pageNumber === 'number' ? r.pageNumber : undefined,
      fileUrl: typeof r.fileUrl === 'string' ? r.fileUrl : undefined,
    })
  }
}

export function FrankChat() {
  const { isOpen, closeChat } = useFrank()
  const { user } = useUser()
  const { session } = useAuth()
  const canUseFrank = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; text: string; sources?: string[]; citations?: DocumentCitation[]; hiddenTurns?: any[] }[]>([INITIAL_MESSAGE])
  const [frankHistory, setFrankHistory] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendUnavailable, setBackendUnavailable] = useState(false)
  const [autoReadEnabled, setAutoReadEnabled] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [viewerSource, setViewerSource] = useState<FileViewerSource | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastUserIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastAutoSpokenIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioObjectUrlRef = useRef<string | null>(null)

  // Close Frank and reset chat when user logs out or switches accounts
  useEffect(() => {
    const currentUserId = session?.userId ?? null
    if (lastUserIdRef.current !== null && currentUserId !== lastUserIdRef.current) {
      closeChat()
      setMessages([INITIAL_MESSAGE])
      setFrankHistory([])
      setInput('')
      setError(null)
      setActiveTool(null)
    }
    lastUserIdRef.current = currentUserId
  }, [session?.userId, closeChat])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen && canUseFrank) {
      inputRef.current?.focus()
    }
  }, [isOpen, canUseFrank])

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current)
      audioObjectUrlRef.current = null
    }
    setSpeakingId(null)
  }

  const speakMessage = async (messageId: string, text: string) => {
    const cleaned = text.trim()
    if (!cleaned) return
    if (speakingId === messageId) {
      stopSpeaking()
      return
    }
    const token = getAuthToken()
    if (!token) return
    try {
      const response = await fetch(apiPath('/frank/tts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: cleaned }),
      })
      if (!response.ok) {
        let details = 'TTS unavailable'
        try {
          const payload = await response.json() as { error?: string; details?: string }
          details = payload.details || payload.error || details
        } catch { }
        throw new Error(details)
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('Empty TTS audio')
      stopSpeaking()
      const objectUrl = URL.createObjectURL(blob)
      audioObjectUrlRef.current = objectUrl
      const audio = new Audio(objectUrl)
      audioRef.current = audio
      setSpeakingId(messageId)
      audio.onended = () => {
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current)
          audioObjectUrlRef.current = null
        }
        audioRef.current = null
        setSpeakingId((current) => (current === messageId ? null : current))
      }
      audio.onerror = () => {
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current)
          audioObjectUrlRef.current = null
        }
        audioRef.current = null
        setSpeakingId((current) => (current === messageId ? null : current))
      }
      await audio.play()
    } catch { }
  }

  useEffect(() => {
    if (!isOpen) stopSpeaking()
  }, [isOpen])

  useEffect(() => {
    if (!autoReadEnabled || !isOpen || loading) return
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.id !== 'frank-init' && msg.text.trim().length > 0)
    if (!lastAssistantMessage) return
    if (lastAutoSpokenIdRef.current === lastAssistantMessage.id) return
    lastAutoSpokenIdRef.current = lastAssistantMessage.id
    void speakMessage(lastAssistantMessage.id, lastAssistantMessage.text)
  }, [messages, loading, isOpen, autoReadEnabled])

  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  if (!session) return null
  if (!canUseFrank) return null

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    // Build the message array to send: start from stored history (which includes all tool_use/tool_result blocks),
    // then append the new user message. This preserves Anthropic's required message structure exactly.
    const outgoingMessages = [
      ...frankHistory,
      { role: 'user' as const, content: text }
    ]

    // FIX 1: Use nanoid() for collision-proof IDs
    const userMsgId = nanoid()
    const assistantId = nanoid()

    setInput('')
    setMessages((m) => [...m, { id: userMsgId, role: 'user', text }])
    setLoading(true)
    setError(null)
    setActiveTool(null)
    setMessages((m) => [...m, { id: assistantId, role: 'assistant', text: '', sources: ['Frank'] }])

    const token = getAuthToken()
    const url = apiPath('/frank')
    // FIX 2: Use the pre-captured snapshot, not stale React state
    const body = JSON.stringify({ messages: outgoingMessages })

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      })
      if (!res.ok || !res.body) {
        throw new Error(res.status === 503 ? 'Frank is not configured.' : res.statusText || 'Request failed')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let currentEvent = ''
      /** Coalesce: one notification refetch per reply, not one per `create_hr_todo` tool in a batch. */
      let frankReminderToolRan = false
      /** Documents Frank pulled passages from this turn, deduped by source+name. */
      const citationMap = new Map<string, DocumentCitation>()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.slice(7).trim()
          else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>
              if (currentEvent === 'text' && typeof data.text === 'string') {
                accumulated += data.text
                setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, text: accumulated } : msg)))
              } else if (currentEvent === 'tool_call' && typeof data.name === 'string') {
                setActiveTool(data.name)
              } else if (currentEvent === 'tool_result') {
                if (typeof data.name === 'string' && data.name === 'create_hr_todo') {
                  frankReminderToolRan = true
                }
                if (typeof data.name === 'string') {
                  collectCitations(data.name, data.result, citationMap)
                }
                setActiveTool(null)
              } else if (currentEvent === 'done') {
                // Store the full Anthropic history for the next turn — pass back verbatim, no reconstruction
                if (Array.isArray(data.history)) {
                  setFrankHistory(data.history)
                }
                setMessages((m) => m.map((msg) => {
                  if (msg.id === assistantId) {
                    return {
                      ...msg,
                      text: (!accumulated && typeof data.text === 'string' && data.text) ? data.text : msg.text,
                      citations: citationMap.size > 0 ? Array.from(citationMap.values()) : msg.citations,
                    }
                  }
                  return msg
                }))
                if (frankReminderToolRan) {
                  window.dispatchEvent(new CustomEvent('frank:reminder-created'))
                }
              } else if (currentEvent === 'error' && typeof data.message === 'string') {
                setError(data.message)
              }
            } catch (_) { }
            currentEvent = ''
          }
        }
      }
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : 'Something went wrong.'
      if (errMessage.includes('Frank is not configured') || errMessage.includes('503')) {
        setBackendUnavailable(true)
      }
      setError(errMessage)
      setMessages((m) => m.map((msg) =>
        msg.id === assistantId ? { ...msg, text: 'Something went wrong. Please try again.' } : msg
      ))
    } finally {
      setLoading(false)
      setActiveTool(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed left-4 right-4 bottom-4 md:left-auto md:right-4 md:w-full md:max-w-md z-[95] h-[calc(100vh-5rem)] max-h-[600px] flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-500/30 backdrop-blur-xl shadow-soft-lg dark:shadow-dark-glow animate-slide-up safe-bottom overflow-hidden">
      <BeamsBackground
        intensity="strong"
        layout="container"
        className="bg-transparent dark:bg-transparent"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold tracking-tight">Frank</span>
              <span className="text-xs opacity-90">AI Assistant</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoReadEnabled}
                aria-label={autoReadEnabled ? 'Turn voice off' : 'Turn voice on'}
                title={
                  autoReadEnabled
                    ? 'Voice is on — Frank reads answers out loud. Click to turn off.'
                    : 'Voice is off — Frank stays quiet. Click to turn on.'
                }
                onClick={() => {
                  setAutoReadEnabled((prev) => {
                    const next = !prev
                    if (!next) stopSpeaking()
                    return next
                  })
                }}
                className={`
                  group relative flex h-8 w-[3.25rem] shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,box-shadow] duration-200 ease-out
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700
                  ${autoReadEnabled
                    ? 'border-emerald-300/80 bg-emerald-400/35 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]'
                    : 'border-white/35 bg-black/25 hover:bg-black/35'}
                `}
              >
                <span
                  aria-hidden
                  className={`
                    pointer-events-none absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    ${autoReadEnabled ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}
                  `}
                >
                  {autoReadEnabled ? (
                    <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  ) : (
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center text-slate-500">
                      <svg className="absolute h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <svg className="absolute h-3.5 w-3.5 text-rose-500/90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5l14 14" />
                      </svg>
                    </span>
                  )}
                </span>
              </button>
              <span className="text-xs text-white/90 select-none leading-snug text-left whitespace-nowrap">
                {autoReadEnabled ? 'Voice on' : 'Voice off'}
              </span>
              <button type="button" onClick={() => { stopSpeaking(); closeChat() }} className="touch-target p-2 rounded-lg hover:bg-white/20 transition-colors active:scale-[0.98] active:brightness-110 active:shadow-inner" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {backendUnavailable && (
            <div className="px-3 py-2 bg-amber-50/80 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 min-w-0">
              <p className="text-xs text-amber-800 dark:text-amber-200 break-words">
                <strong>Frank is currently unavailable.</strong> Contact your administrator to enable the Frank backend.
              </p>
            </div>
          )}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100/80 dark:bg-slate-600/50 text-neutral-900 dark:text-slate-100'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  {msg.role === 'assistant' && msg.text.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => { void speakMessage(msg.id, msg.text) }}
                      className="mt-2 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                      aria-label={speakingId === msg.id ? 'Stop reading response' : 'Read response aloud'}
                    >
                      {speakingId === msg.id ? 'Stop audio' : 'Read aloud'}
                    </button>
                  )}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-300/40 dark:border-slate-500/40 space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">Sources</p>
                      {msg.citations.map((c) => {
                        const token = getAuthToken()
                        const previewUrl = c.fileUrl && token ? `${apiPath(c.fileUrl)}?token=${encodeURIComponent(token)}` : null
                        return (
                          <div key={`${c.source}:${c.project ?? ''}:${c.documentName}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.source === 'local'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'}`}
                            >
                              {c.source === 'local' ? 'Local archive' : 'Cloud library'}
                            </span>
                            <span className="break-all">
                              {c.project ? `${c.project} / ` : ''}
                              {c.documentName}
                              {typeof c.pageNumber === 'number' ? ` — p. ${c.pageNumber}` : ''}
                            </span>
                            {c.documentId && c.source === 'local' && (
                              <>
                                <button
                                  type="button"
                                  className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                                  onClick={() => {
                                    const id = c.documentId!
                                    setViewerSource({
                                      fileName: c.documentName,
                                      crumb: c.project,
                                      localDocumentId: id,
                                      loadBlob: () => fetchLocalDocumentBlob(id),
                                    })
                                    setViewerOpen(true)
                                  }}
                                >
                                  Preview
                                </button>
                                <button
                                  type="button"
                                  className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                                  onClick={() => {
                                    void fetchLocalDocumentBlob(c.documentId!, true).then((blob) => {
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a')
                                      a.href = url
                                      a.download = c.documentName
                                      a.click()
                                      URL.revokeObjectURL(url)
                                    })
                                  }}
                                >
                                  Download
                                </button>
                              </>
                            )}
                            {previewUrl && c.source !== 'local' && (
                              <>
                                <a
                                  href={previewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                                >
                                  Preview
                                </a>
                                <a
                                  href={`${previewUrl}&download=1`}
                                  className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                                >
                                  Download
                                </a>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {msg.sources && msg.sources.length > 0 && (!msg.citations || msg.citations.length === 0) && (
                    <p className="text-xs opacity-80 mt-2 pt-2 border-t border-white/20">Sources: {msg.sources.join(', ')}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-100/80 dark:bg-neutral-700 rounded-2xl px-4 py-2.5">
                  {activeTool ? (
                    <span className="text-sm text-neutral-600 dark:text-neutral-300">Checking {activeTool.replace(/_/g, ' ')}…</span>
                  ) : (
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-neutral-200/80 dark:border-neutral-700/80 bg-transparent">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Ask Frank..."
                rows={1}
                autoComplete="off"
                id="frank-chat-input"
                data-wispr="enabled"
                className="w-full min-h-[44px] max-h-[100px] px-4 py-3 rounded-xl border bg-white/80 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent border-neutral-300 dark:border-neutral-600 resize-none"
              />
              <Button onClick={send} disabled={loading} className="shrink-0">Send</Button>
            </div>
          </div>
        </div>
      </BeamsBackground>
      <FileViewer source={viewerSource} open={viewerOpen} onClose={() => setViewerOpen(false)} />
    </div>
  )
}
