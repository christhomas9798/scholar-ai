'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import styles from './students.module.css'
import { Users, Search, Loader2 } from 'lucide-react'

interface Student {
    id: string
    name: string
    email: string
    gender: string
    gradeLevel: number
    status: string
    sectionName: string
    avgGrade: number | null
    teacherName?: string
}

function getGradeColor(score: number | null): string {
    if (!score) return ''
    if (score >= 90) return styles.gradeA
    if (score >= 80) return styles.gradeB
    if (score >= 70) return styles.gradeC
    return styles.gradeD
}

export default function StudentsPage() {
    const { data: session } = useSession()
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const isPrincipal = (session?.user as any)?.role === 'PRINCIPAL'

    useEffect(() => {
        fetch('/api/students')
            .then(r => r.json())
            .then(data => { setStudents(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    const filtered = students.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.sectionName?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
    )

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading students...</p>
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
                        placeholder="Search by name, section, or email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input-field"
                    />
                </div>
                <div className={styles.count}>
                    <Users size={16} />
                    <span>{filtered.length} student{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            <div className={`${styles.tableContainer} glass`}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Section</th>
                            <th>Grade Level</th>
                            <th>Gender</th>
                            <th>Avg Score</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(student => (
                            <tr key={student.id}>
                                <td>
                                    <div className={styles.studentName}>
                                        <div className={styles.avatar}>
                                            {student.name.charAt(0)}
                                        </div>
                                        <div>
                                            <span className={styles.name}>{student.name}</span>
                                            <span className={styles.email}>{student.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td><span className={styles.sectionBadge}>{student.sectionName}</span></td>
                                <td>Grade {student.gradeLevel}</td>
                                <td>{student.gender === 'M' ? '♂ Male' : '♀ Female'}</td>
                                <td>
                                    <span className={`${styles.score} ${getGradeColor(student.avgGrade)}`}>
                                        {student.avgGrade ?? '—'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`${styles.statusBadge} ${styles[`status${student.status}`]}`}>
                                        {student.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className={styles.empty}>
                        <p>No students found.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
