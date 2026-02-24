import OpenAI from 'openai'
import { executeQuery, getDb } from '@/lib/database'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

const BASE_SCHEMA = `You are a helpful AI assistant for ScholarAI, a school management system.
You have access to a SQLite database with the following schema:

CORE TABLES:
- "AcademicYear" (id, name TEXT '2025-2026', startDate, endDate, isCurrent INTEGER)
- "Term" (id, name TEXT 'Semester 1/2', academicYearId → AcademicYear, startDate, endDate, isCurrent)
- "Department" (id, name TEXT, headTeacherId → User)
- "User" (id, email, password, name, role TEXT ['PRINCIPAL','VICE_PRINCIPAL','TEACHER','ADMIN','COUNSELOR'], departmentId → Department, phone, hireDate, isActive)

ACADEMIC:
- "Subject" (id, name TEXT, code TEXT 'MATH101', departmentId → Department, creditHours REAL)
- "Room" (id, name TEXT, building, capacity, type TEXT ['CLASSROOM','LAB','GYM','AUDITORIUM'])
- "Section" (id, name TEXT '10-A', gradeLevel INTEGER [9-12], termId → Term, roomId → Room, maxCapacity)

PEOPLE:
- "Student" (id, name, email, dateOfBirth, gender TEXT ['M','F'], enrollmentDate, status TEXT ['ACTIVE'], gradeLevel INTEGER, sectionId → Section)
- "Guardian" (id, name, relationship TEXT ['Father','Mother','Guardian'], phone, email, occupation)
- "StudentGuardian" (id, studentId → Student, guardianId → Guardian, isPrimary INTEGER)

TEACHING:
- "TeacherSubject" (id, teacherId → User, subjectId → Subject, sectionId → Section, termId → Term)

GRADES:
- "Assignment" (id, title, type TEXT ['HOMEWORK','QUIZ','MIDTERM','FINAL','PROJECT','CLASSWORK'], subjectId → Subject, sectionId → Section, teacherId → User, termId → Term, dueDate, maxScore REAL, weight REAL)
- "Grade" (id, studentId → Student, assignmentId → Assignment, score REAL, feedback, submittedAt, gradedAt)
- "GradeScale" (id, letterGrade TEXT 'A+', minScore REAL, maxScore REAL, gpa REAL)

ATTENDANCE:
- "Attendance" (id, studentId → Student, sectionId → Section, date TEXT 'YYYY-MM-DD', status TEXT ['PRESENT','ABSENT','LATE','EXCUSED'], period INTEGER, markedById → User)

COMMUNICATION:
- "Announcement" (id, title, content, authorId → User, scope TEXT ['SCHOOL','GRADE','SECTION'], targetId, priority TEXT, createdAt, expiresAt)
- "Event" (id, title, description, type TEXT ['EXAM','HOLIDAY','PTM','SPORTS','CULTURAL'], startDate, endDate, isAllDay, createdBy → User)

DATA STATS: 14 staff, 40 students (5 per section), 8 sections (2 per grade 9-12), 17 subjects, 5 departments.

RULES:
1. When the user asks a data question, respond with ONLY a SQL query wrapped in \`\`\`sql code fences.
2. Use SQLite syntax. Table names MUST be quoted with double quotes, e.g. "Student".
3. For non-data questions, just chat normally.
4. Always use ROUND() for averages.
5. Keep queries efficient — use JOINs, GROUP BY, and ORDER BY as needed.
6. For grade calculations, join Grade → Assignment to get subject/section info.
7. Remember: "Grade" table has scores per assignment, not per subject directly.`

