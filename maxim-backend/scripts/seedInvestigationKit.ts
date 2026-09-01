import { prisma } from '../src/lib/prisma'

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'

async function seedInvestigationKit() {
  console.log('Seeding Investigation Kit...')

  const existing = await prisma.pdfTemplate.findFirst({
    where: { name: 'Investigation Kit', isActive: true },
  })
  if (existing) {
    console.log('Template already exists, skipping.')
    return
  }

  const admin = await prisma.user.findFirst({ where: { role: 'owner' } })
  if (!admin) {
    console.log('No owner user found. Cannot seed.')
    return
  }

  const fields: { type: string; label: string; required?: boolean }[] = [
    // ==== PAGE 1: Investigation Report Form ====
    { type: 'TEXT', label: '[SECTION] Investigation Report — General Info' },
    { type: 'TEXT', label: 'Project' },
    { type: 'TEXT', label: 'Location' },
    { type: 'DATE', label: 'Date of Occurrence' },
    { type: 'TEXT', label: 'Time of Occurrence' },

    { type: 'TEXT', label: '[SECTION] Contractor / Employer Details' },
    { type: 'TEXT', label: 'Contractor/Employer' },
    { type: 'TEXT', label: "Worker's Name" },
    { type: 'TEXT', label: 'Address' },
    { type: 'TEXT', label: 'Supervisor' },
    { type: 'TEXT', label: 'Office Tel.' },
    { type: 'TEXT', label: 'Fax' },
    { type: 'TEXT', label: 'Site' },
    { type: 'TEXT', label: 'Individual Investigating Incident' },

    { type: 'TEXT', label: '[SECTION] Occurrence Type' },
    { type: 'CHECKBOX', label: 'Critical' },
    { type: 'CHECKBOX', label: 'Lost Time' },
    { type: 'CHECKBOX', label: 'Medical Aid' },
    { type: 'CHECKBOX', label: 'First Aid' },
    { type: 'CHECKBOX', label: 'Incident' },
    { type: 'CHECKBOX', label: 'Material Damage' },

    { type: 'TEXT', label: '[SECTION] Injured Worker' },
    { type: 'TEXT', label: "Injured Worker's Name" },
    { type: 'TEXT', label: "Injured Worker's Address" },
    { type: 'DATE', label: 'Date of Birth' },
    { type: 'TEXT', label: 'Yrs Experience' },
    { type: 'TEXT', label: 'Telephone #' },

    { type: 'TEXT', label: '[SECTION] Witnesses' },
    { type: 'TEXT', label: 'Witness 1 Name' },
    { type: 'TEXT', label: 'Witness 1 Employer' },
    { type: 'TEXT', label: 'Witness 1 Telephone' },
    { type: 'TEXT', label: 'Witness 1 Address' },
    { type: 'TEXT', label: 'Witness 2 Name' },
    { type: 'TEXT', label: 'Witness 2 Employer' },
    { type: 'TEXT', label: 'Witness 2 Telephone' },
    { type: 'TEXT', label: 'Witness 2 Address' },

    { type: 'TEXT', label: '[SECTION] Attending Physician' },
    { type: 'TEXT', label: 'Attending Physician Name' },
    { type: 'TEXT', label: 'Physician Telephone' },
    { type: 'TEXT', label: 'Physician Address' },

    { type: 'TEXT', label: '[SECTION] Governing Authorities' },
    { type: 'TEXT', label: 'Governing Authority Name' },
    { type: 'TEXT', label: 'I.D. #' },
    { type: 'TEXT', label: 'Branch' },

    { type: 'TEXT', label: '[SECTION] Circumstances of Occurrence' },
    { type: 'TEXT', label: 'Location of Occurrence' },
    { type: 'TEXT', label: 'Time/Date of Occurrence' },
    { type: 'TEXT', label: 'Injuries' },
    { type: 'TEXT', label: 'Reported To' },
    { type: 'TEXT', label: 'Reported By' },
    { type: 'TEXT', label: 'Time/Date Reported' },
    { type: 'TEXT', label: 'Description of Circumstances' },

    // ==== PAGE 2: Causes, Prevention, Corrective Actions ====
    { type: 'TEXT', label: '[SECTION] Basic Causes of Occurrence' },
    { type: 'TEXT', label: 'Equipment, Machinery or Materials (describe)' },
    { type: 'TEXT', label: 'Work Habits, Procedures or Direction (describe)' },
    { type: 'TEXT', label: 'Conditions (describe)' },

    { type: 'TEXT', label: '[SECTION] Prevention of Recurrence' },
    { type: 'TEXT', label: 'Prevention — By' },
    { type: 'DATE', label: 'Prevention — Date' },
    { type: 'TEXT', label: 'Prevention — List Actions' },

    { type: 'TEXT', label: '[SECTION] Corrective Follow-up Actions' },
    { type: 'TEXT', label: 'Corrective Actions — By' },
    { type: 'DATE', label: 'Corrective Actions — Date' },
    { type: 'TEXT', label: 'Corrective Actions — List Actions' },

    { type: 'TEXT', label: '[SECTION] Copies To' },
    { type: 'CHECKBOX', label: 'Senior Management' },
    { type: 'CHECKBOX', label: 'Health and Safety Worker Representative' },
    { type: 'TEXT', label: 'Other(s) (Name)' },

    // ==== Voluntary Statement Form ====
    { type: 'TEXT', label: '[SECTION] Voluntary Statement — Occurrence Info' },
    { type: 'TEXT', label: 'Re (subject)' },
    { type: 'TEXT', label: 'VS — Location of Occurrence' },
    { type: 'TEXT', label: 'VS — Date & Time of Occurrence' },
    { type: 'TEXT', label: 'VS — Date & Time Reported' },

    { type: 'TEXT', label: '[SECTION] Statement Given By' },
    { type: 'CHECKBOX', label: 'Injured Worker' },
    { type: 'CHECKBOX', label: 'Witness' },
    { type: 'CHECKBOX', label: 'Other' },
    { type: 'TEXT', label: 'Statement — Name' },
    { type: 'TEXT', label: 'Statement — Address' },
    { type: 'TEXT', label: 'Statement — Phone' },
    { type: 'TEXT', label: 'Statement (describe what happened)' },

    { type: 'TEXT', label: '[SECTION] Signatures' },
    { type: 'SIGNATURE', label: 'Signature' },
    { type: 'SIGNATURE', label: "Investigator's Signature" },
    { type: 'TEXT', label: 'Translated By' },
    { type: 'DATE', label: 'Date of Statement' },

    // ==== Notice of Occurrence (Page 1 of 2) ====
    { type: 'TEXT', label: '[SECTION] Notice of Occurrence — Ministry of Labour' },
    { type: 'TEXT', label: 'Ministry Address Line 1' },
    { type: 'TEXT', label: 'Ministry Address Line 2' },
    { type: 'TEXT', label: 'Ministry Address Line 3' },
    { type: 'TEXT', label: 'Ministry Address Line 4' },
    { type: 'TEXT', label: 'Company Address' },
    { type: 'TEXT', label: 'Nature and circumstances of the occurrence' },
    { type: 'TEXT', label: 'Body Injuries Sustained' },
    { type: 'TEXT', label: 'Description of Equipment/Machinery involved in the incident' },
    { type: 'DATE', label: 'NOO — Date of Occurrence' },
    { type: 'TEXT', label: 'NOO — Time of Occurrence' },
    { type: 'TEXT', label: 'NOO — Location' },

    // ==== Notice of Occurrence (Page 2 of 2) ====
    { type: 'TEXT', label: '[SECTION] Notice of Occurrence — Injured Worker' },
    { type: 'TEXT', label: 'NOO Injured Worker Name' },
    { type: 'TEXT', label: 'NOO Injured Worker Address' },
    { type: 'TEXT', label: 'NOO Injured Worker Telephone' },

    { type: 'TEXT', label: '[SECTION] Notice of Occurrence — Witnesses' },
    { type: 'TEXT', label: 'NOO Witness 1 Name' },
    { type: 'TEXT', label: 'NOO Witness 1 Address' },
    { type: 'TEXT', label: 'NOO Witness 1 Telephone' },
    { type: 'TEXT', label: 'NOO Witness 2 Name' },
    { type: 'TEXT', label: 'NOO Witness 2 Address' },
    { type: 'TEXT', label: 'NOO Witness 2 Telephone' },
    { type: 'TEXT', label: 'NOO Witness 3 Name' },
    { type: 'TEXT', label: 'NOO Witness 3 Address' },
    { type: 'TEXT', label: 'NOO Witness 3 Telephone' },

    { type: 'TEXT', label: '[SECTION] Notice of Occurrence — Attending Physician' },
    { type: 'TEXT', label: 'NOO Attending Physician' },
    { type: 'TEXT', label: 'NOO Physician Address' },

    { type: 'TEXT', label: '[SECTION] Steps Taken to Prevent Recurrence' },
    { type: 'TEXT', label: 'Steps taken to prevent recurrence (describe)' },

    { type: 'TEXT', label: '[SECTION] Information Provided By' },
    { type: 'TEXT', label: 'Information Provided By' },
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
      name: 'Investigation Kit',
      description: 'Investigation Report Form (occurrence details, witnesses, causes, corrective actions) and Voluntary Statement Form with signatures.',
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

seedInvestigationKit()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
