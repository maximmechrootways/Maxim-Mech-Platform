import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const trainingCertifications: { id: string; userName: string; name: string; issuedAt: string; expiresAt: string; status: string }[] = []

export function TrainingList() {
  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Training & Certifications</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Track certifications and expiry. Expiring soon and expired are highlighted.</p>
      </div>
      {trainingCertifications.length === 0 ? (
        <Card padding="lg" className="text-center text-neutral-500 dark:text-neutral-400">
          <p>No training certifications on file. Data will appear when added via the API.</p>
        </Card>
      ) : (
      <ul className="space-y-3">
        {trainingCertifications.map((t) => (
          <li key={t.id}>
            <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{t.userName} · {t.name}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Issued {t.issuedAt} · Expires {t.expiresAt}</p>
              </div>
              <Badge variant={t.status === 'current' ? 'success' : t.status === 'expiring-soon' ? 'warning' : 'danger'}>{t.status.replace('-', ' ')}</Badge>
            </Card>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
