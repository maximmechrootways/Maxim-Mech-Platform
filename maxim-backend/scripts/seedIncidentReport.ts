import { prisma } from '../src/lib/prisma'

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'

async function seedIncidentReport() {
  console.log('Seeding Incident Reports Form...')

  const existing = await prisma.pdfTemplate.findFirst({
    where: { name: 'Incident Reports Form', isActive: true },
  })
  if (existing) {
    if (existing.filePath?.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
      console.log('Template already upgraded to custom form, skipping.')
      return
    }
    console.log('Template exists but is PDF approach. We will soft-delete or recreate it.')
    await prisma.pdfTemplate.update({
      where: { id: existing.id },
      data: { isActive: false, name: `${existing.name} (Legacy PDF)` },
    })
  }

  const admin = await prisma.user.findFirst({ where: { role: 'owner' } })
  if (!admin) {
    console.log('No owner user found. Cannot seed.')
    return
  }

  const fields: { type: string; label: string; required?: boolean }[] = [
    { type: 'TEXT', label: '[SECTION] General Information' },
    { type: 'TEXT', label: '[DROPDOWN] Event Title :: Incident | Accident | Injury | Occupational Illness', required: true },
    { type: 'DATE', label: 'Date (dd/mm/yyyy)', required: true },
    { type: 'TEXT', label: 'Name of Reporting Person', required: true },
    { type: 'TEXT', label: 'Reporting Person Contact Number', required: true },
    { type: 'TEXT', label: '[JOB_DROPDOWN] Project', required: true },
    { type: 'TEXT', label: '[DROPDOWN] Status (Select one) :: Worker | Customer | Subcontractor | Visitor | Other (Please specify below)', required: true },
    { type: 'TEXT', label: 'Other (Specify)' },

    { type: 'TEXT', label: '[SECTION] Accident Details' },
    { type: 'DATE', label: 'Date of the Incident (dd/mm/yyyy)', required: true },
    { type: 'TEXT', label: 'Time of the Incident (hh:mm)' },
    { type: 'DATE', label: 'Date the Incident was Reported' },
    { type: 'TEXT', label: 'Time Incident was Reported (hh:mm)' },
    { type: 'TEXT', label: 'Names of Persons Involved' },
    { type: 'TEXT', label: 'Job Title (If applicable)' },
    { type: 'TEXT', label: 'Location of the Incident' },
    { type: 'TEXT', label: '[DROPDOWN] Person the Incident was Reported To :: Supervisor | HSR/HS Committee | Other (please specify below)' },
    { type: 'TEXT', label: 'Other (Specify Report To)' },

    { type: 'TEXT', label: '[SECTION] Severity of Accident' },
    { type: 'TEXT', label: '[DROPDOWN] Severity :: No Injury | First Aid | Medical Aid (Beyond First Aid) | Occupational Illness | Lost Time | Fatality' },

    { type: 'TEXT', label: '[SECTION] Type of Incident' },
    { type: 'CHECKBOX', label: 'Bodily reaction and exertion' },
    { type: 'CHECKBOX', label: 'Caught in or compressed by machinery/object' },
    { type: 'CHECKBOX', label: 'Caught in or crushed in collapsing materials' },
    { type: 'CHECKBOX', label: 'Contact with electricity' },
    { type: 'CHECKBOX', label: 'Contact with objects or equipment' },
    { type: 'CHECKBOX', label: 'Contact with temperature extremes' },
    { type: 'CHECKBOX', label: 'Diving' },
    { type: 'CHECKBOX', label: 'Drowning or asphyxiation' },
    { type: 'CHECKBOX', label: 'Elevating device damage or free fall' },
    { type: 'CHECKBOX', label: 'Exposure to an explosion, fire, flood' },
    { type: 'CHECKBOX', label: 'Exposure to harmful substance(s)' },
    { type: 'CHECKBOX', label: 'Exposure to noise' },
    { type: 'CHECKBOX', label: 'Exposure to traumatic or stressful event' },
    { type: 'CHECKBOX', label: 'Fall from height' },
    { type: 'CHECKBOX', label: 'Harassment, Sexual Harassment' },
    { type: 'CHECKBOX', label: 'Heat or Cold' },
    { type: 'CHECKBOX', label: 'Injury caused by an animal/insect' },
    { type: 'CHECKBOX', label: 'Lifting and handling injury' },
    { type: 'CHECKBOX', label: 'Overexertion' },
    { type: 'CHECKBOX', label: 'Physical assault, violence' },
    { type: 'CHECKBOX', label: 'Repetitive motion' },
    { type: 'CHECKBOX', label: 'Road traffic accident' },
    { type: 'CHECKBOX', label: 'Rupture/fire boiler or pressure vessel' },
    { type: 'CHECKBOX', label: 'Slip, trip or fall (same level)' },
    { type: 'CHECKBOX', label: 'Struck against an object' },
    { type: 'CHECKBOX', label: 'Struck by moving vehicle' },
    { type: 'CHECKBOX', label: 'Struck by object' },
    { type: 'CHECKBOX', label: 'Rescue, revival, or similar emergency' },
    { type: 'CHECKBOX', label: 'Other kind of accident (please describe)' },

    { type: 'TEXT', label: '[SECTION] Body Parts Injured' },
    { type: 'CHECKBOX', label: 'Head' },
    { type: 'CHECKBOX', label: 'Multiple head locations' },
    { type: 'CHECKBOX', label: 'Face' },
    { type: 'CHECKBOX', label: 'Ear' },
    { type: 'CHECKBOX', label: 'Eye(s)' },
    { type: 'CHECKBOX', label: 'Neck' },
    { type: 'CHECKBOX', label: 'Back/Spine' },
    { type: 'CHECKBOX', label: 'Shoulder' },
    { type: 'CHECKBOX', label: 'Chest' },
    { type: 'CHECKBOX', label: 'Trunk' },
    { type: 'CHECKBOX', label: 'Multiple trunk locations' },
    { type: 'CHECKBOX', label: 'Hip' },
    { type: 'CHECKBOX', label: 'Finger(s)' },
    { type: 'CHECKBOX', label: 'Hand' },
    { type: 'CHECKBOX', label: 'Wrist' },
    { type: 'CHECKBOX', label: 'Upper limb' },
    { type: 'CHECKBOX', label: 'Multiple upper limb locations' },
    { type: 'CHECKBOX', label: 'Toe(s)' },
    { type: 'CHECKBOX', label: 'Foot' },
    { type: 'CHECKBOX', label: 'Leg' },
    { type: 'CHECKBOX', label: 'Ankle' },
    { type: 'CHECKBOX', label: 'Knee' },
    { type: 'CHECKBOX', label: 'Lower limb' },
    { type: 'CHECKBOX', label: 'Multiple lower limb locations' },
    { type: 'CHECKBOX', label: 'Multiple locations' },
    { type: 'CHECKBOX', label: 'Unknown' },

    { type: 'TEXT', label: '[SECTION] Reporting Person’s Description of the Accident/Incident/Injury' },
    { type: 'TEXT', label: 'Describe the incident in detail, including details regarding any injuries that were suffered. Include information about the specific location of the incident, equipment, machines, materials, tools, and people involved. Include/attach pictures if possible', required: true },

    { type: 'TEXT', label: '[SECTION] To Be Completed in Case of Injury/Illness' },
    { type: 'TEXT', label: 'Name of the Injured Person' },
    { type: 'TEXT', label: '[DROPDOWN] Status of Injured Person :: Worker | Customer | Contractor | Visitor | Other (please specify)' },
    { type: 'TEXT', label: 'Injured Person Phone Number' },
    { type: 'TEXT', label: 'Injured Job Title (if applicable)' },

    { type: 'TEXT', label: '[SECTION] Details of First Aid Treatment Given' },
    { type: 'TEXT', label: '[DROPDOWN] Was first aid treatment given? :: Yes | No' },
    { type: 'TEXT', label: 'Name of First Aid Attendant' },
    
    { type: 'TEXT', label: '[SECTION] Professional Medical Treatment' },
    { type: 'TEXT', label: '[DROPDOWN] Was the injured person taken to hospital? :: Yes | No' },
    { type: 'TEXT', label: 'Name of Hospital' },
    { type: 'TEXT', label: 'Hospital Address' },
    { type: 'TEXT', label: 'Mode of Transportation (e.g., ambulance, personal vehicle, etc.)' },
    { type: 'TEXT', label: '[DROPDOWN] Was the person treated by a physician? :: Yes | No' },
    { type: 'TEXT', label: 'Name of Physician' },
    { type: 'TEXT', label: 'Treatment or Care Received' },

    { type: 'TEXT', label: '[SECTION] Lost Time' },
    { type: 'TEXT', label: '[DROPDOWN] Miss work time due to Incident? :: Returned to Regular Duties with No Lost Time | Returned to Modified Duties with No Lost Time | Had Lost Time' },
    { type: 'TEXT', label: 'How many days of work did you or the injured person miss?' },
    { type: 'DATE', label: 'When did you or the injured person first return to work' },
    
    { type: 'TEXT', label: '[SECTION] Contributing Factors' },
    { type: 'TEXT', label: 'Immediate Cause(s) (Unsafe Acts or Conditions)' },
    { type: 'TEXT', label: 'Underlying Cause(s) (Personal, Job or Organizational Factors)' },
    { type: 'TEXT', label: 'Root Cause(s) (Factor permanently eliminated/modified to avoid recurrence)' },

    { type: 'TEXT', label: '[SECTION] Corrective Action to Prevent Reoccurrence' },
    { type: 'TEXT', label: 'Action 1 - Control Measure' },
    { type: 'DATE', label: 'Action 1 - Target Date' },
    { type: 'TEXT', label: 'Action 1 - Person Responsible' },
    { type: 'DATE', label: 'Action 1 - Date of Completion' },

    { type: 'TEXT', label: 'Action 2 - Control Measure' },
    { type: 'DATE', label: 'Action 2 - Target Date' },
    { type: 'TEXT', label: 'Action 2 - Person Responsible' },
    { type: 'DATE', label: 'Action 2 - Date of Completion' },

    { type: 'TEXT', label: 'Action 3 - Control Measure' },
    { type: 'DATE', label: 'Action 3 - Target Date' },
    { type: 'TEXT', label: 'Action 3 - Person Responsible' },
    { type: 'DATE', label: 'Action 3 - Date of Completion' },

    { type: 'TEXT', label: '[SECTION] Signatures' },
    { type: 'TEXT', label: 'Incident Reporter Full Name', required: true },
    { type: 'SIGNATURE', label: 'Incident Reporter Signature', required: true },
    { type: 'DATE', label: 'Date Reported', required: true },

    { type: 'TEXT', label: 'Report Approver Full Name' },
    { type: 'SIGNATURE', label: 'Report Approver Signature' },
    { type: 'DATE', label: 'Date Approved' },
  ]

  const mappedFields = fields.map((f, idx) => ({
    type: f.type,
    label: f.label,
    page: 1,
    x: 0.05,
    y: Math.max(0, Math.min(0.9, 0.05 + idx * 0.055)),
    width: f.type === 'CHECKBOX' ? 0.06 : 0.9,
    height: f.type === 'CHECKBOX' ? 0.04 : 0.05,
    required: f.required ?? false,
  }))

  const created = await prisma.pdfTemplate.create({
    data: {
      name: 'Incident Reports Form',
      description: 'Accident/Incident/Injury Reporting/Investigation Form details and corrective actions.',
      filePath: `${CUSTOM_TEMPLATE_PREFIX}${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      pageCount: 1,
      assignedRoles: ['supervisor'],
      assignedUserIds: [],
      createdById: admin.id,
      fields: { create: mappedFields as any },
    },
  })

  console.log(`Created template: ${created.id}`)
}

seedIncidentReport()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
