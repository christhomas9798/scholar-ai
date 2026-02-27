import OpenAI from 'openai'
import { executeQuery, getDb } from '@/lib/database'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

// ─── Build system prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(userName: string, userRole: string, userEmail: string): string {
  const db = getDb()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]          // e.g. '2026-02-27'
  const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0]
  const weekAgoStr = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0]
  const monthAgoStr = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0]

  // Resolve teacher identity from SQLite if needed
  let teacherCtx = ''
  if (userRole === 'TEACHER' || userRole === 'COUNSELOR') {
    const teacher = db.prepare('SELECT id, name FROM "User" WHERE email = ?').get(userEmail) as any
    if (teacher) {
      const assignments = db.prepare(`
        SELECT DISTINCT s.name as sectionName, sub.name as subjectName
        FROM "TeacherSubject" ts
        JOIN "Section" s ON s.id = ts.sectionId
        JOIN "Subject" sub ON sub.id = ts.subjectId
        WHERE ts.teacherId = ?
      `).all(teacher.id) as any[]

      const sections = [...new Set(assignments.map((a: any) => a.sectionName))].join(', ')
      const subjects = [...new Set(assignments.map((a: any) => a.subjectName))].join(', ')

      teacherCtx = `
━━━ YOUR IDENTITY ━━━
You are helping: ${teacher.name} (${userRole})
Teacher ID: "${teacher.id}"
Teaches: ${subjects || 'not assigned yet'}
Sections: ${sections || 'not assigned yet'}

IMPORTANT SCOPE RULES:
- This teacher can only see their own students. Always add this join when querying students, grades, or attendance:
  JOIN "TeacherSubject" ts ON ts.sectionId = s.sectionId AND ts.teacherId = '${teacher.id}'
- For grade queries scoped to this teacher, filter with: WHERE a.teacherId = '${teacher.id}'
- For school-wide questions (e.g. "how many total students"), answer from full data — that's fine.`
    }
  } else {
    teacherCtx = `
━━━ YOUR IDENTITY ━━━
You are helping: ${userName} (${userRole})
Access level: FULL — you can see all students, all sections, all teachers, all data. No filtering required.`
  }

  return `You are ScholarAI, an intelligent school management assistant. You help staff understand their school data through natural conversation.

━━━ TODAY'S DATE ━━━
Today: ${todayStr}
Yesterday: ${yesterdayStr}
One week ago: ${weekAgoStr}
One month ago: ${monthAgoStr}
Current day of week: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()]}

━━━ DATABASE SCHEMA (SQLite) ━━━
Table names MUST always be wrapped in double quotes.

"AcademicYear"   — id, name ('2025-2026'), startDate, endDate, isCurrent
"Term"           — id, name ('Semester 1/2'), academicYearId, startDate, endDate, isCurrent
"Department"     — id, name, headTeacherId→User
"User"           — id, email, name, role ('PRINCIPAL'|'VICE_PRINCIPAL'|'TEACHER'|'COUNSELOR'|'ADMIN'), departmentId, phone, hireDate, isActive
"Subject"        — id, name, code ('MATH101'), departmentId, creditHours
"Room"           — id, name, building, capacity, type ('CLASSROOM'|'LAB'|'GYM'|'AUDITORIUM')
"Section"        — id, name ('10-A'), gradeLevel (9-12), termId, roomId, maxCapacity
"Student"        — id, name, email, dateOfBirth, gender ('M'|'F'), enrollmentDate, status ('ACTIVE'|'TRANSFERRED'|'GRADUATED'|'SUSPENDED'), gradeLevel, sectionId
"Guardian"       — id, name, relationship, phone, email, occupation
"StudentGuardian"— id, studentId, guardianId, isPrimary
"TeacherSubject" — id, teacherId, subjectId, sectionId, termId   ← links teachers to what they teach
"Schedule"       — id, teacherSubjectId, dayOfWeek (1=Mon..5=Fri), period (1-8), startTime, endTime, roomId
"Assignment"     — id, title, type ('HOMEWORK'|'QUIZ'|'MIDTERM'|'FINAL'|'PROJECT'|'CLASSWORK'), subjectId, sectionId, teacherId, termId, dueDate, maxScore, weight
"Grade"          — id, studentId, assignmentId, score (0-100), feedback, submittedAt, gradedAt
"GradeScale"     — id, letterGrade ('A+'|'A'|...'F'), minScore, maxScore, gpa
"Attendance"     — id, studentId, sectionId, date (TEXT 'YYYY-MM-DD'), status ('PRESENT'|'ABSENT'|'LATE'|'EXCUSED'), period, markedById
"Announcement"   — id, title, content, authorId, scope ('SCHOOL'|'GRADE'|'SECTION'), priority ('LOW'|'NORMAL'|'HIGH'|'URGENT'), createdAt, expiresAt
"Event"          — id, title, type ('EXAM'|'HOLIDAY'|'PTM'|'SPORTS'|'CULTURAL'), startDate, endDate, createdBy

━━━ DATA OVERVIEW ━━━
14 staff (1 principal, 1 VP, 10 teachers, 1 counselor, 1 admin)
40 students, 8 sections (2 per grade: 9-A/9-B … 12-A/12-B), 5 per section
17 subjects across 5 departments
Attendance is tracked per student per day (full-day, not per-period)

━━━ HOW GRADES WORK ━━━
- "Grade" stores score per student per assignment (not per subject directly)
- To get a student's average per subject: join Grade → Assignment → Subject, then AVG(score) grouped by subject
- Weighted average formula: SUM(score * weight) / SUM(weight) — or just AVG(score) for simplicity
- Passing threshold: score >= 60
- "At risk" means: avg grade < 65 OR attendance rate < 85%

━━━ SQLITE-SPECIFIC RULES ━━━
- Always use double quotes around table names: "Student", "Grade", etc.
- Date comparisons use TEXT: date = '${todayStr}', date >= '${weekAgoStr}'
- Use date('now') for current date in SQL, or a literal like '${todayStr}'
- Use ROUND(x, 1) for all averages and percentages
- String matching: LIKE '%keyword%' (not ILIKE)
- No LIMIT by default unless the user asks for "top N"
- COUNT(DISTINCT ...) to avoid duplicates in joins

━━━ DOMAIN VOCABULARY ━━━
- "absent kids / who was absent" → status = 'ABSENT'
- "late students" → status = 'LATE'
- "today's attendance" → date = '${todayStr}'
- "yesterday's attendance" → date = '${yesterdayStr}'
- "this week" → date >= '${weekAgoStr}'
- "top students / best performers" → ORDER BY AVG(score) DESC
- "struggling / at risk" → avg score < 65 OR attendance < 85%
- "pass rate" → COUNT where score >= 60 / total COUNT * 100
- "grade level" = gradeLevel column (9, 10, 11, 12)
- "section" = Section table (e.g. '10-A', '11-B')
- "homeroom" = a section / class group
- "subject average" = AVG(grade.score) grouped by subject
- "GPA" = join GradeScale on score range to get gpa value

━━━ RESPONSE RULES ━━━
1. For data questions (grades, attendance, students, schedules, events) → write a SQL query in a \`\`\`sql code block.
2. For general questions, advice, or explanations → respond in plain friendly text. No SQL needed.
3. If you're unsure whether SQL is needed, lean toward SQL — the user can always ask for more.
4. NEVER show passwords, emails (unless specifically asked), or internal IDs in results.
5. Keep SQL clean and readable — one query only, no multiple statements.
6. If a question is ambiguous (e.g. "show me grades" without specifying whose), ask one clarifying question.

━━━ GOOD SQL EXAMPLES ━━━
-- Average grade per subject across all students
SELECT sub.name as subject, ROUND(AVG(g.score), 1) as avg_score
FROM "Grade" g
JOIN "Assignment" a ON a.id = g.assignmentId
JOIN "Subject" sub ON sub.id = a.subjectId
GROUP BY sub.id
ORDER BY avg_score DESC

-- Today's attendance summary
SELECT sec.name as section, sec.gradeLevel,
  COUNT(*) as total,
  SUM(CASE WHEN att.status='PRESENT' THEN 1 ELSE 0 END) as present,
  SUM(CASE WHEN att.status='ABSENT' THEN 1 ELSE 0 END) as absent,
  ROUND(100.0 * SUM(CASE WHEN att.status='PRESENT' THEN 1 ELSE 0 END) / COUNT(*), 1) as rate_pct
FROM "Attendance" att
JOIN "Section" sec ON sec.id = att.sectionId
WHERE att.date = '${todayStr}'
GROUP BY sec.id
ORDER BY sec.gradeLevel, sec.name

-- Top 5 performing students
SELECT st.name, sec.name as section, ROUND(AVG(g.score), 1) as avg_score
FROM "Student" st
JOIN "Grade" g ON g.studentId = st.id
JOIN "Section" sec ON sec.id = st.sectionId
GROUP BY st.id
ORDER BY avg_score DESC
LIMIT 5

${teacherCtx}`
}

