#!/usr/bin/env node
/**
 * scripts/add-teachers.js
 *
 * Utility script to manually add new staff accounts to the SQLite database.
 * Uses better-sqlite3 directly (same as the app) — no Prisma, no Postgres.
 *
 * Usage:
 *   node scripts/add-teachers.js
 *
 * Edit the `newStaff` array below before running.
 */

const Database = require('better-sqlite3')
const bcrypt = require('bcrypt')
const path = require('path')
const crypto = require('crypto')

const DB_PATH = path.join(__dirname, '..', 'scholar.db')

function generateId() {
    return `id_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

// ─── Edit this list to add staff ────────────────────────────────────────────
// Each entry must have: email, name, role, password
// Roles: PRINCIPAL | VICE_PRINCIPAL | TEACHER | COUNSELOR | ADMIN
const newStaff = [
    {
        email: 'alex.nguyen@school.edu',
        name: 'Mr. Alex Nguyen',
        role: 'TEACHER',
        password: 'AlexNguyenT@25',
    },
    {
        email: 'priya.sharma@school.edu',
        name: 'Ms. Priya Sharma',
        role: 'TEACHER',
        password: 'PriyaShm@25!',
    },
]
// ────────────────────────────────────────────────────────────────────────────

async function main() {
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Verify the database has been initialized
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get()
    if (!tableExists) {
        console.error('❌ Database not initialized yet. Start the app first (npm run dev) to trigger seeding.')
        process.exit(1)
    }

    console.log(`\n🔐 Hashing passwords and inserting ${newStaff.length} staff account(s)...\n`)

    const insert = db.prepare(
        'INSERT INTO "User" (id, email, password, name, role, isActive) VALUES (?, ?, ?, ?, ?, 1)'
    )

    const results = []

    for (const s of newStaff) {
        // Check if email already exists
        const existing = db.prepare('SELECT id, email FROM "User" WHERE email = ?').get(s.email)
        if (existing) {
            console.log(`⚠️  Skipped  — ${s.email} already exists`)
            continue
        }

        // Hash the password individually (different salt per user)
        const passwordHash = await bcrypt.hash(s.password, 10)

        try {
            insert.run(generateId(), s.email, passwordHash, s.name, s.role)
            results.push(s)
            console.log(`✅ Added    [${s.role.padEnd(14)}] ${s.email}`)
        } catch (err) {
            console.error(`❌ Failed   ${s.email}: ${err.message}`)
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    if (results.length > 0) {
        console.log('\n🔑 New credential(s) (shown once — save these now):')
        console.log('   ───────────────────────────────────────────────────')
        for (const s of results) {
            console.log(`   [${s.role.padEnd(14)}] ${s.email.padEnd(32)} → ${s.password}`)
        }
        console.log('   ───────────────────────────────────────────────────')
        console.log('   Passwords are bcrypt-hashed in the DB. Only the hash is stored.\n')
    }

    // ── List all active staff ────────────────────────────────────────────────
    const allStaff = db.prepare('SELECT email, name, role FROM "User" WHERE isActive = 1 ORDER BY role, name').all()
    console.log(`\n📋 All active staff (${allStaff.length} total):`)
    for (const u of allStaff) {
        console.log(`   [${u.role.padEnd(14)}] ${u.email.padEnd(32)}  ${u.name}`)
    }
    console.log()

    db.close()
}

main().catch(e => {
    console.error('Fatal error:', e)
    process.exit(1)
})
