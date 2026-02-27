import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcrypt'
import { getDb } from '@/lib/database'

/**
 * Auth reads directly from the SQLite database (scholar.db) via getDb().
 * The Prisma/Postgres adapter has been removed — all data lives in SQLite.
 */
export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt',
    },
    pages: {
        signIn: '/login',
    },
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Missing email or password')
                }

                const db = getDb()
                const user = db
                    .prepare('SELECT id, email, password, name, role FROM "User" WHERE email = ? AND isActive = 1')
                    .get(credentials.email) as { id: string; email: string; password: string; name: string; role: string } | undefined

                if (!user) {
                    throw new Error('Invalid credentials')
                }

                const isValid = await compare(credentials.password, user.password)

                if (!isValid) {
                    throw new Error('Invalid credentials')
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                return {
                    ...token,
                    id: user.id,
                    role: (user as any).role,
                }
            }
            return token
        },
        async session({ session, token }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.id,
                    role: token.role,
                },
            }
        },
    },
}
