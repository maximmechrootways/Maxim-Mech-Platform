import { useState, useEffect } from 'react'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import * as permissionsApi from '@/api/permissions'

const ROLES = ['owner', 'hr', 'supervisor', 'labourer', 'user']

export function AdminPermissions() {
  const [features, setFeatures] = useState<permissionsApi.FeaturePermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    permissionsApi.fetchPermissions().then(setFeatures).catch(() => setFeatures([])).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Role Permissions</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">What each role can access (from API)</p>
      </div>
      <Card padding="md">
        <CardHeader className="text-base">Feature Access by Role</CardHeader>
        <CardDescription>✓ = can view. Actual enforcement is role-based in the app.</CardDescription>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-600">
                <th className="text-left py-2 px-3 font-medium text-neutral-700 dark:text-neutral-300">Feature</th>
                {ROLES.map((r) => (
                  <th key={r} className="text-center py-2 px-3 font-medium text-neutral-700 dark:text-neutral-300 capitalize">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.feature} className="border-b border-neutral-100 dark:border-neutral-700/50">
                  <td className="py-2 px-3 text-neutral-900 dark:text-white">{f.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center py-2 px-3">
                      {f.viewRoles.includes(r) ? <span className="text-green-600 dark:text-green-400">✓</span> : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  )
}
