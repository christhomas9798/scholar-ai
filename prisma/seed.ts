import { PrismaClient, Role } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hash } from 'bcrypt'
import 'dotenv/config'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
    adapter,
})

async function main() {
    // 1. Clean data
    await prisma.grade.deleteMany()
    await prisma.attendance.deleteMany()
    await prisma.student.deleteMany()
    await prisma.user.deleteMany()

    const passwordHash = await hash('password123', 10)

    // 2. Create Principal
    const principal = await prisma.user.create({
        data: {
            email: 'principal@school.edu',
            name: 'Dr. Jane Smith',
            password: passwordHash,
            role: Role.PRINCIPAL,
        },
    })

    // 3. Create Teachers
    const teacher = await prisma.user.create({
        data: {
            email: 'teacher@school.edu',
            name: 'Mr. John Doe',
            password: passwordHash,
            role: Role.TEACHER,
        },
    })

    // 4. Create Students
    const students = [
        { name: 'Alice Johnson', gradeLevel: 10, teacherId: teacher.id },
        { name: 'Bob Smith', gradeLevel: 10, teacherId: teacher.id },
        { name: 'Charlie Brown', gradeLevel: 11, teacherId: teacher.id },
        { name: 'Diana Prince', gradeLevel: 12, teacherId: teacher.id },
    ]

    for (const s of students) {
        const student = await prisma.student.create({ data: s })

        // Add dummy grades
        await prisma.grade.createMany({
            data: [
                { subject: 'Math', score: 85 + Math.random() * 10, studentId: student.id },
                { subject: 'Science', score: 75 + Math.random() * 20, studentId: student.id },
            ]
        })

        // Add dummy attendance
        await prisma.attendance.create({
            data: {
                status: Math.random() > 0.1 ? 'PRESENT' : 'ABSENT',
                studentId: student.id,
                date: new Date(),
            }
        })
    }

    console.log('✅ Seeding completed.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
