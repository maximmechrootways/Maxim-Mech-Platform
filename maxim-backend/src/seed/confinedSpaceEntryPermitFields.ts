/**
 * Confined Space Entry Permit — native FormFill fields (aligns with reference PDF 2026).
 */

function buildContinuousMonitoringRows(prefix: string, slots: number) {
  const out: Array<{ type: string; label: string; required: boolean }> = []
  for (let i = 1; i <= slots; i++) {
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — Time`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — O₂ %`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — LEL %`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — Carbon monoxide (ppm)`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — Carbon dioxide (ppm)`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — Hydrogen sulfide (ppm)`, required: false })
    out.push({ type: 'TEXT', label: `${prefix} Slot ${i} — Other (ppm)`, required: false })
  }
  return out
}

export function buildConfinedSpaceEntryPermitFields(): Array<{ type: string; label: string; required: boolean }> {
  return [
    { type: 'TEXT', label: '[SECTION]Permit details', required: false },
    { type: 'TEXT', label: 'Permit number / ID', required: true },
    { type: 'DATE', label: 'Permit date', required: true },
    { type: 'TEXT', label: 'Time — Entry authorized from', required: false },
    { type: 'TEXT', label: 'Time — Entry authorized until (or duration)', required: false },
    { type: 'TEXT', label: 'Work location / area', required: true },
    { type: 'TEXT', label: 'Confined space name / ID', required: true },
    { type: 'TEXT', label: 'Reason for entry / work to be performed', required: true },

    { type: 'TEXT', label: '[SECTION]Hazards & precautions', required: false },
    {
      type: 'TEXT',
      label: 'Hazards identified (atmospheric, engulfment, entrapment, electrical, other)',
      required: true,
    },
    { type: 'CHECKBOX', label: 'Ventilation plan in place and verified', required: false },
    { type: 'CHECKBOX', label: 'Isolation / lockout / zero energy verified', required: false },
    { type: 'CHECKBOX', label: 'Lighting and access adequate', required: false },
    { type: 'TEXT', label: 'Other controls / precautions', required: false },

    { type: 'TEXT', label: '[SECTION]Atmospheric testing (pre-entry)', required: false },
    { type: 'TEXT', label: 'Oxygen (O₂) %', required: false },
    { type: 'TEXT', label: 'LEL % or combustible gas reading', required: false },
    { type: 'TEXT', label: 'H₂S / toxic ppm (if applicable)', required: false },
    { type: 'TEXT', label: 'CO ppm (if applicable)', required: false },
    { type: 'TEXT', label: 'Other readings / instruments & serial #', required: false },
    { type: 'TEXT', label: 'Tester name', required: false },
    { type: 'DATE', label: 'Test date / time', required: false },
    { type: 'CHECKBOX', label: 'Continuous atmospheric monitoring during entry', required: false },
    { type: 'TEXT', label: '[SECTION]Continuous monitoring documentation', required: false },
    {
      type: 'TEXT',
      label:
        '[INFO]Acceptable limits: O₂ 19.5% to 23%. Hot work: under 10% LEL. Cold work: under 10% LEL (clean and inspect under 20% LEL). Carbon monoxide: under 6 ppm. Carbon dioxide: under 1250 ppm. Hydrogen sulfide: under 2.5 ppm.',
      required: false,
    },
    ...buildContinuousMonitoringRows('Monitoring set A', 7),
    ...buildContinuousMonitoringRows('Monitoring set B', 7),

    { type: 'TEXT', label: '[SECTION]Personnel', required: false },
    { type: 'TEXT', label: 'Attendant name (must remain stationed outside)', required: true },
    { type: 'TEXT', label: 'Attendant contact / radio or phone', required: false },
    { type: 'TEXT', label: 'Entrant 1 — Name', required: false },
    { type: 'TEXT', label: 'Entrant 2 — Name', required: false },
    { type: 'TEXT', label: 'Entrant 3 — Name', required: false },
    { type: 'TEXT', label: 'Entry supervisor / permit issuer name', required: true },

    { type: 'TEXT', label: '[SECTION]Rescue & emergency', required: false },
    { type: 'TEXT', label: 'Rescue method / equipment available at entry', required: false },
    { type: 'TEXT', label: 'Emergency contact / muster point', required: false },

    { type: 'TEXT', label: '[SECTION]Acknowledgements', required: false },
    { type: 'CHECKBOX', label: 'Entrants have reviewed hazards and permit conditions', required: true },
    { type: 'CHECKBOX', label: 'Attendant understands duties and will not enter the confined space', required: true },

    { type: 'TEXT', label: '[SECTION]Signatures', required: false },
    { type: 'SIGNATURE', label: 'Entry supervisor — Signature', required: false },
    { type: 'DATE', label: 'Entry supervisor — Date', required: false },
    { type: 'SIGNATURE', label: 'Attendant — Signature', required: false },
    { type: 'DATE', label: 'Attendant — Date', required: false },
    { type: 'SIGNATURE', label: 'Lead entrant — Signature', required: false },
    { type: 'DATE', label: 'Lead entrant — Date', required: false },
  ]
}
