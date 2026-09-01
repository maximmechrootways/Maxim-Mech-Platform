const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const prisma = new PrismaClient()

async function main() {
    const hash = await bcrypt.hash('password123', 10)
    await prisma.user.create({
        data: {
            email: 'frank@maximmech.com',
            firstName: 'Frank',
            lastName: 'Mech',
            passwordHash: hash,
            role: 'owner'
        }
    })
    console.log('User created')
    await prisma.$disconnect()
}
main()
