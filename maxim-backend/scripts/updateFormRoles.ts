import { prisma } from '../src/lib/prisma'

async function updateFormRoles() {
  console.log('Updating assigned roles for existing custom templates...')

  const updates = [
    { name: 'Equipment Inspection Checklist', roles: ['labourer', 'supervisor'] },
    { name: 'Investigation Kit', roles: ['supervisor'] },
    { name: 'Incident Reports Form', roles: ['supervisor'] },
  ]

  for (const info of updates) {
    const affected = await prisma.pdfTemplate.updateMany({
      where: {
        name: info.name,
        isActive: true, // only update active ones
      },
      data: {
        assignedRoles: info.roles,
      },
    })
    console.log(`Updated ${info.name}: ${affected.count} record(s) -> [${info.roles.join(', ')}]`)
  }

  console.log('Finished updating roles.')
}

updateFormRoles()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
