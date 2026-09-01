import React from 'react'

export function KissValidationSummary({ missingLabels }: { missingLabels: string[] }) {
  if (missingLabels.length === 0) return null
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-3">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">Please finish these required items:</p>
      <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300 list-disc pl-5">
        {missingLabels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  )
}

