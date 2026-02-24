import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/database'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const user = session.user as any
        const db = getDb()

        const teacher = db.prepare('SELECT id FROM "User" WHERE email = ?').get(user.email) as any
        if (!teacher) return Response.json([])

        // Get today's day of week (1=Mon, 5=Fri)
        const now = new Date()
        const jsDay = now.getDay() // 0=Sun
        const dbDay = jsDay === 0 ? 7 : jsDay // Convert to 1=Mon format

        const schedule = db.prepare(`
      SELECT 
        sch.period, sch.startTime, sch.endTime, sch.dayOfWeek,
        sub.name as subjectName, sub.code as subjectCode,
        sec.name as sectionName, sec.gradeLevel,
        r.name as roomName
      FROM "Schedule" sch
      JOIN "TeacherSubject" ts ON ts.id = sch.teacherSubjectId
      JOIN "Subject" sub ON sub.id = ts.subjectId
      JOIN "Section" sec ON sec.id = ts.sectionId
      LEFT JOIN "Room" r ON r.id = sch.roomId
      WHERE ts.teacherId = ? AND sch.dayOfWeek = ?
      ORDER BY sch.period
    `).all(teacher.id, dbDay)

        return Response.json({ today: dbDay, schedule })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
