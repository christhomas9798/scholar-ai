"""
routers/api.py — All JSON API endpoints for ScholarAI.
"""

import os
import re
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from database import query, execute_query

router = APIRouter(prefix="/api")


# ── /api/stats ────────────────────────────────────────────────────────────────
@router.get("/stats")
def get_stats(user: dict = Depends(get_current_user)):
    role = user["role"]

    if role in ("PRINCIPAL", "VICE_PRINCIPAL", "ADMIN"):
        students = query('SELECT COUNT(*) as c FROM "Student" WHERE status="ACTIVE"')[0]["c"]
        teachers = query('SELECT COUNT(*) as c FROM "User" WHERE role="TEACHER" AND isActive=1')[0]["c"]
        avg_grade_row = query('''
            SELECT ROUND(AVG(g.score), 1) as avg
            FROM "Grade" g
            JOIN "Assignment" a ON a.id = g.assignmentId
            JOIN "Term" t ON t.id = a.termId WHERE t.isCurrent=1
        ''')
        avg_grade = avg_grade_row[0]["avg"] if avg_grade_row[0]["avg"] else 0

        week_ago = (date.today() - timedelta(days=7)).isoformat()
        att_rows = query(f'''
            SELECT
              ROUND(100.0 * SUM(CASE WHEN status="PRESENT" THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
            FROM "Attendance" WHERE date >= ?
        ''', (week_ago,))
        att_rate = att_rows[0]["rate"] if att_rows[0]["rate"] else 0

        return {
            "role": role,
            "stats": {"students": students, "teachers": teachers,
                       "avgGrade": avg_grade, "attendanceRate": att_rate}
        }

    # Teacher-specific
    teacher_rows = query('SELECT id FROM "User" WHERE email=?', (user["email"],))
    if not teacher_rows:
        return {"role": role, "stats": {}}
    teacher_id = teacher_rows[0]["id"]

    my_students = query('''
        SELECT COUNT(DISTINCT st.id) as c
        FROM "Student" st
        JOIN "TeacherSubject" ts ON ts.sectionId = st.sectionId AND ts.teacherId = ?
    ''', (teacher_id,))

    my_subjects = query('''
        SELECT COUNT(DISTINCT ts.subjectId) as c, GROUP_CONCAT(DISTINCT sub.name) as names
        FROM "TeacherSubject" ts
        JOIN "Subject" sub ON sub.id = ts.subjectId
        WHERE ts.teacherId = ?
    ''', (teacher_id,))

    avg_rows = query('''
        SELECT ROUND(AVG(g.score), 1) as avg
        FROM "Grade" g
        JOIN "Assignment" a ON a.id = g.assignmentId
        WHERE a.teacherId = ?
    ''', (teacher_id,))

    sections = query('''
        SELECT DISTINCT sec.name
        FROM "TeacherSubject" ts
        JOIN "Section" sec ON sec.id = ts.sectionId
        WHERE ts.teacherId = ?
    ''', (teacher_id,))

    return {
        "role": role,
        "stats": {
            "myStudents": my_students[0]["c"],
            "mySubjects": my_subjects[0]["c"],
            "subjectNames": my_subjects[0]["names"] or "",
            "avgGrade": avg_rows[0]["avg"] if avg_rows[0]["avg"] else 0,
            "sections": ", ".join(r["name"] for r in sections),
        }
    }


