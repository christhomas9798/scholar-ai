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

        let records: any[]

        if (isPrincipal) {
            records = db.prepare(`
        SELECT 
          a.date,
          sec.name as sectionName,
          sec.gradeLevel,
          COUNT(*) as total,
          SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present,
          SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
          SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late,
          SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END) as excused
        FROM "Attendance" a
        JOIN "Section" sec ON sec.id = a.sectionId
        GROUP BY a.date, sec.id
        ORDER BY a.date DESC, sec.gradeLevel, sec.name
        LIMIT 100
      `).all()
        } else {
            const teacher = db.prepare('SELECT id FROM "User" WHERE email = ?').get(user.email) as any
            if (!teacher) return Response.json([])

            records = db.prepare(`
        SELECT 
          a.date,
          sec.name as sectionName,
          sec.gradeLevel,
          COUNT(*) as total,
          SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present,
          SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
          SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late,
          SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END) as excused
        FROM "Attendance" a
        JOIN "Section" sec ON sec.id = a.sectionId
        JOIN "TeacherSubject" ts ON ts.sectionId = a.sectionId AND ts.teacherId = ?
        GROUP BY a.date, sec.id
        ORDER BY a.date DESC, sec.gradeLevel, sec.name
        LIMIT 100
      `).all(teacher.id)
        }

        return Response.json(records)
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
