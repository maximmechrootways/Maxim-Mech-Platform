import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface SpreadsheetItem {
  id: string
  name: string
  lastModified: string
}

export function GoogleSheetsSpreadsheets() {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([])
  useEffect(() => {
    // TODO: load from API when Google Sheets integration is available
    setSpreadsheets([])
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/sheets" className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-2xl text-neutral-900 dark:text-white">Select spreadsheet</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Choose which sheet to sync with email job entries</p>
        </div>
      </div>
      {spreadsheets.length === 0 ? (
        <Card padding="lg" className="text-center text-neutral-500 dark:text-neutral-400">
          <p>Connect your Google account to see spreadsheets here.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {spreadsheets.map((ss) => (
            <li key={ss.id}>
              <Link to="/sheets/jobs">
                <Card hover padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{ss.name}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Last modified {ss.lastModified}</p>
                  </div>
                  <Button size="sm" variant="secondary">Use this sheet</Button>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
