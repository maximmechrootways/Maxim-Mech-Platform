/**
 * Field definitions for the Legislative Compliance Evaluation custom form (FormFill).
 * Mirrors the downloadable Compliance Evaluation Checklist (reference document).
 */

export type LcRow = { id: string; cite: string; short: string }

export const LEGISLATIVE_COMPLIANCE_SECTIONS: { title: string; rows: LcRow[] }[] = [
  {
    title: 'O. REGULATION 297/13: OHS AWARENESS AND TRAINING',
    rows: [
      { id: '297-1', cite: 'O.Reg.297/13,s.2', short: 'Worker Awareness — training on duties/rights/JHSC/MOL; records 3yr' },
      { id: '297-2', cite: 'O.Reg.297/13,s.3', short: 'Supervisor Training — hazards/inspections/investigations; records 3yr' },
      { id: '297-3', cite: 'O.Reg.297/13,s.7', short: 'JHSC Certification — 20+ workers: 1 mgmt + 1 worker cert; valid 3yr' },
      { id: '297-4', cite: 'O.Reg.297/13,s.7', short: 'Working at Heights — MOL WAH training; valid 3yr; certificates carried' },
    ],
  },
  {
    title: 'O. REGULATION 860: WHMIS',
    rows: [
      { id: '860-1', cite: 'O.Reg.860,s.3', short: 'WHMIS Program — written program ID/SDS/labels/training/review' },
      { id: '860-2', cite: 'O.Reg.860,s.5', short: 'SDSs Available — current SDSs; English/French; updated 90d' },
      { id: '860-3', cite: 'O.Reg.860,s.6-7', short: 'Labels Intact — supplier labels; secondary labeled per reg' },
      { id: '860-4', cite: 'O.Reg.860,s.8-9', short: 'Worker Training — WHMIS 2015; product-specific hazards/PPE/spills' },
    ],
  },
  {
    title: 'O. REGULATION 213/91: CONSTRUCTION PROJECTS',
    rows: [
      { id: '213-1', cite: 'O.Reg.213/91,s.6', short: 'Notice of Project — Form 0175 >$50K; Form 1000 constructor registration' },
      { id: '213-2', cite: 'O.Reg.213/91,s.26', short: 'Fall Protection >3m — system identified; harness; anchor; daily inspection' },
      { id: '213-3', cite: 'O.Reg.213/91,s.26.3', short: 'Guardrails — heights, load, openings; daily inspect' },
      { id: '213-4', cite: 'O.Reg.213/91,s.126-135', short: 'Scaffolding >7.5m — engineer design; competent erection; drawings on site' },
      { id: '213-5', cite: 'O.Reg.213/91,s.145', short: 'Scaffold Inspection — competent inspect; green/red tags; records' },
      { id: '213-6', cite: 'O.Reg.213/91,s.222-234', short: 'Excavation >1.2m — shoring/sloping; engineer drawings >6m; daily inspection' },
      { id: '213-7', cite: 'O.Reg.213/91,s.264-272', short: 'Confined Space Entry — permit; atmospheric testing; standby; rescue' },
      { id: '213-8', cite: 'O.Reg.213/91,s.107-158', short: 'Mobile Equipment — seat belts; loads secured; tag lines' },
      { id: '213-9', cite: 'O.Reg.213/91,s.188-192', short: 'Electrical Safety — temp distribution CSA; GFCI; cords; clearances' },
    ],
  },
  {
    title: 'O. REGULATION 851: INDUSTRIAL ESTABLISHMENTS',
    rows: [
      { id: '851-1', cite: 'O.Reg.851,s.24-25', short: 'Machine Guarding — point of operation; interlocks; belts/pulleys guarded' },
      { id: '851-2', cite: 'O.Reg.851,s.27', short: 'Emergency Stops — red/mushroom; accessible; test regularly' },
      { id: '851-3', cite: 'O.Reg.851,s.42', short: 'Lockout Program — written procedures; isolation; verification; training' },
      { id: '851-4', cite: 'O.Reg.851,s.42', short: 'Lockout Devices — personal locks; tags; group lockout boxes' },
      { id: '851-5', cite: 'O.Reg.851,s.40', short: 'Electrical Panels — 1m clearance; covers; blanks; labeled circuits' },
      { id: '851-6', cite: 'O.Reg.851,s.44', short: 'Electrical Tools — double-insulated or grounded; no tape repairs' },
      { id: '851-7', cite: 'O.Reg.851,s.13-14', short: 'Fall Protection — guardrails >3m; platforms planked; openings protected' },
      { id: '851-8', cite: 'O.Reg.851,s.10', short: 'Housekeeping — floors clean/dry; aisles clear; spills cleaned' },
      { id: '851-9', cite: 'O.Reg.851,s.19', short: 'Lighting Levels — general/precision per reg; emergency lighting' },
    ],
  },
  {
    title: 'O. REGULATION 381/15: NOISE',
    rows: [
      { id: '381-1', cite: 'O.Reg.381/15,s.3-4', short: 'Noise Assessment — >82dBA; qualified person; reassess when changed' },
      { id: '381-2', cite: 'O.Reg.381/15,s.5-6', short: 'Hearing Protection — >85dBA 8hr TWA; training; double >100dBA' },
      { id: '381-3', cite: 'O.Reg.381/15,s.7', short: 'Engineering Controls — reduce noise; maintained; effectiveness verified' },
      { id: '381-4', cite: 'O.Reg.381/15,s.8-9', short: 'Audiometric Testing — >85dBA; baseline; annual; records 20yr' },
    ],
  },
  {
    title: 'O. REGULATION 632/05: CONFINED SPACES',
    rows: [
      { id: '632-1', cite: 'O.Reg.632/05,s.3', short: 'CS Program Written — identification, hazard assessment, procedures, training' },
      { id: '632-2', cite: 'O.Reg.632/05,s.5-6', short: 'CS Identified & Assessed — hazard assessments; reassessed when changes' },
      { id: '632-3', cite: 'O.Reg.632/05,s.7', short: 'Entry Procedures — isolation, ventilation, testing, PPE, communication' },
      { id: '632-4', cite: 'O.Reg.632/05,s.8', short: 'Entry Permits — per entry; hazards; tests; rescue; signed authorized' },
      { id: '632-5', cite: 'O.Reg.632/05,s.9', short: 'Atmospheric Testing — O2/LEL/toxic; continuous monitoring; calibrated' },
      { id: '632-6', cite: 'O.Reg.632/05,s.10-11', short: 'Attendant & Rescue — trained attendant; communication; rescue equipment' },
      { id: '632-7', cite: 'O.Reg.632/05,s.12', short: 'CS Training — before entry; hazards; controls; records' },
    ],
  },
  {
    title: 'O. REGULATION 559/22: NALOXONE KITS',
    rows: [
      { id: '559-1', cite: 'O.Reg.559/22,s.3', short: 'Risk Assessment — opioid overdose risk; activities; location; populations' },
      { id: '559-2', cite: 'O.Reg.559/22,s.4', short: 'Naloxone Kits — where risk identified; accessible; not expired' },
      { id: '559-3', cite: 'O.Reg.559/22,s.5', short: 'Naloxone Training — overdose signs; administering; calling EMS; records' },
    ],
  },
  {
    title: 'O. REGULATION 833: BIOLOGICAL/CHEMICAL AGENTS',
    rows: [
      { id: '833-1', cite: 'O.Reg.833,s.4-6', short: 'Exposure Assessment — qualified person; monitoring if near limits' },
      { id: '833-2', cite: 'O.Reg.833,s.7-9', short: 'Control Measures — hierarchy; maintained; workers trained' },
      { id: '833-3', cite: 'O.Reg.833,s.10-12', short: 'Air Monitoring — accredited lab; results communicated; records 20yr' },
      { id: '833-4', cite: 'O.Reg.833,s.13-20', short: 'Designated Substances — program if applicable; surveillance; records 30yr' },
    ],
  },
  {
    title: 'O. REGULATION 1101: FIRST AID (WSIA)',
    rows: [
      { id: '1101-1', cite: 'O.Reg.1101,s.3, Sched.1', short: 'First Aid Kits — per Schedule; inspected monthly; replenished' },
      { id: '1101-2', cite: 'O.Reg.1101,s.4, Sched.2', short: 'Certified First Aiders — per Schedule; SFA+CPR; certificates posted' },
      { id: '1101-3', cite: 'O.Reg.1101,s.5, Sched.3', short: 'First Aid Room — if required per Schedule 3; equipped; sanitary' },
      { id: '1101-4', cite: 'O.Reg.1101,s.6', short: 'First Aid Records — register of treatment; records 3yr minimum' },
    ],
  },
  {
    title: 'FIRE CODE: O. REG. 213/07',
    rows: [
      { id: 'FIRE-1', cite: 'O.Reg.213/07,s.2.8', short: 'Fire Extinguishers — per occupancy; monthly inspect; annual maintenance' },
      { id: 'FIRE-2', cite: 'O.Reg.213/07,s.2.8', short: 'Emergency Evacuation Plan — alarm, routes, assembly, head count' },
      { id: 'FIRE-3', cite: 'O.Reg.213/07,s.2.7', short: 'Exit Signs & Lighting — illuminated; emergency backup 90min' },
      { id: 'FIRE-4', cite: 'O.Reg.213/07,s.2.8', short: 'Fire Drills — minimum annually; documented; deficiencies corrected' },
    ],
  },
  {
    title: 'TDG: TRANSPORTATION OF DANGEROUS GOODS',
    rows: [
      { id: 'TDG-1', cite: 'TDG Regs SOR/2001-286,s.6', short: 'TDG Training — certificate valid 3yr; classification; documentation' },
      { id: 'TDG-2', cite: 'TDG Regs,s.3-5', short: 'Classification & Documentation — UN#, shipping name, class, PG' },
      { id: 'TDG-3', cite: 'TDG Regs,s.4-5', short: 'Placarding & Labels — vehicles placarded; small containers labeled' },
      { id: 'TDG-4', cite: 'TDG Regs,s.7', short: 'Emergency Response Plan — if threshold quantities; TC approved' },
    ],
  },
  {
    title: 'EPA: O. REG. 224/07 SPILL PREVENTION',
    rows: [
      { id: 'EPA-1', cite: 'O.Reg.224/07,s.4-5', short: 'Spill Prevention Plan — if thresholds exceeded; containment; reporting' },
      { id: 'EPA-2', cite: 'O.Reg.224/07,s.6', short: 'Secondary Containment — 110% largest container or 100% total' },
      { id: 'EPA-3', cite: 'O.Reg.224/07,s.9', short: 'Spill Reporting — MOE Spill Action Centre; timeframes; records' },
      { id: 'EPA-4', cite: 'O.Reg.224/07,s.7', short: 'Spill Response Equipment — kits; inspect; replenish; training' },
    ],
  },
  {
    title: 'ELECTRICITY ACT: O. REG. 164/99',
    rows: [
      { id: 'ELEC-1', cite: 'O.Reg.164/99,s.2', short: 'OESC Compliance — licensed electricians; ESA inspections' },
      { id: 'ELEC-2', cite: 'O.Reg.164/99,s.7', short: 'ESA Inspections — new/altered installations; Certificate of Inspection' },
      { id: 'ELEC-3', cite: 'O.Reg.164/99,s.8', short: 'Electrical Permits — before work; posted; final inspection before energize' },
    ],
  },
]

