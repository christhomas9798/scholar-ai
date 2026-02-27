'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import styles from './teachers.module.css'
import { Shield, Search, Loader2, BookOpen, Users, LayoutList } from 'lucide-react'

interface Teacher {
    id: string
    name: string
    email: string
    role: string
    createdAt: string
    sectionCount: number
    subjectCount: number
    studentCount: number
    subjects: string | null
}

export default function TeachersPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const isPrincipal = (session?.user as any)?.role === 'PRINCIPAL'

    useEffect(() => {
        if (session && !isPrincipal) {
            router.replace('/dashboard')
            return
        }
        fetch('/api/teachers')
            .then(r => r.json())
            .then(data => { setTeachers(Array.isArray(data) ? data : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [session, isPrincipal, router])

    const filtered = teachers.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        (t.subjects ?? '').toLowerCase().includes(search.toLowerCase())
    )

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading teachers...</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or subject..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input-field"
                    />
                </div>
                <div className={styles.count}>
                    <Shield size={16} />
                    <span>{filtered.length} teacher{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            <div className={`${styles.tableContainer} glass`}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th><BookOpen size={13} style={{ display: 'inline', marginRight: 4 }} />Subjects</th>
                            <th><LayoutList size={13} style={{ display: 'inline', marginRight: 4 }} />Sections</th>
                            <th><Users size={13} style={{ display: 'inline', marginRight: 4 }} />Students</th>
                            <th>Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(teacher => (
                            <tr key={teacher.id}>
                                <td>
                                    <div className={styles.teacherName}>
                                        <div className={styles.avatar}>
                                            {teacher.name.charAt(0)}
                                        </div>
                                        <div>
                                            <span className={styles.name}>{teacher.name}</span>
                                            <span className={styles.email}>{teacher.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={styles.subjectList} title={teacher.subjects ?? '—'}>
                                        {teacher.subjects ?? <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                    </span>
                                </td>
                                <td>
                                    <span className={styles.statNum}>{teacher.sectionCount}</span>
                                </td>
                                <td>
                                    <span className={styles.statNum}>{teacher.studentCount}</span>
                                </td>
                                <td>
                                    <span className={styles.roleBadge}>{teacher.role}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className={styles.empty}>
                        <p>No teachers found.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
