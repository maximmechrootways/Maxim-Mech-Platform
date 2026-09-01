import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { SafetyAlert } from '@/types'
import {
  SAFETY_ALERT_RED_CARD,
  SAFETY_ALERT_RED_TEXT,
  SAFETY_ALERT_RED_TEXT_MUTED,
  hasSafetyAlertAction,
  normalizeSafetyAlertActions,
} from '@/utils/safetyAlerts'

type NameLookup = (userId: string) => string

interface SafetyAlertCardProps {
  alert: SafetyAlert
  userId?: string
  isHr?: boolean
  onRead?: (id: string) => void | Promise<void>
  onAcknowledge?: (id: string) => void | Promise<void>
  lookupName?: NameLookup
  showActions?: boolean
  compact?: boolean
}

export function SafetyAlertCard({
  alert,
  userId,
  isHr,
  onRead,
  onAcknowledge,
  lookupName,
  showActions = true,
  compact = false,
}: SafetyAlertCardProps) {
  const [busy, setBusy] = useState<'read' | 'ack' | null>(null)
  const isRead = userId ? hasSafetyAlertAction(alert.readBy, userId) : false
  const isAcknowledged = userId ? hasSafetyAlertAction(alert.acknowledgedBy, userId) : false
  const acknowledgements = normalizeSafetyAlertActions(alert.acknowledgedBy)
  const reads = normalizeSafetyAlertActions(alert.readBy)

  const handleRead = async () => {
    if (!onRead || isRead) return
    setBusy('read')
    try {
      await onRead(alert.id)
    } finally {
      setBusy(null)
    }
  }

  const handleAcknowledge = async () => {
    if (!onAcknowledge || isAcknowledged) return
    setBusy('ack')
    try {
      await onAcknowledge(alert.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      padding={compact ? 'sm' : 'md'}
      className={`${SAFETY_ALERT_RED_CARD} ${!isRead && userId ? 'ring-1 ring-red-300/60 dark:ring-red-700/50' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`font-medium ${SAFETY_ALERT_RED_TEXT} ${!isRead && userId ? 'font-semibold' : ''}`}>
          {alert.title}
        </p>
        <div className="flex items-center gap-2">
          {!isRead && userId && showActions && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-600 text-white">
              New
            </span>
          )}
          <span className="text-xs text-neutral-500">
            {new Date(alert.publishedAt).toLocaleString()}
            {alert.expiresAt ? ` · Expires ${new Date(alert.expiresAt).toLocaleDateString()}` : ''}
          </span>
        </div>
      </div>
      {alert.body && (
        <p className={`text-sm ${SAFETY_ALERT_RED_TEXT_MUTED} mt-2`}>{alert.body}</p>
      )}
      {alert.siteNames?.length ? (
        <p className="text-xs text-neutral-500 mt-2">Sites: {alert.siteNames.join(', ')}</p>
      ) : null}

      {showActions !== false && userId && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isRead || busy !== null}
            onClick={handleRead}
          >
            {isRead ? 'Read' : busy === 'read' ? 'Marking…' : 'Mark as read'}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={isAcknowledged || busy !== null}
            onClick={handleAcknowledge}
          >
            {isAcknowledged ? 'Acknowledged' : busy === 'ack' ? 'Saving…' : 'Acknowledge'}
          </Button>
        </div>
      )}

      {isHr && (
        <AcknowledgementPanel
          acknowledgements={acknowledgements}
          reads={reads}
          lookupName={lookupName}
        />
      )}
    </Card>
  )
}

function AcknowledgementPanel({
  acknowledgements,
  reads,
  lookupName,
}: {
  acknowledgements: { userId: string; at: string }[]
  reads: { userId: string; at: string }[]
  lookupName?: NameLookup
}) {
  const [expanded, setExpanded] = useState(false)
  const name = lookupName ?? ((id: string) => id)

  return (
    <div className="mt-3 pt-3 border-t border-red-200/80 dark:border-red-800/80">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`text-sm font-medium ${SAFETY_ALERT_RED_TEXT} hover:underline`}
      >
        {acknowledgements.length} acknowledged · {reads.length} read
        {expanded ? ' ▲' : ' ▼'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 text-sm">
          <div>
            <p className="font-medium text-neutral-700 dark:text-neutral-300">Acknowledged by</p>
            {acknowledgements.length === 0 ? (
              <p className="text-neutral-500">No acknowledgements yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-neutral-600 dark:text-neutral-400">
                {acknowledgements.map((a) => (
                  <li key={`ack-${a.userId}-${a.at}`}>
                    {name(a.userId)}
                    {a.at ? ` — ${new Date(a.at).toLocaleString()}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium text-neutral-700 dark:text-neutral-300">Read by</p>
            {reads.length === 0 ? (
              <p className="text-neutral-500">No one has marked as read yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-neutral-600 dark:text-neutral-400">
                {reads.map((r) => (
                  <li key={`read-${r.userId}-${r.at}`}>
                    {name(r.userId)}
                    {r.at ? ` — ${new Date(r.at).toLocaleString()}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
