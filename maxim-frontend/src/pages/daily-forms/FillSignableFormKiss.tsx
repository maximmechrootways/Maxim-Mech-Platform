import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { FillSignableForm } from '@/pages/daily-forms/FillSignableForm'

export function FillSignableFormKiss() {
  return (
    <div className="space-y-4">
      <Card padding="md" className="border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-900/20">
        <CardHeader>KISS Mode</CardHeader>
        <CardDescription>Simple step-by-step form for daily completion.</CardDescription>
      </Card>
      <FillSignableForm forceKissMode />
    </div>
  )
}