function getTeacherContext(teacherEmail: string): string {
  const db = getDb()

  // Find teacher in SQLite
  const teacher = db.prepare('SELECT id, name FROM "User" WHERE email = ?').get(teacherEmail) as any
  if (!teacher) return ''

  // Get their assigned sections and subjects
  const assignments = db.prepare(`
    SELECT DISTINCT
      s.name as sectionName, s.gradeLevel,
      sub.name as subjectName
    FROM "TeacherSubject" ts
    JOIN "Section" s ON s.id = ts.sectionId
    JOIN "Subject" sub ON sub.id = ts.subjectId
    WHERE ts.teacherId = ?
  `).all(teacher.id) as any[]

  if (assignments.length === 0) return ''

  const sectionList = Array.from(new Set(assignments.map((a: any) => a.sectionName))).join(', ')
  const subjectList = Array.from(new Set(assignments.map((a: any) => a.subjectName))).join(', ')

  return `
IMPORTANT TEACHER CONTEXT:
You are assisting teacher "${teacher.name}" (email: ${teacherEmail}, id: "${teacher.id}").
This teacher teaches: ${subjectList}
In sections: ${sectionList}

CRITICAL: This teacher can ONLY see data for students in their assigned sections.
When querying students, grades, or attendance, ALWAYS filter by this teacher's sections using:
  JOIN "TeacherSubject" ts ON ts.sectionId = "Student".sectionId AND ts.teacherId = '${teacher.id}'
Or filter assignments by:
  WHERE "Assignment".teacherId = '${teacher.id}'
NEVER show data from other teachers' sections unless explicitly asked about school-wide stats (which only principals can see).`
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const { messages } = await req.json()

    const userEmail = (session?.user as any)?.email || ''
    const userRole = (session?.user as any)?.role || 'TEACHER'
    const userName = (session?.user as any)?.name || 'User'

    // Build role-specific prompt
    let systemPrompt = BASE_SCHEMA

    if (userRole === 'PRINCIPAL' || userRole === 'VICE_PRINCIPAL') {
      systemPrompt += `\n\nYou are assisting ${userName}, a ${userRole}. They have FULL ACCESS to all school data. No filtering needed.`
    } else {
      const teacherCtx = getTeacherContext(userEmail)
      if (teacherCtx) {
        systemPrompt += teacherCtx
      }
    }

    const lastUserMsg = messages[messages.length - 1]

    // Get AI's response
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    })

    const aiContent = response.choices[0]?.message?.content || ''

    // Check if the AI returned SQL
    const sqlMatch = aiContent.match(/```sql\n([\s\S]*?)```/)

    if (sqlMatch) {
      const sql = sqlMatch[1].trim()
      const result = executeQuery(sql)

      let finalResponse = ''

      if (result.error) {
        finalResponse = `I tried to run this query:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n❌ **Error:** ${result.error}\n\nLet me try a different approach...`
      } else if (result.rows.length === 0) {
        finalResponse = `I ran this query:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n📭 No results found. The query returned zero rows.`
      } else {
        const columns = result.columns
        const header = '| ' + columns.join(' | ') + ' |'
        const separator = '| ' + columns.map(() => '---').join(' | ') + ' |'
        const rows = result.rows
          .map((row: any) => '| ' + columns.map((col) => String(row[col] ?? '')).join(' | ') + ' |')
          .join('\n')

        const table = `${header}\n${separator}\n${rows}`
        finalResponse = `📊 Here are the results:\n\n${table}\n\n`

        const explainResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          stream: false,
          messages: [
            {
              role: 'system',
              content: `You are a helpful school data analyst assisting ${userName} (${userRole}). Briefly explain the query results in a friendly way. Be concise (2-3 sentences). Highlight patterns.`,
            },
            {
              role: 'user',
              content: `The user asked: "${lastUserMsg.content}"\n\nQuery: ${sql}\n\nResults:\n${table}`,
            },
          ],
        })

        finalResponse += explainResponse.choices[0]?.message?.content || ''
      }

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`0:${JSON.stringify(finalResponse)}\n`))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Vercel-AI-Data-Stream': 'v1' },
      })
    }

    // No SQL — normal response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify(aiContent)}\n`))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Vercel-AI-Data-Stream': 'v1' },
    })
  } catch (error: any) {
    console.error('Chat Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
