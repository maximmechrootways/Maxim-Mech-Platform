import React from 'react'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface KissFormShellProps {
  title: string
  description?: string
  currentStep: number
  totalSteps: number
  onPrev?: () => void
  onNext?: () => void
  onSubmit?: () => void
  nextDisabled?: boolean
  submitDisabled?: boolean
  children: React.ReactNode
}

export function KissFormShell({
  title,
  description,
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSubmit,
  nextDisabled,
  submitDisabled,
  children,
}: KissFormShellProps) {
  const progress = Math.min(100, Math.max(0, Math.round(((currentStep + 1) / Math.max(totalSteps, 1)) * 100)))
  const isLastStep = currentStep >= totalSteps - 1

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <CardHeader>{title}</CardHeader>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-300">
          <span>Step {Math.min(currentStep + 1, totalSteps)} of {Math.max(totalSteps, 1)}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div className="h-full bg-brand-600 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div>{children}</div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="secondary" onClick={onPrev} disabled={!onPrev || currentStep <= 0}>
          Back
        </Button>
        {isLastStep ? (
          <Button onClick={onSubmit} disabled={submitDisabled}>
            Submit
          </Button>
        ) : (
          <Button onClick={onNext} disabled={nextDisabled}>
            Next
          </Button>
        )}
      </div>
    </Card>
  )
}

