import { useMemo } from 'react'

type TemplateRow = {
  task: string
  hazards: string
  inherent: string
  controls: string
  residual: string
}

type VersionControlRow = {
  version: string
  date: string
  author: string
  notes: string
  approvedBy?: string
  approvedDate?: string
}

type AssessmentMeta = {
  assessmentDate: string
  performedBy: string
  jobPosition: string
  supervisor: string
  reviewedDate: string
  implementedDate: string
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isRenderableTemplateRow(row: TemplateRow | null | undefined) {
  if (!row) return false
  return hasText(row.task) || hasText(row.hazards) || hasText(row.inherent) || hasText(row.controls) || hasText(row.residual)
}

function extractRiskScore(text: string | undefined | null): number | null {
  if (!text) return null
  const m = text.match(/=\s*(\d{1,2})\s*$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return n
}

function riskTone(score: number | null): string {
  if (score === null) return 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-800 dark:text-neutral-200'
  if (score >= 13) return 'bg-red-700/95 text-white'
  if (score >= 9) return 'bg-red-500/90 text-white'
  if (score >= 4) return 'bg-amber-300/95 text-neutral-900'
  return 'bg-emerald-300/90 text-neutral-900'
}

const TEMPLATE_ROWS: Record<string, TemplateRow[]> = {
  office_management: [
    {
      task: 'Prolonged computer work',
      hazards: 'Poor workstation ergonomics, awkward posture, repetitive mouse/keyboard use',
      inherent: 'Likely (2) × Serious (3) = 6',
      controls: 'Engineering: ergonomic chair, mouse and desk. Administrative: breaks, task rotation, stretching',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Sitting for long periods',
      hazards: 'Sedentary posture, poor chair support',
      inherent: 'Likely (2) × Serious (3) = 6',
      controls: 'Engineering: Sit-stand workstation. Administrative: movement breaks, walking meetings.',
      residual: 'Likely (2) × Moderate (2) = 4',
    },
    {
      task: 'Filing documents / storage access',
      hazards: 'Reaching, bending, twisting, overfilled cabinets',
      inherent: 'Remote (1) × Minimal (1) = 1',
      controls: 'Engineering: Store heavy items between knee and shoulder height, stable shelving.',
      residual: 'Remote (1) × Moderate (2) = 2',
    },
    {
      task: 'Lifting office supplies (paper boxes, equipment, water jugs)',
      hazards: 'Manual material handling. Back strain, muscle sprain',
      inherent: 'Remote (1) × Moderate (2) = 2',
      controls: 'Elimination: Order smaller supply quantities. Administrative: Safe lifting training/team lifts.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Exposure to opioids or other controlled substances',
      hazards: 'Accidental contact, inhalation, or ingestion which may result in overdose, respiratory depression, or other serious health effects',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Elimination: Avoid entering high-risk environments. Engineering: Use barriers, proper ventilation. Administrative: Training on hazard recognition, safe handling procedures, incident response, naloxone training. PPE: gloves, masks',
      residual: 'Remote (1) × Moderate (2) = 4',
    },
    {
      task: 'Walking through office / common areas',
      hazards: 'Slips, trips, and falls (wet floors, cords, clutter, uneven flooring)',
      inherent: 'Remote (1) × Moderate (2) = 2',
      controls: 'Administrative: Good housekeeping rules, prompt spill cleanup.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'High workload / deadline pressure',
      hazards: 'Burnout, headaches, decreased focus (increases other risks)',
      inherent: 'Probable (3) × Minimal (1) = 3',
      controls: 'Administrative: Workload planning, realistic deadlines, encourage time off, mental health resources.',
      residual: 'Likely (2) × Minimal (1) = 2',
    },
    {
      task: 'Use of cleaning supplies (light tidying, spills)',
      hazards: 'Chemical exposure, wet floors. Skin/eye irritation, slips.',
      inherent: 'Probable (3) × Minimal (1) = 3',
      controls: 'Substitution: Use low-toxicity cleaners. Engineering: Clearly labeled products, proper storage. Administrative: WHMIS training, spill cleanup procedures. PPE: Gloves if handling cleaners.',
      residual: 'Likely (2) × Minimal (1) = 2',
    },
    {
      task: 'Emergency situations (fire alarm, evacuation)',
      hazards: 'Panic, blocked exits, poor lighting',
      inherent: 'Remote (1) × Serious (3) = 3',
      controls: 'Administrative: Fire drills, posted evacuation plans, trained fire wardens.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Indoor air quality issues',
      hazards: 'Poor ventilation, dust, fragrances. Headaches, respiratory irritation, allergies',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: Proper HVAC maintenance, air filtration.',
      residual: 'Probable (3) × Minimal (1) = 3',
    },
    {
      task: 'Managing office equipment (printer jams, moving small devices)',
      hazards: 'Pinch points, hot components, electrical cords',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Administrative: Training on clearing jams safely, unplug before servicing.',
      residual: 'Likely (2) × Minimal (1) = 3',
    },
    {
      task: 'Using step stool or small ladder to access storage',
      hazards: 'Fall from height (low level), unstable stool',
      inherent: 'Remote (1) × Moderate (2) = 2',
      controls: 'Administrative: Use step stool/ladder safely, maintain 3 points of contact.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Interacting with staff or public (front desk, phone, conflict situations)',
      hazards: 'Workplace stress, verbal aggression, difficult interactions',
      inherent: 'Probable (3) × Minimal (1) = 3',
      controls: 'Administrative: Workplace violence and harassment policy, conflict resolution training, clear reporting process.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Using a forklift',
      hazards: 'Damage product, hitting other people, falling product',
      inherent: 'Likely (2) × Serious (3) = 6',
      controls: 'Elimination: Order smaller supply quantities. Engineering: Lights, horn Administrative: Training',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
  ],
  office_engineer: [
    {
      task: 'Prolonged computer work',
      hazards: 'Ergonomics, repetitive strain, posture issues',
      inherent: 'Likely (2) × Serious (3) = 6',
      controls: 'Engineering: ergonomic chair, mouse and desk. Administrative: breaks, task rotation, stretching',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Sitting for long periods',
      hazards: 'Sedentary posture, poor chair support',
      inherent: 'Likely (2) × Serious (3) = 6',
      controls: 'Engineering: Sit-stand workstation. Administrative: movement breaks, walking meetings.',
      residual: 'Likely (2) × Moderate (2) = 4',
    },
    {
      task: 'Walking through office/common areas',
      hazards: 'Slips, trips, and falls (wet floors, cords, clutter, uneven flooring)',
      inherent: 'Remote (1) × Moderate (2) = 2',
      controls: 'Administrative: Good housekeeping rules, prompt spill cleanup.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'High workload / deadline pressure',
      hazards: 'Burnout, headaches, decreased focus (increases other risks)',
      inherent: 'Probable (3) × Minimal (1) = 3',
      controls: 'Administrative: Workload planning, realistic deadlines, encourage time off, mental health resources.',
      residual: 'Likely (2) × Minimal (1) = 2',
    },
    {
      task: 'Emergency situations (fire alarm, evacuation)',
      hazards: 'Panic, blocked exits, poor lighting',
      inherent: 'Remote (1) × Serious (3) = 3',
      controls: 'Administrative: Fire drills, posted evacuation plans, trained fire wardens.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Indoor air quality issues',
      hazards: 'Poor ventilation, dust, fragrances, headaches, respiratory irritation',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: Proper HVAC maintenance, air filtration.',
      residual: 'Probable (3) × Minimal (1) = 3',
    },
    {
      task: 'Managing office equipment (printer jams, moving small devices)',
      hazards: 'Pinch points, hot components, electrical cords',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Administrative: Training on clearing jams safely, unplug before servicing.',
      residual: 'Likely (2) × Minimal (1) = 3',
    },
    {
      task: 'Interacting with staff/public',
      hazards: 'Workplace stress, verbal aggression, difficult interactions',
      inherent: 'Probable (3) × Minimal (1) = 3',
      controls: 'Administrative: Workplace violence and harassment policy, conflict resolution training, clear reporting process.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Driving between office and sites',
      hazards: 'Collisions, weather, fatigue',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Well-maintained vehicles, winter tires. Administrative: Defensive driving training, journey management. PPE: Seatbelt (mandatory).',
      residual: 'Likely (2) × Moderate (2) = 4',
    },
    {
      task: 'Site visits - walking active job sites',
      hazards: 'Slips, trips, and falls (wet floors, cords, clutter, uneven flooring)',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Administrative: Good housekeeping rules, prompt spill cleanup. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Exposure to construction/industrial activities',
      hazards: 'Noise, dust, overhead work, mobile equipment, hearing damage, struck-by injuries',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Barriers, controlled access zones. Administrative: Sign-in procedures, escort requirements. PPE: Hard hat, safety glasses, hearing protection, hi-vis.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Entering mechanical or plant rooms',
      hazards: 'Hot surfaces, tight spaces, noise, burns, head injury, hearing loss',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Guardrails, covers. Administrative: Safe distance, follow site rules. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Climbing ladders or accessing elevated areas',
      hazards: 'Falls from height',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Guardrails, lift platforms. Administrative: Fall protection plan, ladder safety training. PPE: Fall arrest harness, hard hat.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Reviewing work near energized systems',
      hazards: 'Electrical shock from equipment, water near power',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Engineering: proper grounding. Administrative: Lockout/tagout (LOTO), coordination with electricians. PPE: Dielectric gloves, safety boots.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Exposure to airborne contaminants onsite',
      hazards: 'Dust, welding fumes, silica, respiratory irritation',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Ventilation, wet cutting methods by trades. Administrative: Limit time in high-exposure areas. PPE: Respirator if required by site rules.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Attending meetings in industrial environments',
      hazards: 'Distractions, unfamiliar hazards, slips, struck-by injuries',
      inherent: 'Possible (2) × Moderate (2) = 4',
      controls: 'Administrative: Pre-visit hazard briefings, stay within designated walkways. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Site inspections near excavations or trenches',
      hazards: 'Falls into pits, unstable ground, fractures, serious injury',
      inherent: 'Remote (1) × Serious (3) = 3',
      controls: 'Engineering: Guardrails, covers. Administrative: Safe distance, follow site rules. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to opioids or other controlled substances',
      hazards: 'Accidental contact, inhalation, or ingestion which may result in overdose, respiratory depression, or other serious health effects',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Elimination: Avoid entering high-risk environments. Engineering: Use barriers, proper ventilation. Administrative: Training on hazard recognition, safe handling procedures, incident response. PPE: gloves, masks',
      residual: 'Remote (1) × Moderate (2) = 4',
    },
  ],
  general_labourer: [
    {
      task: 'Manual material handling (moving pipe, tools, debris)',
      hazards: 'Heavy materials, awkward postures, injuries, crushed fingers, muscle strains',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Pipe stands, chain falls, mechanical lifts. Administrative: Lift planning, team lifts, rigging procedures. PPE: Gloves, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Site housekeeping (debris removal, sweeping)',
      hazards: 'Slips, trips, sharp objects, dust',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Waste bins, debris chutes. Administrative: Regular cleanup schedule. PPE: Gloves, safety glasses, dust mask if required.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Working near active hot work (welding/cutting)',
      hazards: 'Fumes, UV radiation, fire/explosion risk',
      inherent: 'Probable (3) × Serious (3) = 9',
      controls: 'Engineering: Welding screens, spark containment. Administrative: Restricted access zones, hot work awareness. PPE: Safety glasses, FR clothing if in hot work zone.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Working around mobile equipment',
      hazards: 'Moving vehicles, blind spots, struck-by or run-over injuries',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Barriers, defined walkways. Administrative: Site safety meetings, traffic control plans. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Probable (3) × Moderate (2) = 6',
    },
    {
      task: 'Use of power tools (drills, saws)',
      hazards: 'Kickback injury, vibration, noise, hearing loss',
      inherent: 'Expected (4) × Serious (3) = 12',
      controls: 'Engineering: guards. Administrative: Tool inspection program, training. PPE: Gloves, hearing protection, eye protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Assisting with rigging or moving materials',
      hazards: 'Suspended loads, shifting objects, struck-by, caught-between, fatal injury',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Certified lifting devices, tag lines. Administrative: Qualified riggers, exclusion zones, lift plans. PPE: Hard hat, hi-vis, gloves, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to industrial noise',
      hazards: 'Noise-induced hearing loss',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Noise-dampening barriers. PPE: Hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to dust and airborne contaminants',
      hazards: 'Silica dust, welding fumes, general construction dust, respiratory irritation, lung issues',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Wet methods, ventilation. Administrative: Limit time in high-exposure areas. PPE: Respirator if required.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Slips, trips, and falls on job sites',
      hazards: 'Uneven ground, debris, wet surfaces',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: cable management. Administrative: Good housekeeping, site orientation. PPE: Slip-resistant, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Working in hot or cold environments',
      hazards: 'Dehydration, heat stroke, frostbite',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Heated/cooled break areas. Administrative: Work-rest cycles, hydration. PPE: Weather-appropriate PPE.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Handling garbage or scrap materials',
      hazards: 'Sharp edges, biohazards, cuts, punctures, infection',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Proper waste containers. Administrative: Safe disposal procedures. PPE: Cut-resistant gloves, safety boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Shop/office support housekeeping',
      hazards: 'Wet floors, cleaning chemicals, slips, skin/eye irritation',
      inherent: 'Remote (1) × Moderate (2) = 2',
      controls: 'Substitution: Low-toxicity cleaners. Engineering: Clearly labeled storage, ventilation. Administrative: WHMIS training, spill cleanup procedures. PPE: Gloves, safety boots',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Working at heights (ladders, lifts, scaffolds)',
      hazards: 'Falls from height, falling tools/materials',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Guardrails, lift platforms. Administrative: Fall protection plan, ladder safety training. PPE: Fall arrest harness, hard hat.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Interaction with other trades / mobile equipment',
      hazards: 'Struck-by moving equipment, dropped materials, serious injury, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Barriers, defined walkways. Administrative: Site safety meetings, traffic control plans. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Probable (3) × Moderate (2) = 6',
    },
    {
      task: 'Exposure to opioids or other controlled substances',
      hazards: 'Accidental contact, inhalation, or ingestion which may result in overdose, respiratory depression, or other serious health effects',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Elimination: Avoid entering high-risk environments. Engineering: Use barriers, proper ventilation. Administrative: Training on hazard recognition, safe handling procedures, incident response PPE: gloves, masks',
      residual: 'Remote (1) × Moderate (2) = 4',
    },
  ],
  gas_fitter: [
    {
      task: 'Installing large-bore piping and gas lines',
      hazards: 'Heavy materials, awkward postures, injuries, crushed fingers, muscle strains',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Pipe stands, chain falls, mechanical lifts. Administrative: Lift planning, team lifts, rigging procedures. PPE: Gloves, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Rigging and positioning pipe spools',
      hazards: 'Struck-by, caught-between, fatal injury',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Certified lifting devices, tag lines. Administrative: Qualified riggers, exclusion zones, lift plans. PPE: Hard hat, high-vis, gloves, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Cutting, beveling, grinding pipe',
      hazards: 'Flying debris, sparks, sharp edges, noise. Eye injuries, cuts.',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Machine guards, spark containment. PPE: Safety glasses + face shield, cut-resistant gloves, hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Welding on gas or process piping',
      hazards: 'Fumes, UV radiation, fire/explosion risk',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Elimination: Prefabrication. Engineering: Local exhaust ventilation, fire blankets. Administrative: Hot work permit, fire watch. PPE: Welding helmet, gloves, FR clothing, respirator if required.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Purging, pressure testing, and commissioning gas lines',
      hazards: 'Line rupture, flying debris, sudden release of pressure. Struck-by injuries, lacerations, hearing damage',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Administrative: Test procedures, exclusion zones. PPE: Face shield, gloves, hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Working around live gas systems',
      hazards: 'Gas leaks, fire, explosion, oxygen displacement',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Elimination: Isolate and de-energize. Engineering: Gas detection systems, ventilation. Administrative: Lockout/tagout, gas monitoring, permit. PPE: Flame-resistant clothing, gas monitor.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Confined space work (vaults, boiler rooms, tanks)',
      hazards: 'Low oxygen, toxic gases, Asphyxiation, poisoning, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Elimination: Use external access methods if possible. Engineering: Ventilation systems, gas monitors. Administrative: Confined space program, entry permits, rescue plan.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Working at heights (scissor lifts)',
      hazards: 'Falls from height, falling tools/materials',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Guardrails, lift platforms. Administrative: Fall protection plan, ladder safety training. PPE: Fall arrest harness, hard hat.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Demolition / tie-ins to existing systems',
      hazards: 'Explosion, chemical exposure, burns, Line rupture, flying debris, sudden release of pressure',
      inherent: 'Probable (3) × Serious (3) = 9',
      controls: 'Elimination: Use machinery. Engineering: Dust control, debris containment. Administrative: Safe demo procedures. PPE: Cut-resistant gloves, respirator.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Use of power tools (drills, saws)',
      hazards: 'Kickback injury, vibration, noise, hearing loss',
      inherent: 'Expected (4) × Serious (3) = 12',
      controls: 'Engineering: guards. Administrative: Tool inspection program, training. PPE: Gloves, hearing protection, eye protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to industrial noise',
      hazards: 'Noise-induced hearing loss',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Noise-dampening barriers. PPE: Hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Work in extreme temperatures (boiler rooms, outdoors)',
      hazards: 'Dehydration, heat stroke, frostbite',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Heated/cooled break areas. Administrative: Work-rest cycles, hydration. PPE: Weather-appropriate PPE.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Slips, trips, and falls on job sites',
      hazards: 'Uneven ground, debris, wet surfaces',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: cable management. Administrative: Good housekeeping, site orientation. PPE: Slip-resistant, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to chemicals (glues, solvents, cleaners)',
      hazards: 'Dermatitis, respiratory irritation, dizziness',
      inherent: 'Possible (2) × Moderate (2) = 4',
      controls: 'Substitution: Low-VOC products. Engineering: Ventilation. Administrative: WHMIS training, SDS access. PPE: Gloves, goggles, respirator if required.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Interaction with other trades / mobile equipment',
      hazards: 'Struck-by moving equipment, dropped materials, serious injury, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Barriers, defined walkways. Administrative: Site safety meetings, traffic control plans. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Probable (3) × Moderate (2) = 6',
    },
  ],
  welder: [
    {
      task: 'Arc welding (SMAW, MIG, TIG, FCAW)',
      hazards: 'UV/IR radiation, molten metal, burns, arc eye, skin damage',
      inherent: 'Expected (4) × Catastrophic (4) = 16',
      controls: 'Engineering: Welding screens/curtains. Administrative: Restricted welding areas, training. PPE: Welding helmet (proper shade), FR clothing, gloves.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Welding fumes exposure',
      hazards: 'Metal fumes, Respiratory irritation, long-term lung disease',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Substitution: Use lower-fume materials. Engineering: Local exhaust ventilation, fume extractors. Administrative: Exposure monitoring, training. PPE: Respirator',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Hot work in active industrial areas',
      hazards: 'Fire, explosion from flammables, burns, fire',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Fire blankets, spark containment. Administrative: Hot work permit, fire watch, area inspection. PPE: FR clothing, gloves, face shield.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Grinding welds / prep work',
      hazards: 'Flying particles, eye injuries, cuts, burns, hearing loss',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Machine guards, spark containment. PPE: Safety glasses + face shield, cut-resistant gloves, hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Confined space work (vaults, boiler rooms, tanks)',
      hazards: 'Low oxygen, toxic gases, Asphyxiation, poisoning, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Elimination: Use external access methods if possible. Engineering: Ventilation systems, gas monitors. Administrative: Confined space program, entry permits, rescue plan.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Working at heights (Lifts)',
      hazards: 'Falls from height, falling tools/materials',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Guardrails, lift platforms. Administrative: Fall protection plan, ladder safety training. PPE: Fall arrest harness, hard hat.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Handling compressed gas cylinders',
      hazards: 'Cylinder tipping, valve damage, gas leaks',
      inherent: 'Probable (3) × Serious (3) = 9',
      controls: 'Engineering: Cylinder carts, caps, secure storage racks. Administrative: training, segregation of gases. PPE: Gloves, safety boots.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Electrical shock from welding equipment',
      hazards: 'Faulty leads, wet conditions, Electric shock, burns',
      inherent: 'Probable (3) × Serious (3) = 9',
      controls: 'Engineering: Proper grounding. Administrative: Equipment inspections, lockout/tagout. PPE: Dry gloves, dielectric footwear.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Heat stress (especially in PPE or enclosed areas)',
      hazards: 'Heat exhaustion, dehydration',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Ventilation, cooled rest areas. Administrative: Work-rest cycles, hydration program, cooling stations. PPE: Cooling PPE',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to industrial noise',
      hazards: 'Noise-induced hearing loss',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Noise-dampening barriers. PPE: Hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Manual handling of steel components',
      hazards: 'Back strain, crushed fingers/toes',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Hoists, positioners, carts. Administrative: Team lifts, lift planning. PPE: Gloves, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Slips, trips, and falls on job sites',
      hazards: 'Uneven ground, debris, wet surfaces',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: cable management. Administrative: Good housekeeping, site orientation. PPE: Slip-resistant, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to coatings or contaminants (paint, galvanizing, oil residues)',
      hazards: 'Metal fume fever, respiratory illness',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Elimination: Remove coatings before welding. Engineering: Local exhaust ventilation. Administrative: Hazard assessments, MSDS. PPE: Respirator as required.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Interaction with other trades / mobile equipment',
      hazards: 'Struck-by moving equipment, dropped materials, serious injury, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Barriers, defined walkways. Administrative: Site safety meetings, traffic control plans, hoisting plans, orientation. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Probable (3) × Moderate (2) = 6',
    },
    {
      task: 'Exposure to opioids or other controlled substances',
      hazards: 'accidental contact, inhalation, or ingestion which may result in overdose, respiratory depression, or other serious health effects',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Elimination: Avoid entering high-risk environments. Engineering: Use barriers, proper ventilation. Administrative: Training on hazard recognition, safe handling procedures, incident response, naloxone training PPE: gloves, masks',
      residual: 'Remote (1) × Moderate (2) = 4',
    },
  ],
  plumber: [
    {
      task: 'Installing / repairing piping systems',
      hazards: 'Heavy lifting, awkward postures, Back injuries, muscle strains, shoulder injuries',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Pipe stands, lifts, material carts. Administrative: Team lifts, safe lifting training, job planning. PPE: Gloves, steel-toe boots.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Cutting, threading, or grinding pipe',
      hazards: 'Flying debris, sparks, sharp edges, noise. Eye injuries, cuts.',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Engineering: Machine guards, spark containment. PPE: Safety glasses + face shield, cut-resistant gloves, hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Welding / soldering / brazing',
      hazards: 'Respiratory irritation, burns, fire, eye damage UV radiation',
      inherent: 'Expected (4) × Serious (3) = 12',
      controls: 'Elimination: Prefabrication. Engineering: Local exhaust ventilation, fire blankets. Administrative: Hot work permit, fire watch. PPE: Welding helmet, gloves, FR clothing, respirator if required.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Working at heights (ladders, lifts)',
      hazards: 'Falls from height, falling tools/materials',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Guardrails, lift platforms. Administrative: Fall protection plan, ladder safety training. PPE: Fall arrest harness, hard hat.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Working in mechanical rooms',
      hazards: 'Congested spaces, hot surfaces, noise damage, burns, struck-by injuries',
      inherent: 'Probable (3) × Serious (3) = 9',
      controls: 'Engineering: adequate lighting, communication to avoid confusion. Administrative: Housekeeping, restricted access. PPE: Gloves, long sleeves, hearing protection.',
      residual: 'Remote (1) × Moderate (2) = 2',
    },
    {
      task: 'Confined space entry (tanks, pits, vaults)',
      hazards: 'Low oxygen, toxic gases, Asphyxiation, poisoning, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Elimination: Use external access methods if possible. Engineering: Ventilation systems, gas monitors. Administrative: Confined space program, entry permits, rescue plan.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Pressure testing piping systems',
      hazards: 'Line rupture, flying debris, sudden release of pressure. Struck-by injuries, lacerations, hearing damage',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Administrative: Test procedures, exclusion zones. PPE: Face shield, gloves, hearing protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Working around energized systems',
      hazards: 'Electrical shock from electrical equipment, water near power',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Engineering: proper grounding. Administrative: Lockout/tagout (LOTO), coordination with electricians. PPE: Dielectric gloves, safety boots.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Demolition / removal of old piping',
      hazards: 'Cuts, struck-by injuries, exposure to unknown substances and materials',
      inherent: 'Probable (3) × Moderate (2) = 6',
      controls: 'Elimination: Use machinery. Engineering: Dust control, debris containment. Administrative: Safe demo procedures. PPE: Cut-resistant gloves, respirator.',
      residual: 'Possible (2) × Moderate (2) = 4',
    },
    {
      task: 'Use of power tools (drills, saws)',
      hazards: 'Kickback injury, vibration, noise, hearing loss',
      inherent: 'Expected (4) × Serious (3) = 12',
      controls: 'Engineering: guards. Administrative: Tool inspection program, training. PPE: Gloves, hearing protection, eye protection.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Trenching for underground plumbing',
      hazards: 'Cave-ins, engulfment, water ingress, crushing',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Trench boxes, shoring, utility locates. Administrative: Excavation permits, competent supervision. PPE: Hard hat, high-vis, boots.',
      residual: 'Remote (1) × Serious (3) = 3',
    },
    {
      task: 'Working in hot or cold environments',
      hazards: 'Dehydration, heat stroke, frostbite',
      inherent: 'Possible (2) × Serious (3) = 6',
      controls: 'Engineering: Heated/cooled break areas. Administrative: Work-rest cycles, hydration. PPE: Weather-appropriate PPE.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Slips, trips, and falls on job sites',
      hazards: 'Uneven ground, debris, wet surfaces',
      inherent: 'Expected (4) × Moderate (2) = 8',
      controls: 'Engineering: cable management. Administrative: Good housekeeping, site orientation. PPE: Slip-resistant, steel-toe boots.',
      residual: 'Possible (2) × Minimal (1) = 2',
    },
    {
      task: 'Exposure to chemicals (glues, solvents, cleaners)',
      hazards: 'Dermatitis, respiratory irritation, dizziness',
      inherent: 'Possible (2) × Moderate (2) = 4',
      controls: 'Elimination: Low-VOC products. Engineering: Ventilation. Administrative: WHMIS training, SDS documentation. PPE: Gloves, goggles, respirator if required.',
      residual: 'Remote (1) × Minimal (1) = 1',
    },
    {
      task: 'Interaction with other trades / mobile equipment',
      hazards: 'Struck-by moving equipment, dropped materials, serious injury, fatality',
      inherent: 'Probable (3) × Catastrophic (4) = 12',
      controls: 'Engineering: Barriers, defined walkways. Administrative: Site safety meetings, traffic control plans. PPE: High-visibility clothing, hard hat, safety boots.',
      residual: 'Probable (3) × Moderate (2) = 6',
    },
    {
      task: 'Exposure to opioids or other controlled substances',
      hazards: 'accidental contact, inhalation, or ingestion which may result in overdose, respiratory depression, or other serious health effects',
      inherent: 'Possible (2) × Catastrophic (4) = 8',
      controls: 'Elimination: Avoid entering high-risk environments. Engineering: Use barriers, proper ventilation. Administrative: Training on hazard recognition, safe handling procedures, incident response, naloxone training. PPE: gloves, masks',
      residual: 'Remote (1) × Moderate (2) = 4',
    },
  ],
}

const TEMPLATE_VERSION_CONTROL: Record<string, VersionControlRow[]> = {
  office_management: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '27-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
  office_engineer: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '30-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
  general_labourer: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '30-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
  plumber: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '28-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
  gas_fitter: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '30-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
  welder: [
    {
      version: '1',
      date: 'N/A',
      author: 'Wendy',
      notes: 'New Form Created',
    },
    {
      version: '2',
      date: '16-Dec-2025',
      author: 'Megha',
      notes: 'Added extra columns Generic Information Section Revised Formatting and fillable PDF conversion',
    },
    {
      version: '3',
      date: '30-Jan-2026',
      author: 'Sandra',
      notes: 'First Version of Hazards for Maxim Mechanical Group Inc.',
      approvedBy: 'Peter Godler',
      approvedDate: 'Feb 4, 2026',
    },
  ],
}

const TEMPLATE_ASSESSMENT_META: Record<string, AssessmentMeta> = {
  office_management: {
    assessmentDate: 'January 27, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'Office Administration',
    supervisor: 'Peter Godler',
    reviewedDate: 'Feb 4, 2026',
    implementedDate: 'Feb 25, 2026',
  },
  office_engineer: {
    assessmentDate: 'January 30, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'Engineer',
    supervisor: 'Peter Godler',
    reviewedDate: 'Feb 4, 2026',
    implementedDate: 'Feb 25, 2026',
  },
  general_labourer: {
    assessmentDate: 'February 4, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'General Labourer',
    supervisor: 'Peter Godler',
    reviewedDate: 'Feb 4, 2026',
    implementedDate: 'Feb 25, 2026',
  },
  plumber: {
    assessmentDate: 'January 28, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'Plumber',
    supervisor: 'BJ Wilson',
    reviewedDate: 'Feb 11, 2026',
    implementedDate: 'Feb 25, 2026',
  },
  gas_fitter: {
    assessmentDate: 'January 30, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'Gas Fitter',
    supervisor: 'BJ Wilson',
    reviewedDate: 'Feb 4, 2026',
    implementedDate: 'Feb 25, 2026',
  },
  welder: {
    assessmentDate: 'January 30, 2026',
    performedBy: 'Sandra Tutka',
    jobPosition: 'Welder',
    supervisor: 'BJ Wilson',
    reviewedDate: 'Feb 11, 2026',
    implementedDate: 'Feb 25, 2026',
  },
}

type Props = {
  templateKey: string
  query: string
}

export function HazardDigitizedTemplateReference({ templateKey, query }: Props) {
  const q = query.trim().toLowerCase()
  const rows = (TEMPLATE_ROWS[templateKey] || []).filter(isRenderableTemplateRow)
  const versionRows = TEMPLATE_VERSION_CONTROL[templateKey] || []
  const meta = TEMPLATE_ASSESSMENT_META[templateKey]
  const filteredRows = useMemo(() => {
    if (!q) return rows
    return rows.filter((r) =>
      [r.task, r.hazards, r.inherent, r.controls, r.residual].join(' ').toLowerCase().includes(q)
    )
  }, [rows, q])

  return (
    <div className="space-y-5">
      {versionRows.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-950/30 dark:to-violet-950/30 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Version control</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-neutral-100/70 dark:bg-neutral-800/50">
                <tr>
                  <th className="text-left px-3 py-2">Version</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Author</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-left px-3 py-2">Approved by:</th>
                  <th className="text-left px-3 py-2">Date:</th>
                </tr>
              </thead>
              <tbody>
                {versionRows.map((r) => (
                  <tr key={`${r.version}-${r.author}`} className="border-t border-neutral-200 dark:border-neutral-700 align-top">
                    <td className="px-3 py-2">{r.version}</td>
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.author}</td>
                    <td className="px-3 py-2">{r.notes}</td>
                    <td className="px-3 py-2">{r.approvedBy || ''}</td>
                    <td className="px-3 py-2">{r.approvedDate || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <tbody>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Date of Assessment:</td>
                  <td className="px-3 py-2">{meta.assessmentDate}</td>
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Job/position:</td>
                  <td className="px-3 py-2">{meta.jobPosition}</td>
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Date Reviewed:</td>
                  <td className="px-3 py-2">{meta.reviewedDate}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Assessment performed by:</td>
                  <td className="px-3 py-2">{meta.performedBy}</td>
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Supervisor:</td>
                  <td className="px-3 py-2">{meta.supervisor}</td>
                  <td className="px-3 py-2 font-semibold bg-neutral-100/70 dark:bg-neutral-800/50">Date Implemented:</td>
                  <td className="px-3 py-2">{meta.implementedDate}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-950/30 dark:to-violet-950/30 border-b border-neutral-200 dark:border-neutral-700">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Task & hazard register (digitized from PDF)</h3>
        </div>
        {filteredRows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 p-4">No matching rows in this table for the current search.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-neutral-100/70 dark:bg-neutral-800/50">
                <tr>
                  <th className="text-left px-3 py-2">Task</th>
                  <th className="text-left px-3 py-2">Hazards present</th>
                  <th className="text-left px-3 py-2">Inherent risk</th>
                  <th className="text-left px-3 py-2">Hierarchy of controls in place</th>
                  <th className="text-left px-3 py-2">Residual risk</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={`${r.task}-${r.inherent}`} className="border-t border-neutral-200 dark:border-neutral-700 align-top">
                    <td className="px-3 py-2 font-medium">{r.task}</td>
                    <td className="px-3 py-2">{r.hazards}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${riskTone(
                          extractRiskScore(r.inherent)
                        )}`}
                      >
                        {r.inherent}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.controls}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${riskTone(
                          extractRiskScore(r.residual)
                        )}`}
                      >
                        {r.residual}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
