import React from 'react'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'

export function KissSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card padding="md" className="space-y-3">
      <div>
        <CardHeader className="mb-1">{title}</CardHeader>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  )
}