function toDropdownLabel(row: LcRow): string {
  const body = `${row.id} ${row.short}`.trim()
  const max = 160
  const trimmed = body.length > max ? `${body.slice(0, max - 1)}…` : body
  return `[DROPDOWN] ${trimmed}::Yes|No|N/A`
}

export function buildLegislativeComplianceEvaluationFields(): Array<{ type: string; label: string; required: boolean }> {
  const fields: Array<{ type: string; label: string; required: boolean }> = [
    { type: 'TEXT', label: '[SECTION]Evaluation header', required: false },
    { type: 'TEXT', label: 'Company Name (Maxim Mechanical Group Inc.)', required: true },
    { type: 'TEXT', label: 'Project/Site', required: true },
    { type: 'DATE', label: 'Evaluation Date', required: true },
    { type: 'TEXT', label: 'Evaluator(s)', required: true },
    { type: 'DATE', label: 'Next Review', required: true },
    { type: 'TEXT', label: 'INSTRUCTIONS: Verify through observation (O), documentation (D). Check YES/NO/N/A. Document findings/corrective actions in Notes.', required: false },
    { type: 'TEXT', label: 'Complete annually minimum as per COR 2020 Element 13.4', required: false },
  ]

  for (const sec of LEGISLATIVE_COMPLIANCE_SECTIONS) {
    fields.push({ type: 'TEXT', label: `[SECTION]${sec.title}`, required: false })
    for (const row of sec.rows) {
      fields.push({ type: 'TEXT', label: toDropdownLabel(row), required: false })
      fields.push({ type: 'TEXT', label: `${row.id} Notes / corrective actions (${row.cite})`, required: false })
    }
  }

  fields.push(
    { type: 'TEXT', label: 'Retain 2+ years. Available to MOL Inspector and COR Auditor. Next evaluation within 12 months.', required: false },
    { type: 'TEXT', label: '[SECTION]Overall compliance summary', required: false },
    { type: 'TEXT', label: 'Overall compliance summary', required: false },
    { type: 'TEXT', label: '[SECTION]Sign-offs', required: false },
    { type: 'TEXT', label: 'Management Representative — Name', required: false },
    { type: 'SIGNATURE', label: 'Management Representative — Signature', required: false },
    { type: 'DATE', label: 'Management Representative — Date', required: false },
    { type: 'TEXT', label: 'Worker Representative / HSR / JHSC — Name', required: false },
    { type: 'SIGNATURE', label: 'Worker Representative / HSR / JHSC — Signature', required: false },
    { type: 'DATE', label: 'Worker Representative / HSR / JHSC — Date', required: false }
  )

  return fields
}
