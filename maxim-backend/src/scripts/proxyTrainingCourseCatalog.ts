import { prisma } from '../lib/prisma'
import { generateAccessToken } from '../utils/jwt'

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: { in: ['hr', 'owner'] }, isActive: true },
    select: { id: true, email: true, role: true },
  })
  if (!user) throw new Error('no user')
  const token = generateAccessToken({ id: user.id, email: user.email, role: user.role })
  const res = await fetch('http://localhost:5173/training-course-types', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`proxy failed ${res.status} ${JSON.stringify(body)}`)
  if (!Array.isArray(body) || body.length < 11) throw new Error('unexpected body')
  console.log(JSON.stringify({ proxyStatus: res.status, count: body.length, via: 'vite->backend' }))
  console.log('VITE PROXY CHECK PASSED')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
