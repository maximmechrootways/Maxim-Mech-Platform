/**
 * Custom fields for pipeline / pressure-test safety forms (FormFill + FormReview).
 * Uses [SECTION] markers for review grouping; TEXT/DATE/CHECKBOX/SIGNATURE/NUMBER.
 */

type FieldDef = { type: 'TEXT' | 'DATE' | 'SIGNATURE' | 'CHECKBOX' | 'NUMBER'; label: string; required: boolean }

export function buildPressureTestingChecklistFields(): FieldDef[] {
  return [
    { type: 'TEXT', label: '[SECTION]Record & identification', required: false },
    { type: 'TEXT', label: 'Pressure test record no.', required: true },
    { type: 'TEXT', label: 'Pressure test plan number', required: false },
    { type: 'TEXT', label: 'Pressure system ID', required: false },

    { type: 'TEXT', label: '[SECTION]Test parameters', required: false },
    { type: 'CHECKBOX', label: 'Type of test — Hydrostatic', required: false },
    { type: 'CHECKBOX', label: 'Type of test — Pneumatic', required: false },
    { type: 'TEXT', label: 'Required test pressure', required: false },
    { type: 'TEXT', label: 'Test fluid', required: false },
    { type: 'TEXT', label: 'Actual test fluid temp.', required: false },
    { type: 'TEXT', label: 'Test starting time', required: false },
    { type: 'TEXT', label: 'Test ending time', required: false },
    { type: 'TEXT', label: 'Test duration (hours / minutes)', required: false },
    { type: 'TEXT', label: 'Actual holding time', required: false },

    { type: 'TEXT', label: '[SECTION]Test equipment — pressure gauge', required: false },
    { type: 'TEXT', label: 'Gauge type', required: false },
    { type: 'TEXT', label: 'Pressure range', required: false },
    { type: 'DATE', label: 'Calibration date', required: false },
    { type: 'TEXT', label: 'Actual test pressure (gauge reading)', required: false },

    { type: 'TEXT', label: '[SECTION]Environmental controls', required: false },
    { type: 'TEXT', label: 'Exclusion zone for safety of people (actual safe distance required)', required: false },
    { type: 'TEXT', label: 'Test area controls (barricades, signage, etc.)', required: false },
    { type: 'TEXT', label: 'Actual disposal of test fluid', required: false },

    { type: 'TEXT', label: '[SECTION]Results', required: false },
    { type: 'CHECKBOX', label: 'Inspection — Satisfactory', required: false },
    { type: 'CHECKBOX', label: 'Inspection — Unsatisfactory', required: false },
    { type: 'TEXT', label: 'Inspection — explain (if unsatisfactory)', required: false },
    { type: 'CHECKBOX', label: 'Pressure test — Satisfactory', required: false },
    { type: 'CHECKBOX', label: 'Pressure test — Unsatisfactory', required: false },
    { type: 'TEXT', label: 'Pressure test — explain (if unsatisfactory)', required: false },
    { type: 'TEXT', label: 'Remarks', required: false },

    { type: 'TEXT', label: '[SECTION]Sign-off', required: false },
    { type: 'TEXT', label: 'Mechanic performing test (print name)', required: false },
    { type: 'SIGNATURE', label: 'Mechanic performing test — signature', required: true },
    { type: 'DATE', label: 'Mechanic — date', required: true },
    { type: 'TEXT', label: 'Inspector witnessing test (print name)', required: false },
    { type: 'SIGNATURE', label: 'Inspector witnessing test — signature', required: true },
    { type: 'DATE', label: 'Inspector — date', required: true },
  ]
}

