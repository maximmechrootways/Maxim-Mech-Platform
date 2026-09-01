import { useMemo } from 'react'
import type { HazardField } from '@/api/hazardReview'
import {
  leadingLikelihoodSeverity,
  matrixCellClassForProduct,
  matrixCellTextClassForProduct,
  riskProduct,
} from '@/pages/hazard-review/hazardRiskReference'

/**
 * 4×4 risk matrix per Maxim Hazard Assessment Form (Level of Risk Chart).
 * Columns: Likelihood L4…L1 (Expected → Remote). Rows: Severity S4…S1 (Catastrophic → Minimal).
 * Cell value = L × S. Colours match the category bands below.
 */
export function HazardRiskMatrixSnapshot({
  fields,
  values,
  referenceOnly,
}: {
  fields: HazardField[]
  values: Record<string, string>
  /** Reference panel next to a static PDF — no in-app L/S fields. */
  referenceOnly?: boolean
}) {
  const likField = fields.find((f) => f.stableId === 'risk_likelihood' || f.id.endsWith('_risk_likelihood'))
  const sevField = fields.find((f) => f.stableId === 'risk_severity' || f.id.endsWith('_risk_severity'))

  const L = likField ? leadingLikelihoodSeverity(values[likField.id] ?? '') : null
  const S = sevField ? leadingLikelihoodSeverity(values[sevField.id] ?? '') : null
  const product = riskProduct(L, S)

  const grid = useMemo(() => {
    const Lcols = [4, 3, 2, 1] as const
    const Srows = [4, 3, 2, 1] as const
    return Srows.map((s) => ({
      s,
      cells: Lcols.map((l) => ({ l, s, p: l * s })),
    }))
  }, [])

  const likHead = ['L4', 'L3', 'L2', 'L1']
  const likHint = ['Expected', 'Probable', 'Possible', 'Remote']

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/50 p-3 mb-2">
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">4 × 4 risk matrix (L × S)</p>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
        {referenceOnly ? (
          <>
            Same layout as the manual chart: likelihood increases left → right (L4 Expected … L1 Remote); severity decreases
            top → bottom (S4 … S1). Use the L and S values on the PDF to read off the cell.
          </>
        ) : (
          <>
            Same layout as the manual chart: likelihood increases left → right (L4 Expected … L1 Remote); severity decreases
            top → bottom (S4 … S1). Select L and S in the dropdowns to highlight your cell.
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[10px] sm:text-xs">
          <thead>
            <tr>
              <th className="p-1 w-10 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80" />
              {[0, 1, 2, 3].map((i) => (
                <th
                  key={likHead[i]}
                  className="p-1 min-w-[2.75rem] border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80 font-medium text-neutral-600 dark:text-neutral-300"
                  title={likHint[i]}
                >
                  <span className="block leading-tight">{likHead[i]}</span>
                  <span className="block font-normal text-[9px] text-neutral-500 dark:text-neutral-400 leading-tight">
                    {likHint[i]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ s, cells }) => (
              <tr key={s}>
                <th className="p-1 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80 font-medium text-neutral-600 dark:text-neutral-300">
                  S{s}
                </th>
                {cells.map(({ l, p }) => {
                  const isHit = L === l && S === s
                  return (
                    <td
                      key={`${l}-${s}`}
                      className={`p-1 border border-neutral-200/80 dark:border-neutral-700/80 ${matrixCellClassForProduct(p)} ${
                        isHit ? 'ring-2 ring-brand-600 ring-inset z-10 relative' : ''
                      }`}
                    >
                      <span className={`font-mono tabular-nums ${matrixCellTextClassForProduct(p)}`}>{p}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {product !== null && (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          Current selection: L{L} × S{S} = <span className="font-semibold text-neutral-900 dark:text-white">{product}</span>
        </p>
      )}
    </div>
  )
}
