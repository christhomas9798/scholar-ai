'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import styles from './home.module.css'
import {
    Users, GraduationCap, CheckCircle2, TrendingUp, BookOpen,
    ClipboardList, Loader2, Clock, Calendar, Plus, X, Megaphone, Send, Trash2
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'

const weeklyData = [
    { name: 'Mon', attendance: 95, average: 82 },
    { name: 'Tue', attendance: 92, average: 85 },
    { name: 'Wed', attendance: 88, average: 83 },
    { name: 'Thu', attendance: 94, average: 87 },
    { name: 'Fri', attendance: 91, average: 84 },
]

const gradeDistribution = [
    { name: 'A (90+)', value: 8, color: '#22c55e' },
    { name: 'B (80-89)', value: 12, color: '#6366f1' },
    { name: 'C (70-79)', value: 6, color: '#f59e0b' },
    { name: 'D (<70)', value: 4, color: '#ef4444' },
]

const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const eventTypeEmoji: Record<string, string> = {
    EXAM: '📝', HOLIDAY: '🏖️', PTM: '👥', SPORTS: '🏅', CULTURAL: '🎭'
}
const priorityStyles: Record<string, string> = {
    URGENT: 'annUrgent', HIGH: 'annHigh', NORMAL: 'annNormal', LOW: 'annLow'
}

interface Stats {
    role: string; name: string
    stats: { students: number; teachers?: number; subjects?: string[]; sections?: string[]; avgGrade: number; attendanceRate: number }
}

interface ScheduleItem {
    period: number; startTime: string; endTime: string
    subjectName: string; subjectCode: string; sectionName: string; gradeLevel: number; roomName: string
}

interface EventItem {
    id: string; title: string; description: string; type: string
    startDate: string; endDate: string; createdByName: string
}

interface Announcement {
    id: string; title: string; content: string; scope: string
    priority: string; expiresAt: string; authorName: string
}

export default function DashboardHome() {
    const { data: session } = useSession()
    const [stats, setStats] = useState<Stats | null>(null)
    const [schedule, setSchedule] = useState<{ today: number; schedule: ScheduleItem[] }>({ today: 0, schedule: [] })
    const [events, setEvents] = useState<EventItem[]>([])
    const [announcements, setAnnouncements] = useState<Announcement[]>([])
    const [loading, setLoading] = useState(true)

    // Event form
    const [showEventForm, setShowEventForm] = useState(false)
    const [eventForm, setEventForm] = useState({ title: '', type: 'PTM', startDate: '', description: '' })

    // Announcement form (principal only)
    const [showAnnForm, setShowAnnForm] = useState(false)
    const [annForm, setAnnForm] = useState({ title: '', content: '', priority: 'NORMAL', expiresAt: '' })

    const role = (session?.user as any)?.role || 'TEACHER'
    const isPrincipal = role === 'PRINCIPAL' || role === 'VICE_PRINCIPAL'

    useEffect(() => {
        Promise.all([
            fetch('/api/stats').then(r => r.json()),
            fetch('/api/events').then(r => r.json()),
            fetch('/api/announcements').then(r => r.json()),
            !isPrincipal ? fetch('/api/schedule').then(r => r.json()) : Promise.resolve(null),
        ]).then(([s, e, a, sch]) => {
            setStats(s)
            setEvents(e)
            setAnnouncements(a)
            if (sch) setSchedule(sch)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [isPrincipal])

    const addEvent = async () => {
        if (!eventForm.title || !eventForm.startDate) return
        const res = await fetch('/api/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventForm)
        })
        if (res.ok) {
            const all = await fetch('/api/events').then(r => r.json())
            setEvents(all)
            setEventForm({ title: '', type: 'PTM', startDate: '', description: '' })
            setShowEventForm(false)
        }
    }

    const deleteEvent = async (id: string) => {
        await fetch(`/api/events?id=${id}`, { method: 'DELETE' })
        setEvents(events.filter(e => e.id !== id))
    }

    const addAnnouncement = async () => {
        if (!annForm.title || !annForm.content) return
        const res = await fetch('/api/announcements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(annForm)
        })
        if (res.ok) {
            const all = await fetch('/api/announcements').then(r => r.json())
            setAnnouncements(all)
            setAnnForm({ title: '', content: '', priority: 'NORMAL', expiresAt: '' })
            setShowAnnForm(false)
        }
    }

    const deleteAnnouncement = async (id: string) => {
        await fetch(`/api/announcements?id=${id}`, { method: 'DELETE' })
        setAnnouncements(announcements.filter(a => a.id !== id))
    }

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading dashboard...</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            {/* ===== ANNOUNCEMENTS BANNER (Teachers) ===== */}
            {!isPrincipal && announcements.length > 0 && (
                <div className={styles.announcementsBanner}>
                    {announcements.slice(0, 3).map(a => (
                        <div key={a.id} className={`${styles.annCard} ${styles[priorityStyles[a.priority] || 'annNormal']}`}>
                            <div className={styles.annHeader}>
                                <span className={styles.annTitle}>{a.title}</span>
                                <span className={styles.annPriority}>{a.priority}</span>
                            </div>
                            <p className={styles.annContent}>{a.content}</p>
                            <span className={styles.annMeta}>By {a.authorName} · Expires {a.expiresAt || 'Never'}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== STATS CARDS ===== */}
            <div className={styles.statsGrid}>
                <div className="glass padding-2">
                    <div className={styles.statHeader}>
                        <Users size={24} className={styles.iconBlue} />
                        <span>{isPrincipal ? 'Total Students' : 'My Students'}</span>
                    </div>
                    <h3>{stats?.stats.students ?? '—'}</h3>
                    <p className={styles.trend}>
                        <TrendingUp size={14} />
                        {isPrincipal ? 'Across all sections' : `In ${stats?.stats.sections?.join(', ') || 'your sections'}`}
                    </p>
                </div>
                <div className="glass padding-2">
                    <div className={styles.statHeader}>
                        {isPrincipal ? <BookOpen size={24} className={styles.iconPurple} /> : <ClipboardList size={24} className={styles.iconOrange} />}
                        <span>{isPrincipal ? 'Teachers' : 'My Subjects'}</span>
                    </div>
                    <h3>{isPrincipal ? stats?.stats.teachers ?? '—' : stats?.stats.subjects?.length ?? '—'}</h3>
                    <p className={styles.trend}>
                        {isPrincipal ? <><TrendingUp size={14} /> Across 5 departments</> : stats?.stats.subjects?.join(', ') || ''}
                    </p>
                </div>
                <div className="glass padding-2">
                    <div className={styles.statHeader}>
                        <GraduationCap size={24} className={styles.iconPurple} />
                        <span>{isPrincipal ? 'School Avg. Grade' : 'Class Avg. Grade'}</span>
                    </div>
                    <h3>{stats?.stats.avgGrade ?? '—'}%</h3>
                    <p className={styles.trend}><TrendingUp size={14} /> Current semester</p>
                </div>
                <div className="glass padding-2">
                    <div className={styles.statHeader}>
                        <CheckCircle2 size={24} className={styles.iconGreen} />
                        <span>{isPrincipal ? 'School Attendance' : 'Class Attendance'}</span>
                    </div>
                    <h3>{stats?.stats.attendanceRate ?? '—'}%</h3>
                    <p className={styles.trend}><TrendingUp size={14} /> This week</p>
                </div>
            </div>

            {/* ===== TEACHER: TODAY'S SCHEDULE ===== */}
            {!isPrincipal && (
                <div className={`${styles.scheduleSection} glass padding-2`}>
                    <div className={styles.sectionTitle}>
                        <Clock size={20} />
                        <h4>Today&apos;s Schedule — {dayNames[schedule.today] || 'Weekend'}</h4>
                    </div>
                    {schedule.schedule.length > 0 ? (
                        <div className={styles.scheduleGrid}>
                            {schedule.schedule.map((item, i) => (
                                <div key={i} className={styles.periodCard}>
                                    <div className={styles.periodNum}>P{item.period}</div>
                                    <div className={styles.periodInfo}>
                                        <span className={styles.periodSubject}>{item.subjectName}</span>
                                        <span className={styles.periodSection}>Section {item.sectionName} · Grade {item.gradeLevel}</span>
                                        <span className={styles.periodTime}>{item.startTime} – {item.endTime} · {item.roomName}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.emptyMsg}>No classes scheduled for today 🎉</p>
                    )}
                </div>
            )}

            {/* ===== CHARTS ===== */}
            <div className={styles.chartsGrid}>
                <div className="glass padding-2">
                    <h4>📈 {isPrincipal ? 'Weekly Performance (All Students)' : 'My Class Performance'}</h4>
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                            <AreaChart data={weeklyData}>
                                <defs>
                                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={isPrincipal ? '#6366f1' : '#22c55e'} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={isPrincipal ? '#6366f1' : '#22c55e'} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip contentStyle={{ background: '#17171a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                <Area type="monotone" dataKey="average" stroke={isPrincipal ? '#6366f1' : '#22c55e'} fillOpacity={1} fill="url(#colorAvg)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {isPrincipal ? (
                    <div className="glass padding-2">
                        <h4>📊 Grade Distribution</h4>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={gradeDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={5} dataKey="value"
                                        label={(props: any) => `${props.name} (${((props.percent ?? 0) * 100).toFixed(0)}%)`}>
                                        {gradeDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#17171a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <div className="glass padding-2">
                        <h4>📋 My Class Attendance</h4>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <BarChart data={weeklyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                                    <YAxis stroke="#94a3b8" fontSize={12} />
                                    <Tooltip contentStyle={{ background: '#17171a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                    <Bar dataKey="attendance" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== EVENTS & CALENDAR ===== */}
            <div className={`${styles.eventsSection} glass padding-2`}>
                <div className={styles.sectionTitle}>
                    <Calendar size={20} />
                    <h4>Upcoming Events & Meetings</h4>
                    <button className={styles.addBtn} onClick={() => setShowEventForm(!showEventForm)}>
                        {showEventForm ? <X size={16} /> : <Plus size={16} />}
                        {showEventForm ? 'Cancel' : 'Add Event'}
                    </button>
                </div>

                {showEventForm && (
                    <div className={styles.formCard}>
                        <input type="text" placeholder="Event title" value={eventForm.title}
                            onChange={e => setEventForm({ ...eventForm, title: e.target.value })} className={styles.formInput} />
                        <div className={styles.formRow}>
                            <select value={eventForm.type} onChange={e => setEventForm({ ...eventForm, type: e.target.value })} className={styles.formSelect}>
                                <option value="PTM">Meeting</option>
                                <option value="EXAM">Exam</option>
                                <option value="SPORTS">Sports</option>
                                <option value="CULTURAL">Cultural</option>
                                <option value="HOLIDAY">Holiday</option>
                            </select>
                            <input type="date" value={eventForm.startDate}
                                onChange={e => setEventForm({ ...eventForm, startDate: e.target.value })} className={styles.formInput} />
                        </div>
                        <input type="text" placeholder="Description (optional)" value={eventForm.description}
                            onChange={e => setEventForm({ ...eventForm, description: e.target.value })} className={styles.formInput} />
                        <button className={styles.submitBtn} onClick={addEvent}><Send size={14} /> Create Event</button>
                    </div>
                )}

                <div className={styles.eventsList}>
                    {events.map(event => (
                        <div key={event.id} className={styles.eventCard}>
                            <span className={styles.eventEmoji}>{eventTypeEmoji[event.type] || '📅'}</span>
                            <div className={styles.eventInfo}>
                                <span className={styles.eventTitle}>{event.title}</span>
                                <span className={styles.eventDate}>
                                    {new Date(event.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {event.endDate !== event.startDate && ` – ${new Date(event.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                                </span>
                            </div>
                            <button className={styles.deleteBtn} onClick={() => deleteEvent(event.id)} title="Remove">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {events.length === 0 && <p className={styles.emptyMsg}>No upcoming events</p>}
                </div>
            </div>

            {/* ===== PRINCIPAL: ANNOUNCEMENTS MANAGER ===== */}
            {isPrincipal && (
                <div className={`${styles.eventsSection} glass padding-2`}>
                    <div className={styles.sectionTitle}>
                        <Megaphone size={20} />
                        <h4>Manage Announcements</h4>
                        <button className={styles.addBtn} onClick={() => setShowAnnForm(!showAnnForm)}>
                            {showAnnForm ? <X size={16} /> : <Plus size={16} />}
                            {showAnnForm ? 'Cancel' : 'New Announcement'}
                        </button>
                    </div>

                    {showAnnForm && (
                        <div className={styles.formCard}>
                            <input type="text" placeholder="Announcement title" value={annForm.title}
                                onChange={e => setAnnForm({ ...annForm, title: e.target.value })} className={styles.formInput} />
                            <textarea placeholder="Announcement content..." value={annForm.content}
                                onChange={e => setAnnForm({ ...annForm, content: e.target.value })} className={styles.formTextarea} rows={3} />
                            <div className={styles.formRow}>
                                <select value={annForm.priority} onChange={e => setAnnForm({ ...annForm, priority: e.target.value })} className={styles.formSelect}>
                                    <option value="LOW">Low Priority</option>
                                    <option value="NORMAL">Normal</option>
                                    <option value="HIGH">High Priority</option>
                                    <option value="URGENT">🔴 Urgent</option>
                                </select>
                                <input type="date" value={annForm.expiresAt} placeholder="Expires on"
                                    onChange={e => setAnnForm({ ...annForm, expiresAt: e.target.value })} className={styles.formInput} />
                            </div>
                            <button className={styles.submitBtn} onClick={addAnnouncement}><Send size={14} /> Publish</button>
                        </div>
                    )}

                    <div className={styles.eventsList}>
                        {announcements.map(a => (
                            <div key={a.id} className={`${styles.annListItem} ${styles[priorityStyles[a.priority] || 'annNormal']}`}>
                                <div className={styles.annListInfo}>
                                    <span className={styles.annListTitle}>{a.title}</span>
                                    <span className={styles.annListMeta}>{a.priority} · Expires {a.expiresAt || 'Never'}</span>
                                </div>
                                <button className={styles.deleteBtn} onClick={() => deleteAnnouncement(a.id)} title="Delete">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
