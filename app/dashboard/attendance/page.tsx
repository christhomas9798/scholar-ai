'use client'

import { useEffect, useState } from 'react'
import styles from './attendance.module.css'
import { CalendarCheck, Loader2 } from 'lucide-react'

interface AttendanceRecord {
    date: string
    sectionName: string
    gradeLevel: number
    total: number
    present: number
    absent: number
    late: number
    excused: number
}

function getAttendanceColor(rate: number): string {
    if (rate >= 95) return styles.rateExcellent
    if (rate >= 85) return styles.rateGood
    if (rate >= 75) return styles.rateWarning
    return styles.ratePoor
}

export default function AttendancePage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/attendance')
            .then(r => r.json())
            .then(data => { setRecords(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading attendance...</p>
            </div>
        )
    }

    // Group by date
    const dates = Array.from(new Set(records.map(r => r.date))).sort().reverse()

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <CalendarCheck size={24} />
                <h2>Attendance Records</h2>
                <span className={styles.dateCount}>{dates.length} days</span>
            </div>

            {dates.map(date => {
                const dayRecords = records.filter(r => r.date === date)
                const totalPresent = dayRecords.reduce((s, r) => s + r.present, 0)
                const totalStudents = dayRecords.reduce((s, r) => s + r.total, 0)
                const dayRate = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0

                return (
                    <div key={date} className={`${styles.dateCard} glass`}>
                        <div className={styles.dateHeader}>
                            <div className={styles.dateInfo}>
                                <h3>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
                                <span className={styles.dateLabel}>{date}</span>
                            </div>
                            <div className={`${styles.dayRate} ${getAttendanceColor(dayRate)}`}>
                                {dayRate}%
                            </div>
                        </div>

                        <div className={styles.sectionsGrid}>
                            {dayRecords.map(record => {
                                const rate = record.total > 0 ? Math.round((record.present / record.total) * 100) : 0
                                return (
                                    <div key={`${date}-${record.sectionName}`} className={styles.sectionCard}>
                                        <div className={styles.sectionHeader}>
                                            <span className={styles.sectionBadge}>{record.sectionName}</span>
                                            <span className={`${styles.rate} ${getAttendanceColor(rate)}`}>{rate}%</span>
                                        </div>
                                        <div className={styles.statRow}>
                                            <div className={styles.stat}>
                                                <span className={styles.statValue}>{record.present}</span>
                                                <span className={styles.statLabel}>Present</span>
                                            </div>
                                            <div className={styles.stat}>
                                                <span className={`${styles.statValue} ${styles.absentVal}`}>{record.absent}</span>
                                                <span className={styles.statLabel}>Absent</span>
                                            </div>
                                            <div className={styles.stat}>
                                                <span className={`${styles.statValue} ${styles.lateVal}`}>{record.late}</span>
                                                <span className={styles.statLabel}>Late</span>
                                            </div>
                                            <div className={styles.stat}>
                                                <span className={styles.statValue}>{record.excused}</span>
                                                <span className={styles.statLabel}>Excused</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            {records.length === 0 && (
                <div className={styles.empty}>
                    <p>No attendance records found.</p>
                </div>
            )}
        </div>
    )
}
