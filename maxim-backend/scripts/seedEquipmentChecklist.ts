import { prisma } from '../src/lib/prisma'
import { buildEquipmentInspectionChecklistFields } from '../src/seed/equipmentInspectionChecklistFields'

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'

async function seedEquipmentChecklist() {
  console.log('Seeding Equipment Inspection Checklist...')

  const existing = await prisma.pdfTemplate.findFirst({
    where: { name: 'Equipment Inspection Checklist', isActive: true },
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

  const fields = buildEquipmentInspectionChecklistFields()

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
      name: 'Equipment Inspection Checklist',
      description: 'Pre-operational equipment inspection checklist (daily). Sections: General, Tires, Operating System, Fluids & Belts, Fuel, Steering, Lift System, Brakes, Gauges.',
      filePath: `${CUSTOM_TEMPLATE_PREFIX}${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      pageCount: 1,
      assignedRoles: ['labourer', 'supervisor'],
      assignedUserIds: [],
      createdById: admin.id,
      fields: { create: mappedFields as any },
    },
  })

  console.log(`Created template: ${created.id}`)
}

seedEquipmentChecklist()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
