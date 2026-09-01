import { HIERARCHY_OF_CONTROLS } from '@/pages/hazard-review/hazardRiskReference'

/** Standard hierarchy of controls (most effective at top → least at bottom). */
export function HierarchyOfControlsReference() {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/50 p-3 mb-3">
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">Hierarchy of controls</p>
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-3">
        Prefer controls higher in the list before relying on PPE alone.
      </p>
      <div className="flex gap-3">
        <div
          className="hidden sm:flex w-2 shrink-0 rounded-full bg-gradient-to-b from-[#4A7EBB] via-[#92BD59] via-[#FFCD00] via-[#E46C2E] to-[#E02626]"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
          {HIERARCHY_OF_CONTROLS.map((step) => (
            <div
              key={step.key}
              className={`rounded-lg px-3 py-2 shadow-sm ${step.className} ${step.width}`}
            >
              <p className="text-xs font-semibold leading-tight">{step.title}</p>
              <p className="text-[11px] leading-snug opacity-95">{step.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-500">
        Most effective at top — least effective at bottom (PPE).
      </p>
    </div>
  )
}
