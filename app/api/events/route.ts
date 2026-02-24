import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/database'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const db = getDb()

        const events = db.prepare(`
      SELECT e.id, e.title, e.description, e.type, e.startDate, e.endDate, e.isAllDay,
             u.name as createdByName
      FROM "Event" e
      JOIN "User" u ON u.id = e.createdBy
      WHERE e.startDate >= date('now', '-7 days')
      ORDER BY e.startDate ASC
    `).all()

        return Response.json(events)
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const user = session.user as any
        const db = getDb()
        const body = await req.json()

        const creator = db.prepare('SELECT id FROM "User" WHERE email = ?').get(user.email) as any
        if (!creator) return Response.json({ error: 'User not found' }, { status: 404 })

        const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

        db.prepare(`
      INSERT INTO "Event" (id, title, description, type, startDate, endDate, isAllDay, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.title, body.description || '', body.type || 'PTM', body.startDate, body.endDate || body.startDate, body.isAllDay ? 1 : 1, creator.id)

        return Response.json({ id, success: true })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const eventId = searchParams.get('id')
        if (!eventId) return Response.json({ error: 'Missing event id' }, { status: 400 })

        const db = getDb()
        db.prepare('DELETE FROM "Event" WHERE id = ?').run(eventId)

        return Response.json({ success: true })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}