export function buildActivePipelineConnectionsHydrocarbonsFields(): FieldDef[] {
  const procedureItems = [
    'Staff Notified',
    'Shut off Valves Identified',
    'Purge with Nitrogen',
    'Purge with Argon',
    'Purge with Ventilation',
    'Within 3 meters of Opening',
    'Any Ignition source within 3 meters',
    'Indoors',
    'Outdoors',
  ] as const

  const fields: FieldDef[] = [
    { type: 'TEXT', label: '[SECTION]Project & location', required: false },
    { type: 'TEXT', label: 'Project', required: true },
    { type: 'TEXT', label: 'Street', required: false },
    { type: 'TEXT', label: 'City', required: false },
    { type: 'DATE', label: 'Date', required: true },
    { type: 'TEXT', label: 'Owner', required: false },
    { type: 'TEXT', label: 'Consultant', required: false },
    { type: 'TEXT', label: 'Drawing', required: false },
    { type: 'TEXT', label: 'Location', required: false },

    { type: 'TEXT', label: '[SECTION]System type', required: false },
    { type: 'CHECKBOX', label: 'Engine Oil', required: false },
    { type: 'CHECKBOX', label: 'Gasoline', required: false },
    { type: 'CHECKBOX', label: 'Natural Gas', required: false },
    { type: 'CHECKBOX', label: 'Diesel', required: false },
    { type: 'CHECKBOX', label: 'AV Gas', required: false },
    { type: 'CHECKBOX', label: 'Hydrocarbon', required: false },
    { type: 'CHECKBOX', label: 'Vapours', required: false },
    { type: 'TEXT', label: 'Other (describe)', required: false },

    { type: 'TEXT', label: '[SECTION]System composition', required: false },
    { type: 'TEXT', label: 'Size of Pipe', required: false },
    { type: 'TEXT', label: 'Isolation Valve', required: false },
    { type: 'TEXT', label: 'EX. Valve Distance', required: false },
    { type: 'TEXT', label: 'Type of pipe', required: false },
    { type: 'TEXT', label: 'Location of Tie in', required: false },
    { type: 'TEXT', label: 'Type of Welding', required: false },
    { type: 'TEXT', label: 'Pressure', required: false },
    { type: 'TEXT', label: 'Hot Tapping', required: false },

    { type: 'TEXT', label: '[SECTION]Connection procedure', required: false },
  ]

  for (const item of procedureItems) {
    fields.push({
      type: 'TEXT',
      label: `[DROPDOWN]${item}::Yes|No`,
      required: false,
    })
  }
  fields.push({
    type: 'TEXT',
    label: 'Connection procedure — description (shared notes; explain any "No" above)',
    required: false,
  })

  fields.push(
    { type: 'TEXT', label: '[SECTION]Sign-off', required: false },
    { type: 'TEXT', label: 'Date left in service', required: false },
    { type: 'SIGNATURE', label: 'Signature', required: true },
    { type: 'DATE', label: 'Sign-off date', required: true }
  )

  return fields
}

const DRAIN_VENT_TEST_TYPES = ['Standing water', 'Ball', 'Hydrostatic', 'Pneumatic', 'Smoke', 'Visual'] as const

const WITNESS_ROLES = [
  'Company name',
  'Installing Contractor',
  'Testing Contractor',
  'Property owner (if required)',
  'Consultant (if required)',
] as const

export function buildDrainAndVentTestFormFields(): FieldDef[] {
  const fields: FieldDef[] = [
    { type: 'TEXT', label: '[SECTION]General project information', required: false },
    { type: 'TEXT', label: 'Project', required: true },
    { type: 'TEXT', label: 'Address', required: false },
    { type: 'TEXT', label: 'City', required: false },
    { type: 'DATE', label: 'Date', required: true },
    { type: 'TEXT', label: 'System', required: false },
    { type: 'TEXT', label: 'Engineer', required: false },

    { type: 'TEXT', label: '[SECTION]System description', required: false },
    { type: 'TEXT', label: 'Pipe Type', required: false },
    { type: 'TEXT', label: 'Total Length', required: false },
    { type: 'TEXT', label: 'Sizes', required: false },
    { type: 'TEXT', label: 'Slope', required: false },
    { type: 'TEXT', label: '[DROPDOWN]Above Ground::Yes|No', required: false },
    { type: 'TEXT', label: '[DROPDOWN]Below Ground::Yes|No', required: false },

    { type: 'TEXT', label: '[SECTION]Test description', required: false },
  ]

  for (const t of DRAIN_VENT_TEST_TYPES) {
    fields.push(
      { type: 'TEXT', label: `${t} — Duration`, required: false },
      { type: 'TEXT', label: `[DROPDOWN]${t} — Leaks::Yes|No`, required: false },
      { type: 'TEXT', label: `${t} — % of Leaks`, required: false },
      { type: 'TEXT', label: `[DROPDOWN]${t} — Acceptable::Yes|No`, required: false },
      { type: 'TEXT', label: `${t} — Comments`, required: false }
    )
  }

  fields.push({ type: 'TEXT', label: '[SECTION]Test witnessed by', required: false })
  for (const role of WITNESS_ROLES) {
    fields.push(
      { type: 'TEXT', label: `${role} — print name`, required: false },
      { type: 'SIGNATURE', label: `${role} — signature`, required: false },
      { type: 'DATE', label: `${role} — date`, required: false }
    )
  }

  return fields
}
