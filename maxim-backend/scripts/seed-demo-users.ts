/**
 * Seed test users for on-site testing (Labourer, Supervisor, HR).
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-demo-users.ts
 *
 * Creates these accounts if they don't exist:
 * - Labourer: tommylabs@maximmech.com / Tommylabs2000
 * - Supervisor: jimsupervisor@gmail.com / Jimsupervisor2000
 * - HR: brandonhr@maximmech.com / Brandonhr2000
 */

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const TEST_USERS = [
  { email: 'tommylabs@maximmech.com', password: 'Tommylabs2000', firstName: 'Tommy', lastName: 'Labs', role: 'labourer' as const },
  { email: 'jimsupervisor@gmail.com', password: 'Jimsupervisor2000', firstName: 'Jim', lastName: 'Supervisor', role: 'supervisor' as const },
  { email: 'brandonhr@maximmech.com', password: 'Brandonhr2000', firstName: 'Brandon', lastName: 'HR', role: 'hr' as const },
]

async function main() {
  for (const u of TEST_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    const passwordHash = await bcrypt.hash(u.password, 12)
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, firstName: u.firstName, lastName: u.lastName, role: u.role, isActive: true, hasCompletedSetup: true },
      })
      console.log('Updated:', u.email, u.role)
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          isActive: true,
          hasCompletedSetup: true,
        },
      })
      console.log('Created:', u.email, u.role)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
