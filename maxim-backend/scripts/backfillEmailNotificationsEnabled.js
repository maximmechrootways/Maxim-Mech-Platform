/**
 * One-time: set User.emailNotificationsEnabled from uiPreferences.notificationPreferences
 * so it matches per-category toggles (fixes users stuck with master=false).
 *
 * Run from maxim-backend: node -r dotenv/config scripts/backfillEmailNotificationsEnabled.js
 */
const { PrismaClient } = require('@prisma/client')
const {
  normalizeUiPreferences,
  anyNotificationEmailCategoryEnabled,
} = require('../dist/services/uiPreferencesService')

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, uiPreferences: true, emailNotificationsEnabled: true },
  })
  let updated = 0
  for (const u of users) {
    const prefs = normalizeUiPreferences(u.uiPreferences)
    const desired = anyNotificationEmailCategoryEnabled(prefs)
    if (desired !== u.emailNotificationsEnabled) {
      await prisma.user.update({
        where: { id: u.id },
        data: { emailNotificationsEnabled: desired },
      })
      updated++
      console.log(u.email, '→', desired)
    }
  }
  console.log(JSON.stringify({ scanned: users.length, updated }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