# ── /api/students ─────────────────────────────────────────────────────────────
@router.get("/students")
def get_students(user: dict = Depends(get_current_user)):
    role = user["role"]
    if role in ("PRINCIPAL", "VICE_PRINCIPAL", "ADMIN", "COUNSELOR"):
        rows = query('''
            SELECT st.id, st.name, st.email, st.gender, st.gradeLevel, st.status,
                   st.enrollmentDate, sec.name as sectionName
            FROM "Student" st
            LEFT JOIN "Section" sec ON sec.id = st.sectionId
            ORDER BY st.gradeLevel, sec.name, st.name
        ''')
    else:
        teacher_rows = query('SELECT id FROM "User" WHERE email=?', (user["email"],))
        if not teacher_rows:
            return []
        teacher_id = teacher_rows[0]["id"]
        rows = query('''
            SELECT DISTINCT st.id, st.name, st.email, st.gender, st.gradeLevel,
                   st.status, st.enrollmentDate, sec.name as sectionName
            FROM "Student" st
            JOIN "Section" sec ON sec.id = st.sectionId
            JOIN "TeacherSubject" ts ON ts.sectionId = sec.id AND ts.teacherId = ?
            ORDER BY st.gradeLevel, sec.name, st.name
        ''', (teacher_id,))
    return rows


# ── /api/teachers ─────────────────────────────────────────────────────────────
@router.get("/teachers")
def get_teachers(user: dict = Depends(get_current_user)):
    if user["role"] not in ("PRINCIPAL", "VICE_PRINCIPAL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")
    return query('''
        SELECT u.id, u.name, u.email, u.role, u.phone, u.hireDate, u.isActive,
               d.name as departmentName,
               COUNT(DISTINCT ts.subjectId) as subjectCount,
               COUNT(DISTINCT ts.sectionId) as sectionCount
        FROM "User" u
        LEFT JOIN "Department" d ON d.id = u.departmentId
        LEFT JOIN "TeacherSubject" ts ON ts.teacherId = u.id
        WHERE u.role IN ("TEACHER","COUNSELOR","ADMIN","VICE_PRINCIPAL")
        GROUP BY u.id
        ORDER BY u.role, u.name
    ''')


# ── /api/attendance ───────────────────────────────────────────────────────────
@router.get("/attendance")
def get_attendance(user: dict = Depends(get_current_user), date_param: str = None):
    target_date = date_param or date.today().isoformat()
    role = user["role"]
    if role in ("PRINCIPAL", "VICE_PRINCIPAL", "ADMIN"):
        return query('''
            SELECT att.date, att.status, st.name as studentName,
                   sec.name as sectionName, sec.gradeLevel
            FROM "Attendance" att
            JOIN "Student" st ON st.id = att.studentId
            JOIN "Section" sec ON sec.id = att.sectionId
            WHERE att.date = ?
            ORDER BY sec.gradeLevel, sec.name, st.name
        ''', (target_date,))
    else:
        teacher_rows = query('SELECT id FROM "User" WHERE email=?', (user["email"],))
        if not teacher_rows:
            return []
        tid = teacher_rows[0]["id"]
        return query('''
            SELECT att.date, att.status, st.name as studentName,
                   sec.name as sectionName, sec.gradeLevel
            FROM "Attendance" att
            JOIN "Student" st ON st.id = att.studentId
            JOIN "Section" sec ON sec.id = att.sectionId
            JOIN "TeacherSubject" ts ON ts.sectionId = sec.id AND ts.teacherId = ?
            WHERE att.date = ?
            ORDER BY sec.name, st.name
        ''', (tid, target_date))


