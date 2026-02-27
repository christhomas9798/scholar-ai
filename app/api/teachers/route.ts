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
        const isPrincipal = user.role === 'PRINCIPAL' || user.role === 'VICE_PRINCIPAL'

        if (!isPrincipal) {
            return Response.json({ error: 'Forbidden' }, { status: 403 })
        }

        const db = getDb()

        const teachers = db.prepare(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                u.createdAt,
                COUNT(DISTINCT ts.sectionId) as sectionCount,
                COUNT(DISTINCT ts.subjectId) as subjectCount,
                COUNT(DISTINCT s.id) as studentCount,
                GROUP_CONCAT(DISTINCT sub.name) as subjects
            FROM "User" u
            LEFT JOIN "TeacherSubject" ts ON ts.teacherId = u.id
            LEFT JOIN "Subject" sub ON sub.id = ts.subjectId
            LEFT JOIN "Student" s ON s.sectionId = ts.sectionId
            WHERE u.role = 'TEACHER'
            GROUP BY u.id
            ORDER BY u.name
        `).all()

        return Response.json(teachers)
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
