/**
 * Reference logic aligned with Maxim Hazard Assessment Form (Level of Risk Chart):
 * 4×4 matrix — Likelihood 1–4 × Severity 1–4 (max product 16).
 * Bands: Low 1–3, Medium 4–8, High 9–12, Severe ≥13 (chart lists score 16 as Severe).
 * Legacy 1–5 × 1–5 selections are still parsed for older submissions.
 */

export type RiskBandKey = 'low' | 'medium' | 'high' | 'severe'

export function leadingLikelihoodSeverity(raw: string): number | null {
  const m = raw.trim().match(/^(\d)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 5 ? n : null
}

export function riskProduct(L: number | null, S: number | null): number | null {
  if (L === null || S === null) return null
  return L * S
}

export function riskBandFromProduct(p: number): RiskBandKey {
  if (p <= 3) return 'low'
  if (p <= 8) return 'medium'
  if (p <= 12) return 'high'
  return 'severe'
}

/** Matrix cell background — matches category band colours. */
export function matrixCellClassForProduct(p: number): string {
  const b = riskBandFromProduct(p)
  if (b === 'low') return 'bg-[#92D050]/50 dark:bg-[#92D050]/25'
  if (b === 'medium') return 'bg-[#FFC000]/45 dark:bg-[#FFC000]/20'
  if (b === 'high') return 'bg-red-500/40 dark:bg-red-600/25'
  return 'bg-[#990000]/85 dark:bg-[#7f1d1d]/70'
}

export function matrixCellTextClassForProduct(p: number): string {
  if (p >= 13) return 'text-white'
  return 'text-neutral-900 dark:text-neutral-50'
}

export const RISK_CATEGORY_ROWS: {
  band: RiskBandKey
  scoreLabel: string
  title: string
  action: string
  rowClass: string
  titleClass: string
}[] = [
  {
    band: 'severe',
    scoreLabel: '≥13',
    title: 'Severe',
    action: 'Stop work immediately, implement controls to reduce the risk.',
    rowClass: 'bg-[#990000] text-white',
    titleClass: 'font-semibold',
  },
  {
    band: 'high',
    scoreLabel: '9–12',
    title: 'High',
    action:
      'Consider additional controls to reduce the risk. Create a Safe Work (Job) Procedure where appropriate.',
    rowClass: 'bg-red-500 text-neutral-900 dark:text-neutral-950',
    titleClass: 'font-semibold',
  },
  {
    band: 'medium',
    scoreLabel: '4–8',
    title: 'Medium',
    action: 'Consider additional controls, Create a Safe Work Practice where appropriate.',
    rowClass: 'bg-[#FFC000]/90 text-neutral-900',
    titleClass: 'font-semibold',
  },
  {
    band: 'low',
    scoreLabel: '1–3',
    title: 'Low',
    action: 'Minimal risk — monitor the operation.',
    rowClass: 'bg-[#92D050]/90 text-neutral-900',
    titleClass: 'font-semibold',
  },
]

export const HIERARCHY_OF_CONTROLS = [
  {
    key: 'elimination',
    title: 'Elimination',
    subtitle: 'Physically remove the hazard',
    className: 'bg-[#4A7EBB] text-white',
    width: 'w-full',
  },
  {
    key: 'substitution',
    title: 'Substitution',
    subtitle: 'Replace the hazard',
    className: 'bg-[#92BD59] text-neutral-900',
    width: 'w-[92%] mx-auto',
  },
  {
    key: 'engineering',
    title: 'Engineering controls',
    subtitle: 'Isolate people from the hazard',
    className: 'bg-[#FFCD00] text-neutral-900',
    width: 'w-[84%] mx-auto',
  },
  {
    key: 'administrative',
    title: 'Administrative controls',
    subtitle: 'Change the way people work',
    className: 'bg-[#E46C2E] text-white',
    width: 'w-[76%] mx-auto',
  },
  {
    key: 'ppe',
    title: 'PPE',
    subtitle: 'Protect the worker with Personal Protective Equipment',
    className: 'bg-[#E02626] text-white',
    width: 'w-[68%] mx-auto',
  },
] as const
