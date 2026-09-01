/**
 * Washroom Inspection Checklist — native FormFill fields.
 * Structured to render as a single daily inspection table.
 * Row order matches the standard paper / site checklist (toilet paper first, etc.).
 */

const WASHROOM_ITEMS: Array<{ item: string; description: string }> = [
  { item: 'Toilet Paper', description: 'Restocked, with clean dispenser' },
  { item: 'Lighting', description: 'All lights operational, no burned-out bulbs' },
  { item: 'Maintenance Log', description: 'Form is filled, signed and dated of actions taken during maintenance.' },
  { item: 'Maintenance Notes', description: 'See section blow to maintenance notes' },
  { item: 'Door', description: 'Handle and vertical surface clean' },
  {
    item: 'Feminine Products disposal or bags',
    description: 'Unit is clean without smudges or streaks, and the bag is replaced.',
  },
  { item: 'Floors', description: 'Clean, without dirt or debris. Trip and fall hazards' },
  { item: 'Mirror', description: 'Clean and streak-free with no obvious smudges, splatters, or fingerprints' },
  { item: 'Paper Towel Dispenser', description: 'Clean, without smudges and full' },
  { item: 'Sink', description: 'Clean faucet, bowl, and drain with no build-up or clogs' },
  { item: 'Soap Dispenser', description: 'Clean and full' },
  { item: 'Trash', description: 'Emptied within the day, exterior clean and free of smudges and streaks' },
  { item: 'Walls', description: 'Clean with no obvious splatters or smudges' },
  { item: 'Urinal/Toilet', description: 'Clean with no stains or drips' },
  { item: 'Stalls', description: 'Clean. Doors operating correctly.' },
]

export function buildWashroomInspectionChecklistFields(): Array<{ type: string; label: string; required: boolean }> {
  const fields: Array<{ type: string; label: string; required: boolean }> = [
    { type: 'TEXT', label: '[SECTION]Washroom site', required: false },
    {
      type: 'TEXT',
      label: '[DROPDOWN]Washroom location::Peter Washroom|Shop Washroom|Main Office Washroom',
      required: true,
    },
    { type: 'TEXT', label: '[SECTION]Washroom Inspection Checklist', required: false },
  ]

  for (const row of WASHROOM_ITEMS) {
    fields.push(
      { type: 'CHECKBOX', label: `[WASHROOM_ITEM]${row.item}::${row.description}`, required: false },
      { type: 'TEXT', label: `[WASHROOM_NOTES]${row.item}`, required: false }
    )
  }

  fields.push(
    { type: 'TEXT', label: '[SECTION]Contact / Follow-up', required: false },
    { type: 'TEXT', label: 'After completing your inspection, are there any concerns/observations that need to be escalated:', required: false },

    { type: 'TEXT', label: '[SECTION]Inspection Sign-off', required: false },
    { type: 'DATE', label: 'Date of Inspection', required: true },
    { type: 'TEXT', label: 'Time', required: true },
    { type: 'TEXT', label: 'Facility/Location', required: true },
    { type: 'TEXT', label: 'Name of Inspector', required: true },
    { type: 'SIGNATURE', label: 'Signature', required: true }
  )

  return fields
}