# ── /api/announcements ────────────────────────────────────────────────────────
@router.get("/announcements")
def get_announcements(user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    return query('''
        SELECT a.id, a.title, a.content, a.priority, a.scope,
               a.createdAt, a.expiresAt, u.name as authorName
        FROM "Announcement" a
        JOIN "User" u ON u.id = a.authorId
        WHERE a.expiresAt >= ? OR a.expiresAt IS NULL
        ORDER BY
          CASE a.priority WHEN "URGENT" THEN 1 WHEN "HIGH" THEN 2 WHEN "NORMAL" THEN 3 ELSE 4 END,
          a.createdAt DESC
        LIMIT 10
    ''', (today,))


# ── /api/events ───────────────────────────────────────────────────────────────
@router.get("/events")
def get_events(user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    return query('''
        SELECT e.id, e.title, e.type, e.startDate, e.endDate, u.name as createdBy
        FROM "Event" e
        JOIN "User" u ON u.id = e.createdBy
        WHERE e.startDate >= ?
        ORDER BY e.startDate
        LIMIT 10
    ''', (today,))


# ── /api/schedule ─────────────────────────────────────────────────────────────
@router.get("/schedule")
def get_schedule(user: dict = Depends(get_current_user)):
    teacher_rows = query('SELECT id FROM "User" WHERE email=?', (user["email"],))
    if not teacher_rows:
        return []
    tid = teacher_rows[0]["id"]
    return query('''
        SELECT sch.dayOfWeek, sch.period, sch.startTime, sch.endTime,
               sub.name as subjectName, sec.name as sectionName, r.name as roomName
        FROM "Schedule" sch
        JOIN "TeacherSubject" ts ON ts.id = sch.teacherSubjectId
        JOIN "Subject" sub ON sub.id = ts.subjectId
        JOIN "Section" sec ON sec.id = ts.sectionId
        LEFT JOIN "Room" r ON r.id = sch.roomId
        WHERE ts.teacherId = ?
        ORDER BY sch.dayOfWeek, sch.period
    ''', (tid,))


# ── /api/chat ─────────────────────────────────────────────────────────────────
from openai import OpenAI
from pydantic import BaseModel

groq_client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

class ChatRequest(BaseModel):
    messages: list[dict]


def build_system_prompt(user: dict) -> str:
    today = date.today()
    today_str = today.isoformat()
    yesterday_str = (today - timedelta(days=1)).isoformat()
    week_ago_str = (today - timedelta(days=7)).isoformat()
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = days[today.weekday()]

    teacher_ctx = ""
    if user["role"] in ("TEACHER", "COUNSELOR"):
        teacher_rows = query('SELECT id, name FROM "User" WHERE email=?', (user["email"],))
        if teacher_rows:
            tid = teacher_rows[0]["id"]
            assignments = query('''
                SELECT DISTINCT sec.name as sectionName, sub.name as subjectName
                FROM "TeacherSubject" ts
                JOIN "Section" sec ON sec.id = ts.sectionId
                JOIN "Subject" sub ON sub.id = ts.subjectId
                WHERE ts.teacherId = ?
            ''', (tid,))
            sections = ", ".join(set(a["sectionName"] for a in assignments))
            subjects = ", ".join(set(a["subjectName"] for a in assignments))
            teacher_ctx = f"""
━━━ YOUR IDENTITY ━━━
Teaching: {subjects or 'not assigned'}  |  Sections: {sections or 'not assigned'}
Teacher ID: "{tid}"
SCOPE RULES: Only show data for your assigned sections unless the user asks school-wide questions.
"""

    return f"""You are ScholarAI, an intelligent school management AI assistant.

━━━ TODAY ━━━
Date: {today_str} ({day_name}) | Yesterday: {yesterday_str} | Last 7 days: since {week_ago_str}

━━━ DATABASE SCHEMA (SQLite) ━━━
"AcademicYear"   — id, name, startDate, endDate, isCurrent
"Term"           — id, name, academicYearId, startDate, endDate, isCurrent
"Department"     — id, name, headTeacherId
"User"           — id, email, name, role (PRINCIPAL|VICE_PRINCIPAL|TEACHER|COUNSELOR|ADMIN), departmentId
"Subject"        — id, name, code, departmentId, creditHours
"Room"           — id, name, building, capacity, type (CLASSROOM|LAB|GYM|AUDITORIUM)
"Section"        — id, name (10-A), gradeLevel (9-12), termId, roomId, maxCapacity
"Student"        — id, name, email, dateOfBirth, gender (M|F), enrollmentDate, status (ACTIVE|...), gradeLevel, sectionId
"TeacherSubject" — id, teacherId, subjectId, sectionId, termId
"Schedule"       — id, teacherSubjectId, dayOfWeek (1=Mon..5=Fri), period (1-8), startTime, endTime, roomId
"Assignment"     — id, title, type (HOMEWORK|QUIZ|MIDTERM|FINAL|PROJECT), subjectId, sectionId, teacherId, termId, maxScore, weight
"Grade"          — id, studentId, assignmentId, score (0-100), gradedAt
"GradeScale"     — id, letterGrade, minScore, maxScore, gpa
"Attendance"     — id, studentId, sectionId, date (YYYY-MM-DD), status (PRESENT|ABSENT|LATE|EXCUSED)
"Announcement"   — id, title, content, authorId, priority, createdAt, expiresAt
"Event"          — id, title, type, startDate, endDate, createdBy

━━━ RULES ━━━
1. Data questions → respond with ONLY a SQL query in ```sql fences.
2. Conversational/explanation questions → respond in friendly plain text.
3. Always double-quote table names: "Student", "Grade", etc.
4. Dates are TEXT 'YYYY-MM-DD'. Use literal dates not date('now').
5. Always ROUND(x, 1) for averages and percentages.
6. "Absent" = status='ABSENT', "Late" = status='LATE', GPA → join GradeScale on score range.
7. "At risk" = avg score < 65 OR attendance < 85%.
8. "Today" = '{today_str}', "yesterday" = '{yesterday_str}', "this week" ≥ '{week_ago_str}'.
{teacher_ctx}"""


def run_sql_with_retry(sql: str, question: str, system: str) -> dict:
    result = execute_query(sql)
    if result["error"]:
        fix_resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": question},
                {"role": "assistant", "content": f"```sql\n{sql}\n```"},
                {"role": "user", "content": f"Error: {result['error']}\nFix the SQL and return only the corrected query in ```sql blocks."},
            ],
            temperature=0.1,
        )
        fixed = fix_resp.choices[0].message.content or ""
        m = re.search(r"```sql\n([\s\S]*?)```", fixed)
        if m:
            fixed_sql = m.group(1).strip()
            result = execute_query(fixed_sql)
            return {"sql": fixed_sql, "result": result}
    return {"sql": sql, "result": result}


