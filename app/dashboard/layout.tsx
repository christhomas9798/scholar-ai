'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import styles from './dashboard.module.css'
import { LayoutDashboard, Users, UserCheck, MessageSquare, LogOut, Settings, Shield } from 'lucide-react'
import { signOut } from 'next-auth/react'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { data: session, status } = useSession()
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login')
        }
    }, [status, router])

    if (status === 'loading') {
        return <div className={styles.loading}>Loading ScholarAI...</div>
    }

    if (!session) {
        return null
    }

    const user = session.user as any
    const role = user?.role || 'TEACHER'
    const isPrincipal = role === 'PRINCIPAL'
    const displayName = user?.name || (isPrincipal ? 'Principal' : 'Teacher')

    return (
        <div className={styles.wrapper}>
            <aside className={`${styles.sidebar} glass`}>
                <div className={styles.logo}>
                    <h2 className="text-gradient">ScholarAI</h2>
                </div>

                <nav className={styles.nav}>
                    <Link href="/dashboard" className={`${styles.navItem} ${pathname === '/dashboard' ? styles.navActive : ''}`}>
                        <LayoutDashboard size={20} />
                        <span>Dashboard</span>
                    </Link>

                    {isPrincipal && (
                        <Link href="/dashboard/teachers" className={`${styles.navItem} ${pathname === '/dashboard/teachers' ? styles.navActive : ''}`}>
                            <Shield size={20} />
                            <span>Teachers</span>
                        </Link>
                    )}

                    <Link href="/dashboard/students" className={`${styles.navItem} ${pathname === '/dashboard/students' ? styles.navActive : ''}`}>
                        <Users size={20} />
                        <span>{isPrincipal ? 'All Students' : 'My Students'}</span>
                    </Link>

                    <Link href="/dashboard/attendance" className={`${styles.navItem} ${pathname === '/dashboard/attendance' ? styles.navActive : ''}`}>
                        <UserCheck size={20} />
                        <span>Attendance</span>
                    </Link>

                    <Link href="/dashboard/chat" className={`${styles.navItem} ${pathname === '/dashboard/chat' ? styles.navActive : ''}`}>
                        <MessageSquare size={20} />
                        <span>AI Assistant</span>
                    </Link>

                    {isPrincipal && (
                        <Link href="/dashboard/settings" className={`${styles.navItem} ${pathname === '/dashboard/settings' ? styles.navActive : ''}`}>
                            <Settings size={20} />
                            <span>Settings</span>
                        </Link>
                    )}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <div className={`${styles.roleChip} ${isPrincipal ? styles.rolePrincipal : styles.roleTeacher}`}>
                            {isPrincipal ? '👑 Principal' : '📚 Teacher'}
                        </div>
                        <span className={styles.userName}>{displayName}</span>
                    </div>
                    <button className={styles.logoutBtn} onClick={() => signOut()}>
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.welcome}>
                        <h1>{isPrincipal ? `Welcome, ${displayName}` : `Welcome, ${displayName}`}</h1>
                        <p className={styles.subtitle}>
                            {isPrincipal
                                ? 'School-wide overview & administration'
                                : 'Your classroom at a glance'}
                        </p>
                    </div>
                </header>
                <section className={styles.content}>
                    {children}
                </section>
            </main>
        </div>
    )
}
