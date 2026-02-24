import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/database'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const user = session.user as any
        const db = getDb()

        if (user.role === 'PRINCIPAL' || user.role === 'VICE_PRINCIPAL') {
            // Principal: school-wide stats
            const students = (db.prepare('SELECT COUNT(*) as count FROM "Student"').get() as any).count
            const teachers = (db.prepare('SELECT COUNT(*) as count FROM "User" WHERE role = \'TEACHER\'').get() as any).count
            const avgGrade = (db.prepare('SELECT ROUND(AVG(score), 1) as avg FROM "Grade"').get() as any).avg
            const todayAttendance = db.prepare(`
        SELECT 
          ROUND(100.0 * SUM(CASE WHEN status='PRESENT' THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
        FROM "Attendance" WHERE date = date('now')
      `).get() as any

            return Response.json({
                role: 'PRINCIPAL',
                name: user.name,
                stats: {
                    students,
                    teachers,
                    avgGrade: avgGrade || 0,
                    attendanceRate: todayAttendance?.rate || 0,
                },
            })
        }

        // Teacher: scoped stats
        const teacher = db.prepare('SELECT id, name FROM "User" WHERE email = ?').get(user.email) as any

        if (!teacher) {
            return Response.json({ role: 'TEACHER', name: user.name, stats: { students: 0, subjects: [], sections: [], avgGrade: 0, attendanceRate: 0 } })
        }

        const sections = db.prepare(`
      SELECT DISTINCT s.name, s.gradeLevel
      FROM "TeacherSubject" ts
      JOIN "Section" s ON s.id = ts.sectionId
      WHERE ts.teacherId = ?
      ORDER BY s.gradeLevel
    `).all(teacher.id) as any[]

        const subjects = db.prepare(`
      SELECT DISTINCT sub.name, sub.code
      FROM "TeacherSubject" ts
      JOIN "Subject" sub ON sub.id = ts.subjectId
      WHERE ts.teacherId = ?
    `).all(teacher.id) as any[]

        const studentCount = (db.prepare(`
      SELECT COUNT(DISTINCT st.id) as count
      FROM "Student" st
      JOIN "TeacherSubject" ts ON ts.sectionId = st.sectionId
      WHERE ts.teacherId = ?
    `).get(teacher.id) as any).count

        const avgGrade = (db.prepare(`
      SELECT ROUND(AVG(g.score), 1) as avg
      FROM "Grade" g
      JOIN "Assignment" a ON a.id = g.assignmentId
      WHERE a.teacherId = ?
    `).get(teacher.id) as any).avg

        const attendanceRate = db.prepare(`
      SELECT ROUND(100.0 * SUM(CASE WHEN att.status='PRESENT' THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
      FROM "Attendance" att
      JOIN "TeacherSubject" ts ON ts.sectionId = att.sectionId AND ts.teacherId = ?
      WHERE att.date >= date('now', '-7 days')
    `).get(teacher.id) as any

        return Response.json({
            role: 'TEACHER',
            name: teacher.name,
            stats: {
                students: studentCount,
                subjects: subjects.map((s: any) => s.name),
                sections: sections.map((s: any) => s.name),
                avgGrade: avgGrade || 0,
                attendanceRate: attendanceRate?.rate || 0,
            },
        })
    } catch (error: any) {
        console.error('Stats API Error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