@router.post("/chat")
def chat(body: ChatRequest, user: dict = Depends(get_current_user)):
    system = build_system_prompt(user)
    messages = [{"role": "system", "content": system}] + body.messages

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.2,
    )
    ai_content = response.choices[0].message.content or ""

    sql_match = re.search(r"```sql\n([\s\S]*?)```", ai_content)
    if not sql_match:
        return {"type": "text", "content": ai_content}

    raw_sql = sql_match.group(1).strip()
    res = run_sql_with_retry(raw_sql, body.messages[-1]["content"], system)
    result = res["result"]
    sql = res["sql"]

    if result["error"]:
        return {"type": "error", "sql": sql,
                "content": f"Query failed: {result['error']}"}

    if not result["rows"]:
        return {"type": "empty", "sql": sql,
                "content": "No records found for that query."}

    # Build markdown table
    cols = result["columns"]
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join("---" for _ in cols) + " |"
    rows_md = "\n".join(
        "| " + " | ".join(str(r.get(c, "—")) for c in cols) + " |"
        for r in result["rows"]
    )
    table = f"{header}\n{sep}\n{rows_md}"

    # Get a brief insight from the AI
    insight_resp = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": f"You are a school data analyst helping {user['name']} ({user['role']}). Summarize the query results in 2-3 friendly sentences, highlight key patterns, and suggest one follow-up question. Do NOT repeat the table."},
            {"role": "user", "content": f"Question: \"{body.messages[-1]['content']}\"\n\nResults ({len(result['rows'])} rows):\n{table}"},
        ],
        temperature=0.4,
    )
    insight = insight_resp.choices[0].message.content or ""

    return {
        "type": "table",
        "sql": sql,
        "rowCount": len(result["rows"]),
        "table": table,
        "insight": insight,
    }