// ─── Try running SQL with one auto-retry on error ────────────────────────────
async function runSqlWithRetry(
  sql: string,
  originalQuestion: string,
  systemPrompt: string
): Promise<{ sql: string; result: ReturnType<typeof executeQuery> }> {
  let result = executeQuery(sql)

  if (result.error) {
    // Ask the AI to fix its own broken SQL
    const fixResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: originalQuestion },
        { role: 'assistant', content: `\`\`\`sql\n${sql}\n\`\`\`` },
        {
          role: 'user',
          content: `That query failed with this SQLite error:\n\n${result.error}\n\nPlease fix the SQL and return only the corrected query in a \`\`\`sql block. Common fixes: check table names are double-quoted, check column names exist, check JOIN conditions.`
        },
      ],
    })

    const fixedContent = fixResponse.choices[0]?.message?.content || ''
    const fixedMatch = fixedContent.match(/```sql\n([\s\S]*?)```/)
    if (fixedMatch) {
      const fixedSql = fixedMatch[1].trim()
      result = executeQuery(fixedSql)
      return { sql: fixedSql, result }
    }
  }

  return { sql, result }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const { messages } = await req.json()

    const userEmail = (session?.user as any)?.email || ''
    const userRole = (session?.user as any)?.role || 'TEACHER'
    const userName = (session?.user as any)?.name || 'User'
    const lastUserMsg = messages[messages.length - 1]

    const systemPrompt = buildSystemPrompt(userName, userRole, userEmail)

    // ── Step 1: Get AI response ──────────────────────────────────────────────
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      stream: false,
      temperature: 0.2,   // lower = more deterministic SQL output
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    })

    const aiContent = response.choices[0]?.message?.content || ''
    const sqlMatch = aiContent.match(/```sql\n([\s\S]*?)```/)

    // ── Step 2: If SQL returned, execute it (with retry) ─────────────────────
    if (sqlMatch) {
      const rawSql = sqlMatch[1].trim()
      const { sql, result } = await runSqlWithRetry(rawSql, lastUserMsg.content, systemPrompt)

      let finalResponse = ''

      if (result.error) {
        finalResponse = `I tried to query the database but ran into an issue:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n❌ **Error:** ${result.error}\n\nCould you rephrase your question or be more specific? For example, instead of "show grades", try "show average grades by subject for Grade 10".`
      } else if (result.rows.length === 0) {
        finalResponse = `I ran this query but found no matching records:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n📭 **No results found.** This could mean the data doesn't exist yet, or the filters are too specific. Try broadening your question.`
      } else {
        // Build markdown table
        const columns = result.columns
        const header = '| ' + columns.join(' | ') + ' |'
        const separator = '| ' + columns.map(() => '---').join(' | ') + ' |'
        const rows = result.rows
          .map((row: any) => '| ' + columns.map((col) => String(row[col] ?? '—')).join(' | ') + ' |')
          .join('\n')
        const table = `${header}\n${separator}\n${rows}`

        // ── Step 3: Ask AI to explain the results naturally ────────────────
        const explainResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          stream: false,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content: `You are a school data analyst helping ${userName} (${userRole}). 
You just ran a query for them and got results. Your job is to:
1. Briefly summarize what the data shows in 2-3 sentences (friendly, conversational tone)
2. Call out any notable patterns, highs, lows, or things that need attention
3. If relevant, suggest a follow-up question they might want to ask
Keep it concise. Do NOT repeat the table — just give the insight.`,
            },
            {
              role: 'user',
              content: `User asked: "${lastUserMsg.content}"\n\nQuery results (${result.rows.length} row${result.rows.length !== 1 ? 's' : ''}):\n${table}`,
            },
          ],
        })

        const explanation = explainResponse.choices[0]?.message?.content || ''
        finalResponse = `📊 **Results** (${result.rows.length} row${result.rows.length !== 1 ? 's' : ''}):\n\n${table}\n\n---\n\n${explanation}`
      }

      return streamText(finalResponse)
    }

    // ── Step 4: No SQL — return conversational response as-is ────────────────
    return streamText(aiContent)

  } catch (error: any) {
    console.error('Chat API Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function streamText(text: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  })
}
