import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/database'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const db = getDb()

        // Return announcements that haven't expired
        const announcements = db.prepare(`
      SELECT a.id, a.title, a.content, a.scope, a.priority, a.createdAt, a.expiresAt,
             u.name as authorName
      FROM "Announcement" a
      JOIN "User" u ON u.id = a.authorId
      WHERE a.expiresAt IS NULL OR a.expiresAt >= date('now')
      ORDER BY 
        CASE a.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
        a.createdAt DESC
    `).all()

        return Response.json(announcements)
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const user = session.user as any
        // Only principals can create announcements
        if (user.role !== 'PRINCIPAL' && user.role !== 'VICE_PRINCIPAL') {
            return Response.json({ error: 'Only principals can create announcements' }, { status: 403 })
        }

        const db = getDb()
        const body = await req.json()

        const author = db.prepare('SELECT id FROM "User" WHERE email = ?').get(user.email) as any
        if (!author) return Response.json({ error: 'User not found' }, { status: 404 })

        const id = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

        db.prepare(`
      INSERT INTO "Announcement" (id, title, content, authorId, scope, priority, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.title, body.content, author.id, body.scope || 'SCHOOL', body.priority || 'NORMAL', body.expiresAt || null)

        return Response.json({ id, success: true })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const user = session.user as any
        if (user.role !== 'PRINCIPAL' && user.role !== 'VICE_PRINCIPAL') {
            return Response.json({ error: 'Only principals can delete announcements' }, { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const annId = searchParams.get('id')
        if (!annId) return Response.json({ error: 'Missing announcement id' }, { status: 400 })

        const db = getDb()
        db.prepare('DELETE FROM "Announcement" WHERE id = ?').run(annId)

        return Response.json({ success: true })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
