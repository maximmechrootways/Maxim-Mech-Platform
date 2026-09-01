/* One-off: enqueue [TEST] forms digest for first active owner. Run: node -r dotenv/config scripts/runTestFormsDigest.js */
const { PrismaClient } = require('@prisma/client')
const { enqueueTestFormsApprovalDigestForUser } = require('../dist/services/formsApprovalDigestService')

const prisma = new PrismaClient()

async function main() {
  const u = await prisma.user.findFirst({
    where: { role: 'owner', isActive: true, emailNotificationsEnabled: true },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  if (!u) {
    console.error('No active owner with email notifications enabled.')
    process.exitCode = 1
    return
  }
  const result = await enqueueTestFormsApprovalDigestForUser(u.id)
  console.log(
    JSON.stringify(
      {
        ...result,
        targetUserId: u.id,
        targetEmail: u.email,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
