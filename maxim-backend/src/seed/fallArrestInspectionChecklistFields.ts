/**
 * Fall Arrest Inspection Checklist — native FormFill fields.
 * Daily workflow: one checklist section per submission.
 */

const FALL_ARREST_ITEMS: Array<{ group: string; item: string }> = [
  { group: 'Full Body Harness', item: 'Webbing (frayed, cuts, burns)' },
  { group: 'Full Body Harness', item: 'Stitching (loose, pulled, broken)' },
  { group: 'Full Body Harness', item: 'D-rings and buckles (deformed, cracked)' },
  { group: 'Full Body Harness', item: 'Corrosion / wear on metal hardware' },

  { group: 'Lanyard with shock absorber', item: 'Lanyard webbing/rope condition' },
  { group: 'Lanyard with shock absorber', item: 'Shock pack deployed or damaged' },
  { group: 'Lanyard with shock absorber', item: 'Connectors and hooks lock correctly' },

  { group: 'Rope grab', item: 'Cam / locking mechanism functions correctly' },
  { group: 'Rope grab', item: 'Body and connectors free of cracks/deformation' },

  { group: 'Lifeline', item: 'No cuts, burns, frays, or glazing' },
  { group: 'Lifeline', item: 'Rope diameter and condition suitable for use' },
  { group: 'Lifeline', item: 'Knots / terminations secure and protected' },

  { group: 'Anchor', item: 'Anchor point identified and rated' },
  { group: 'Anchor', item: 'Anchor connectors and slings in good condition' },
  { group: 'Anchor', item: 'Clearance and swing-fall hazards reviewed' },
]

export function buildFallArrestInspectionChecklistFields(): Array<{ type: string; label: string; required: boolean }> {
  const fields: Array<{ type: string; label: string; required: boolean }> = [
    { type: 'TEXT', label: '[SECTION]Header', required: false },
    { type: 'TEXT', label: 'Day of the Week', required: true },
    { type: 'TEXT', label: 'Inspected by', required: true },
    { type: 'TEXT', label: 'Location', required: true },
    { type: 'DATE', label: 'Inspection date', required: true },
    {
      type: 'TEXT',
      label:
        '[INFO]Inspect all fall arrest equipment before use and remove damaged equipment from service until repaired or replaced.',
      required: false,
    },
    {
      type: 'TEXT',
      label:
        '[INFO]Complete this checklist once per day. Tick each checklist item after inspection.',
      required: false,
    },
  ]

  fields.push({ type: 'TEXT', label: '[SECTION]Daily checklist', required: false })
  for (const row of FALL_ARREST_ITEMS) {
    fields.push({
      type: 'CHECKBOX',
      label: `${row.group}: ${row.item}`,
      required: false,
    })
  }

  fields.push(
    { type: 'TEXT', label: '[SECTION]Comments / notes', required: false },
    { type: 'TEXT', label: 'Comments / notes', required: false }
  )

  return fields
}

