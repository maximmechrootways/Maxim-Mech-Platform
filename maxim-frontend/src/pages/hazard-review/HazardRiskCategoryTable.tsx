import type { HazardField } from '@/api/hazardReview'
import {
  RISK_CATEGORY_ROWS,
  leadingLikelihoodSeverity,
  riskBandFromProduct,
  riskProduct,
} from '@/pages/hazard-review/hazardRiskReference'

export function HazardRiskCategoryTable({
  fields,
  values,
  referenceOnly,
}: {
  fields: HazardField[]
  values: Record<string, string>
  referenceOnly?: boolean
}) {
  const likField = fields.find((f) => f.stableId === 'risk_likelihood' || f.id.endsWith('_risk_likelihood'))
  const sevField = fields.find((f) => f.stableId === 'risk_severity' || f.id.endsWith('_risk_severity'))
  const L = likField ? leadingLikelihoodSeverity(values[likField.id] ?? '') : null
  const S = sevField ? leadingLikelihoodSeverity(values[sevField.id] ?? '') : null
  const product = riskProduct(L, S)
  const activeBand = product !== null ? riskBandFromProduct(product) : null

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/50 p-3 mb-3">
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
        Risk score → category &amp; actions
      </p>
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-2">
        {referenceOnly
          ? 'How the risk score (L × S) maps to category and follow-up — use with the score on the PDF.'
          : 'The risk score (L × S) determines the category and the type of follow-up required.'}
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-300/80 dark:border-neutral-600">
        <table className="w-full text-left text-[11px] sm:text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-200/90 dark:bg-neutral-700/90 text-neutral-800 dark:text-neutral-100">
              <th className="p-2 font-semibold border-b border-neutral-300 dark:border-neutral-600">Risk score (L × S)</th>
              <th className="p-2 font-semibold border-b border-neutral-300 dark:border-neutral-600">Risk category</th>
              <th className="p-2 font-semibold border-b border-neutral-300 dark:border-neutral-600">Action required</th>
            </tr>
          </thead>
          <tbody>
            {RISK_CATEGORY_ROWS.map((row) => {
              const isActive = activeBand === row.band
              return (
                <tr
                  key={row.band}
                  className={`${row.rowClass} ${isActive ? 'ring-2 ring-brand-600 ring-inset' : ''}`}
                >
                  <td className={`p-2 align-top border-t border-white/20 ${row.titleClass}`}>{row.scoreLabel}</td>
                  <td className={`p-2 align-top border-t border-white/20 ${row.titleClass}`}>{row.title}</td>
                  <td className="p-2 align-top border-t border-white/20 opacity-95">{row.action}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {product !== null && activeBand && (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          Current score <span className="font-mono font-semibold text-neutral-900 dark:text-white">{product}</span> →{' '}
          <span className="font-semibold capitalize">{activeBand}</span>
        </p>
      )}
    </div>
  )
}
