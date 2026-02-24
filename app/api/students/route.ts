import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/database'

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const user = session.user as any
        const db = getDb()
        const isPrincipal = user.role === 'PRINCIPAL' || user.role === 'VICE_PRINCIPAL'

        let students: any[]

        if (isPrincipal) {
            students = db.prepare(`
        SELECT s.id, s.name, s.email, s.gender, s.gradeLevel, s.status,
               sec.name as sectionName,
               ROUND(AVG(g.score), 1) as avgGrade,
               u.name as teacherName
        FROM "Student" s
        LEFT JOIN "Section" sec ON sec.id = s.sectionId
        LEFT JOIN "Grade" g ON g.studentId = s.id
        LEFT JOIN "TeacherSubject" ts ON ts.sectionId = s.sectionId
        LEFT JOIN "User" u ON u.id = ts.teacherId
        GROUP BY s.id
        ORDER BY s.gradeLevel, sec.name, s.name
      `).all()
        } else {
            const teacher = db.prepare('SELECT id FROM "User" WHERE email = ?').get(user.email) as any
            if (!teacher) return Response.json([])

            students = db.prepare(`
        SELECT DISTINCT s.id, s.name, s.email, s.gender, s.gradeLevel, s.status,
               sec.name as sectionName,
               ROUND(AVG(g.score), 1) as avgGrade
        FROM "Student" s
        JOIN "Section" sec ON sec.id = s.sectionId
        JOIN "TeacherSubject" ts ON ts.sectionId = s.sectionId AND ts.teacherId = ?
        LEFT JOIN "Grade" g ON g.studentId = s.id
        GROUP BY s.id
        ORDER BY s.gradeLevel, sec.name, s.name
      `).all(teacher.id)
        }

        return Response.json(students)
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
