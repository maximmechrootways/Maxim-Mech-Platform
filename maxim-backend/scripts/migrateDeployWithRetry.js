/* eslint-disable no-console */
const { spawnSync } = require('child_process')

const MAX_ATTEMPTS = Number(process.env.PRISMA_MIGRATE_MAX_ATTEMPTS || 5)
const RETRY_DELAY_MS = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || 3000)

function sleep(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    // Busy-wait is acceptable for this short-lived deploy helper.
  }
}

function isAdvisoryLockTimeout(output) {
  const text = String(output || '').toLowerCase()
  return (
    text.includes('p1002') &&
    (text.includes('advisory lock') || text.includes('timed out trying to acquire'))
  )
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  console.log(`[migrate] Attempt ${attempt}/${MAX_ATTEMPTS}: prisma migrate deploy`)
  const result = spawnSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
    shell: true,
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status === 0) {
    console.log('[migrate] Migration deploy succeeded.')
    process.exit(0)
  }

  if (result.error) {
    console.error('[migrate] Failed to execute Prisma CLI:', result.error.message)
  }

  const combined = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`
  const canRetry = attempt < MAX_ATTEMPTS && isAdvisoryLockTimeout(combined)
  if (!canRetry) {
    console.error('[migrate] Migration deploy failed and will not be retried.')
    process.exit(result.status || 1)
  }

  console.warn(`[migrate] Advisory lock timeout detected; retrying in ${RETRY_DELAY_MS}ms...`)
  sleep(RETRY_DELAY_MS)
}

process.exit(1)
