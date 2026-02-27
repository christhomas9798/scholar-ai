require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const bcrypt = require('bcrypt')

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    const passwordHash = await bcrypt.hash('password123', 10)

    const teachers = [
        { email: 'john.doe@school.edu', name: 'Mr. John Doe', role: 'TEACHER' },
        { email: 'sarah.wilson@school.edu', name: 'Ms. Sarah Wilson', role: 'TEACHER' },
        { email: 'michael.chen@school.edu', name: 'Mr. Michael Chen', role: 'TEACHER' },
        { email: 'emily.davis@school.edu', name: 'Ms. Emily Davis', role: 'TEACHER' },
        { email: 'james.brown@school.edu', name: 'Mr. James Brown', role: 'TEACHER' },
        { email: 'lisa.patel@school.edu', name: 'Ms. Lisa Patel', role: 'TEACHER' },
        { email: 'david.kim@school.edu', name: 'Mr. David Kim', role: 'TEACHER' },
        { email: 'rachel.green@school.edu', name: 'Ms. Rachel Green', role: 'TEACHER' },
        // Previously missing from PostgreSQL — these existed only in SQLite
        { email: 'carlos.rivera@school.edu', name: 'Mr. Carlos Rivera', role: 'TEACHER' },
        { email: 'amanda.foster@school.edu', name: 'Ms. Amanda Foster', role: 'TEACHER' },
    ]

    for (const t of teachers) {
        try {
            await prisma.user.upsert({
                where: { email: t.email },
                update: { name: t.name },
                create: {
                    email: t.email,
                    name: t.name,
                    password: passwordHash,
                    role: t.role,
                },
            })
            console.log(`✅ ${t.role}: ${t.email} -> ${t.name}`)
        } catch (e) {
            console.error(`❌ Failed: ${t.email}`, e.message)
        }
    }

    // List all users
    const users = await prisma.user.findMany({
        select: { email: true, name: true, role: true },
        orderBy: { role: 'asc' },
    })
    console.log('\n📋 All accounts:')
    for (const u of users) {
        console.log(`  [${u.role}] ${u.email} — ${u.name}`)
    }

    await prisma.$disconnect()
    pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
