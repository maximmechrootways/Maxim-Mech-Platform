import { reconcileAllCertificateTrainingLinks } from '../src/services/certificateTrainingSync'
import { prisma } from '../src/lib/prisma'

async function main() {
  const stats = await reconcileAllCertificateTrainingLinks()
  const certs = await prisma.certificate.count()
  const linked = await prisma.employeeDocument.count({ where: { certificateId: { not: null } } })
  console.log(JSON.stringify({ stats, certificatesTotal: certs, trainingDocsWithCertificateId: linked }, null, 2))
}

main().finally(() => prisma.$disconnect())
