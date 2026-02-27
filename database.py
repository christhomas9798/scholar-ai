"""
database.py — SQLite setup, schema creation, and seeding for ScholarAI (Python/FastAPI).

Single source of truth: all data lives in SQLite. Auth reads from here too — no Postgres split-brain.
"""

import sqlite3
import os
import uuid
import time
import random
from datetime import datetime
import bcrypt
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DATABASE_PATH", "./scholar.db")


def get_db() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with WAL mode and FK support."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def generate_id() -> str:
    return f"id_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS "AcademicYear" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  isCurrent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Term" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academicYearId TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  isCurrent INTEGER DEFAULT 0,
  FOREIGN KEY (academicYearId) REFERENCES "AcademicYear"(id)
);

CREATE TABLE IF NOT EXISTS "Department" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  headTeacherId TEXT
);

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('PRINCIPAL','VICE_PRINCIPAL','TEACHER','COUNSELOR','ADMIN')),
  departmentId TEXT,
  phone TEXT,
  hireDate TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (departmentId) REFERENCES "Department"(id)
);

CREATE TABLE IF NOT EXISTS "Subject" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  departmentId TEXT NOT NULL,
  creditHours REAL DEFAULT 1.0,
  FOREIGN KEY (departmentId) REFERENCES "Department"(id)
);

CREATE TABLE IF NOT EXISTS "Room" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building TEXT DEFAULT 'Main',
  capacity INTEGER DEFAULT 30,
  type TEXT DEFAULT 'CLASSROOM'
);

CREATE TABLE IF NOT EXISTS "Section" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gradeLevel INTEGER NOT NULL,
  termId TEXT NOT NULL,
  roomId TEXT,
  maxCapacity INTEGER DEFAULT 35,
  FOREIGN KEY (termId) REFERENCES "Term"(id),
  FOREIGN KEY (roomId) REFERENCES "Room"(id)
);

CREATE TABLE IF NOT EXISTS "Student" (
  id TEXT PRIMARY KEY,
  admissionNo TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  dateOfBirth TEXT,
  gender TEXT,
  enrollmentDate TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  gradeLevel INTEGER NOT NULL,
  sectionId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sectionId) REFERENCES "Section"(id)
);

CREATE TABLE IF NOT EXISTS "Guardian" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  occupation TEXT
);

CREATE TABLE IF NOT EXISTS "StudentGuardian" (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  guardianId TEXT NOT NULL,
  isPrimary INTEGER DEFAULT 0,
  FOREIGN KEY (studentId) REFERENCES "Student"(id),
  FOREIGN KEY (guardianId) REFERENCES "Guardian"(id)
);

CREATE TABLE IF NOT EXISTS "TeacherSubject" (
  id TEXT PRIMARY KEY,
  teacherId TEXT NOT NULL,
  subjectId TEXT NOT NULL,
  sectionId TEXT NOT NULL,
  termId TEXT NOT NULL,
  FOREIGN KEY (teacherId) REFERENCES "User"(id),
  FOREIGN KEY (subjectId) REFERENCES "Subject"(id),
  FOREIGN KEY (sectionId) REFERENCES "Section"(id)
);

CREATE TABLE IF NOT EXISTS "Schedule" (
  id TEXT PRIMARY KEY,
  teacherSubjectId TEXT NOT NULL,
  dayOfWeek INTEGER NOT NULL,
  period INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  roomId TEXT,
  FOREIGN KEY (teacherSubjectId) REFERENCES "TeacherSubject"(id),
  FOREIGN KEY (roomId) REFERENCES "Room"(id)
);

CREATE TABLE IF NOT EXISTS "Assignment" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  subjectId TEXT NOT NULL,
  sectionId TEXT NOT NULL,
  teacherId TEXT NOT NULL,
  termId TEXT NOT NULL,
  dueDate TEXT,
  maxScore REAL DEFAULT 100,
  weight REAL DEFAULT 1.0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (subjectId) REFERENCES "Subject"(id),
  FOREIGN KEY (sectionId) REFERENCES "Section"(id),
  FOREIGN KEY (teacherId) REFERENCES "User"(id)
);

CREATE TABLE IF NOT EXISTS "Grade" (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  assignmentId TEXT NOT NULL,
  score REAL,
  feedback TEXT,
  submittedAt TEXT,
  gradedAt TEXT,
  FOREIGN KEY (studentId) REFERENCES "Student"(id),
  FOREIGN KEY (assignmentId) REFERENCES "Assignment"(id)
);

CREATE TABLE IF NOT EXISTS "GradeScale" (
  id TEXT PRIMARY KEY,
  letterGrade TEXT NOT NULL,
  minScore REAL NOT NULL,
  maxScore REAL NOT NULL,
  gpa REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS "Attendance" (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  sectionId TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  period INTEGER,
  notes TEXT,
  markedById TEXT,
  FOREIGN KEY (studentId) REFERENCES "Student"(id),
  FOREIGN KEY (sectionId) REFERENCES "Section"(id),
  UNIQUE (studentId, date, period)
);

CREATE TABLE IF NOT EXISTS "Announcement" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  authorId TEXT NOT NULL,
  scope TEXT DEFAULT 'SCHOOL',
  targetId TEXT,
  priority TEXT DEFAULT 'NORMAL',
  createdAt TEXT DEFAULT (datetime('now')),
  expiresAt TEXT,
  FOREIGN KEY (authorId) REFERENCES "User"(id)
);

CREATE TABLE IF NOT EXISTS "Event" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT,
  isAllDay INTEGER DEFAULT 1,
  createdBy TEXT NOT NULL,
  FOREIGN KEY (createdBy) REFERENCES "User"(id)
);
"""


def init_db():
    """Create schema and seed if not already done."""
    conn = get_db()
    try:
        # Check if already seeded
        row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Student'").fetchone()
        if row:
            return  # Already initialized

        # Create all tables
        conn.executescript(SCHEMA_SQL)
        conn.commit()
        _seed(conn)
        print("\n✅ ScholarAI Python DB seeded — 14 staff, 40 students, 17 subjects, 8 sections\n")
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection):
    """Seed the database with demo school data."""

    # ── Academic Year & Terms ────────────────────────────────────────────────
    year_id = generate_id()
    conn.execute("INSERT INTO \"AcademicYear\" VALUES (?,?,?,?,?)",
                 (year_id, '2025-2026', '2025-08-15', '2026-06-15', 1))

    term1_id = generate_id()
    term2_id = generate_id()
    conn.execute("INSERT INTO \"Term\" VALUES (?,?,?,?,?,?)",
                 (term1_id, 'Semester 1', year_id, '2025-08-15', '2025-12-20', 0))
    conn.execute("INSERT INTO \"Term\" VALUES (?,?,?,?,?,?)",
                 (term2_id, 'Semester 2', year_id, '2026-01-06', '2026-06-15', 1))

    # ── Departments ──────────────────────────────────────────────────────────
    depts = [
        (generate_id(), 'Mathematics'),
        (generate_id(), 'Science'),
        (generate_id(), 'English & Literature'),
        (generate_id(), 'Social Studies'),
        (generate_id(), 'Arts & Physical Education'),
    ]
    for d in depts:
        conn.execute('INSERT INTO "Department" (id, name) VALUES (?,?)', d)

    # ── Grade Scale ──────────────────────────────────────────────────────────
    scales = [
        ('A+', 97, 100, 4.0), ('A', 93, 96.99, 4.0), ('A-', 90, 92.99, 3.7),
        ('B+', 87, 89.99, 3.3), ('B', 83, 86.99, 3.0), ('B-', 80, 82.99, 2.7),
        ('C+', 77, 79.99, 2.3), ('C', 73, 76.99, 2.0), ('C-', 70, 72.99, 1.7),
        ('D', 60, 69.99, 1.0), ('F', 0, 59.99, 0.0),
    ]
    for s in scales:
        conn.execute('INSERT INTO "GradeScale" VALUES (?,?,?,?,?)',
                     (generate_id(), s[0], s[1], s[2], s[3]))

    # ── Rooms ────────────────────────────────────────────────────────────────
    room_defs = [
        ('Room 101', 'CLASSROOM'), ('Room 102', 'CLASSROOM'), ('Room 103', 'CLASSROOM'),
        ('Room 104', 'CLASSROOM'), ('Room 201', 'CLASSROOM'), ('Room 202', 'CLASSROOM'),
        ('Room 203', 'CLASSROOM'), ('Room 204', 'CLASSROOM'),
        ('Science Lab A', 'LAB'), ('Science Lab B', 'LAB'),
        ('Computer Lab', 'LAB'), ('Art Studio', 'CLASSROOM'),
        ('Gymnasium', 'GYM'), ('Auditorium', 'AUDITORIUM'),
    ]
    rooms = []
    for r in room_defs:
        rid = generate_id()
        rooms.append({'id': rid, 'name': r[0], 'type': r[1]})
        conn.execute('INSERT INTO "Room" VALUES (?,?,?,?,?)', (rid, r[0], 'Main', 30, r[1]))

    # ── Staff ────────────────────────────────────────────────────────────────
    print("🔐 Hashing staff passwords (this takes a moment)...")
    staff_data = [
        ('Dr. Jane Smith',    'PRINCIPAL',      -1, 'principal@school.edu',     'Principal@2025!'),
        ('Mr. Robert Clark',  'VICE_PRINCIPAL', -1, 'vp@school.edu',            'VPClark@2025#'),
        ('Mr. John Doe',      'TEACHER',         0, 'john.doe@school.edu',      'JohnMath@101'),
        ('Ms. Sarah Wilson',  'TEACHER',         0, 'sarah.wilson@school.edu',  'SarahAlg@202'),
        ('Mr. Michael Chen',  'TEACHER',         1, 'michael.chen@school.edu',  'MikeSci@Bio1'),
        ('Ms. Emily Davis',   'TEACHER',         1, 'emily.davis@school.edu',   'EmilyPhys@25'),
        ('Mr. James Brown',   'TEACHER',         2, 'james.brown@school.edu',   'JamesEng@Lit'),
        ('Ms. Lisa Patel',    'TEACHER',         2, 'lisa.patel@school.edu',    'LisaAP@Eng25'),
        ('Mr. David Kim',     'TEACHER',         3, 'david.kim@school.edu',     'DavidHist@25'),
        ('Ms. Rachel Green',  'TEACHER',         3, 'rachel.green@school.edu',  'RachelGov@25'),
        ('Mr. Carlos Rivera', 'TEACHER',         4, 'carlos.rivera@school.edu', 'CarlosPE@25!'),
        ('Ms. Amanda Foster', 'TEACHER',         4, 'amanda.foster@school.edu', 'AmandaArt@25'),
        ('Ms. Karen White',   'COUNSELOR',      -1, 'counselor@school.edu',     'KarenCoun@25'),
        ('Mr. Tom Harris',    'ADMIN',          -1, 'admin@school.edu',         'TomAdmin@25!'),
    ]

    staff = []
    credentials = []
    for i, s in enumerate(staff_data):
        sid = generate_id()
        dept_id = depts[s[2]][0] if s[2] >= 0 else None
        ph = f"555-{random.randint(1000, 9999)}"
        hire = f"{random.randint(2018, 2024)}-0{random.randint(1, 8)}-15"
        pw_hash = bcrypt.hashpw(s[4].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        conn.execute(
            'INSERT INTO "User" (id, email, password, name, role, departmentId, phone, hireDate) VALUES (?,?,?,?,?,?,?,?)',
            (sid, s[3], pw_hash, s[0], s[1], dept_id, ph, hire)
        )
        staff.append({'id': sid, 'name': s[0], 'role': s[1], 'email': s[3], 'dept_idx': s[2]})
        credentials.append((s[1], s[3], s[4]))

    # Set dept heads
    for dept_idx, staff_idx in [(0, 2), (1, 4), (2, 6), (3, 8), (4, 10)]:
        conn.execute('UPDATE "Department" SET headTeacherId=? WHERE id=?',
                     (staff[staff_idx]['id'], depts[dept_idx][0]))

    # ── Subjects ─────────────────────────────────────────────────────────────
    subjects_data = [
        ('Algebra I', 'MATH101', 0), ('Geometry', 'MATH102', 0),
        ('Algebra II', 'MATH201', 0), ('Pre-Calculus', 'MATH301', 0),
        ('Biology', 'SCI101', 1), ('Chemistry', 'SCI201', 1),
        ('Physics', 'SCI301', 1),
        ('English 9', 'ENG101', 2), ('English 10', 'ENG201', 2),
        ('AP English', 'ENG301', 2),
        ('World History', 'SOC101', 3), ('US Government', 'SOC201', 3),
        ('Economics', 'SOC301', 3),
        ('Art', 'PE101', 4), ('Music', 'PE102', 4),
        ('Physical Education', 'PE201', 4), ('Health', 'PE202', 4),
    ]
    subjects = []
    for s in subjects_data:
        sid = generate_id()
        subjects.append({'id': sid, 'name': s[0], 'dept_idx': s[2]})
        conn.execute('INSERT INTO "Subject" VALUES (?,?,?,?,?)',
                     (sid, s[0], s[1], depts[s[2]][0], 1.0))

    # ── Sections ─────────────────────────────────────────────────────────────
    section_defs = [
        ('9-A', 9), ('9-B', 9), ('10-A', 10), ('10-B', 10),
        ('11-A', 11), ('11-B', 11), ('12-A', 12), ('12-B', 12),
    ]
    sections = []
    for i, (name, grade) in enumerate(section_defs):
        sid = generate_id()
        sections.append({'id': sid, 'name': name, 'gradeLevel': grade})
        conn.execute(
            'INSERT INTO "Section" (id, name, gradeLevel, termId, roomId, maxCapacity) VALUES (?,?,?,?,?,?)',
            (sid, name, grade, term2_id, rooms[i]['id'], 35)
        )

    # ── TeacherSubject assignments ───────────────────────────────────────────
    # Teachers 2-11 are teachers (indices in staff list)
    teacher_subject_map = [
        (2, [0, 1]),   # John Doe → Algebra I, Geometry
        (3, [2, 3]),   # Sarah Wilson → Algebra II, Pre-Calc
        (4, [4, 5]),   # Michael Chen → Biology, Chemistry
        (5, [6]),      # Emily Davis → Physics
        (6, [7, 8]),   # James Brown → English 9, 10
        (7, [9]),      # Lisa Patel → AP English
        (8, [10]),     # David Kim → World History
        (9, [11, 12]), # Rachel Green → US Gov, Econ
        (10, [15, 16]),# Carlos Rivera → PE, Health
        (11, [13, 14]),# Amanda Foster → Art, Music
    ]

    teacher_subjects = []
    for teacher_idx, subj_indices in teacher_subject_map:
        teacher = staff[teacher_idx]
        for subj_idx in subj_indices:
            subj = subjects[subj_idx]
            for sec in sections:
                ts_id = generate_id()
                teacher_subjects.append({'id': ts_id, 'teacherId': teacher['id']})
                conn.execute(
                    'INSERT INTO "TeacherSubject" VALUES (?,?,?,?,?)',
                    (ts_id, teacher['id'], subj['id'], sec['id'], term2_id)
                )

    # ── Schedule ─────────────────────────────────────────────────────────────
    periods = [
        (1, '08:00', '08:45'), (2, '08:50', '09:35'), (3, '09:40', '10:25'),
        (4, '10:35', '11:20'), (5, '11:25', '12:10'), (6, '13:00', '13:45'),
        (7, '13:50', '14:35'), (8, '14:40', '15:25'),
    ]
    counter = 0
    for ts in teacher_subjects:
        for p in range(3):
            day = (counter % 5) + 1
            slot = periods[counter % 8]
            room_idx = counter % len(rooms)
            conn.execute(
                'INSERT OR IGNORE INTO "Schedule" (id, teacherSubjectId, dayOfWeek, period, startTime, endTime, roomId) VALUES (?,?,?,?,?,?,?)',
                (generate_id(), ts['id'], day, slot[0], slot[1], slot[2], rooms[room_idx]['id'])
            )
            counter += 1

    # ── Students ─────────────────────────────────────────────────────────────
    first_names = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William', 'Sophia', 'James',
                   'Isabella', 'Oliver', 'Mia', 'Benjamin', 'Charlotte', 'Elijah', 'Amelia',
                   'Lucas', 'Harper', 'Mason', 'Evelyn', 'Logan']
    last_names = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Wilson', 'Martinez',
                  'Garcia', 'Thomas', 'Jackson', 'Harris', 'Lee', 'Young', 'Robinson',
                  'Walker', 'Hall', 'Allen', 'King', 'Nguyen', 'Cooper']
    genders = ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F']

    students = []
    used_names = set()
    student_idx = 0
    for sec_i, sec in enumerate(sections):
        for _ in range(5):
            while True:
                fn = random.choice(first_names)
                ln = random.choice(last_names)
                full = f"{fn} {ln}"
                if full not in used_names:
                    used_names.add(full)
                    break
            birth_year = 2010 - sec['gradeLevel'] + 9
            gender = genders[student_idx % len(genders)]
            student_idx += 1
            admission = f"ADM-2025-{student_idx:04d}"
            stud_id = generate_id()
            email = f"{fn.lower()}.{ln.lower()}@student.school.edu"
            dob = f"{birth_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
            conn.execute(
                'INSERT INTO "Student" (id, admissionNo, name, email, dateOfBirth, gender, enrollmentDate, status, gradeLevel, sectionId) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (stud_id, admission, full, email, dob, gender, '2025-08-15', 'ACTIVE', sec['gradeLevel'], sec['id'])
            )
            students.append({'id': stud_id, 'name': full, 'sec_idx': sec_i, 'sectionId': sec['id']})

    # ── Assignments & Grades ─────────────────────────────────────────────────
    assign_types = [('Homework', 'HOMEWORK', 0.1), ('Quiz', 'QUIZ', 0.2),
                    ('Midterm', 'MIDTERM', 0.3), ('Final', 'FINAL', 0.4)]
    assignments = []
    for subj_idx, subj in enumerate(subjects):
        teacher_idx_for_subj = next(
            (ti for ti, si_list in teacher_subject_map if subj_idx in si_list), 2)
        teacher_id = staff[teacher_idx_for_subj]['id']
        for a_type in assign_types:
            a_id = generate_id()
            assignments.append({'id': a_id, 'subjectId': subj['id']})
            conn.execute(
                'INSERT INTO "Assignment" (id, title, type, subjectId, sectionId, teacherId, termId, maxScore, weight) VALUES (?,?,?,?,?,?,?,?,?)',
                (a_id, f"{a_type[0]} - {subj['name']}", a_type[1],
                 subj['id'], sections[0]['id'], teacher_id, term2_id, 100, a_type[2])
            )

    # Grades: each student gets a score on each assignment in their section's subjects
    for stud in students:
        for a in assignments[:16]:  # each student: 16 assignments
            score = round(random.gauss(78, 12), 1)
            score = max(40, min(100, score))
            conn.execute(
                'INSERT INTO "Grade" (id, studentId, assignmentId, score, gradedAt) VALUES (?,?,?,?,?)',
                (generate_id(), stud['id'], a['id'], score, '2026-02-15')
            )

    # ── Attendance ───────────────────────────────────────────────────────────
    import datetime as dt
    statuses = ['PRESENT'] * 9 + ['ABSENT'] + ['LATE']
    base_date = dt.date(2026, 2, 1)
    for day_offset in range(20):
        att_date = base_date + dt.timedelta(days=day_offset)
        if att_date.weekday() >= 5:
            continue
        for stud in students:
            conn.execute(
                'INSERT OR IGNORE INTO "Attendance" (id, studentId, sectionId, date, status) VALUES (?,?,?,?,?)',
                (generate_id(), stud['id'], stud['sectionId'],
                 att_date.isoformat(), random.choice(statuses))
            )

    # ── Announcements ────────────────────────────────────────────────────────
    principal_id = staff[0]['id']
    announcements = [
        ('Grade 12 College Applications', 'College application workshop this Friday in the Auditorium.', 'URGENT', '2026-03-02'),
        ('Midterm Grades Due', 'All midterm grades must be entered by end of day Friday.', 'URGENT', '2026-03-01'),
        ('Semester 2 Begins', 'Welcome back! Semester 2 classes have officially started.', 'HIGH', '2026-03-06'),
        ('Staff Meeting', 'Monthly staff meeting scheduled for next Tuesday at 4PM.', 'NORMAL', '2026-03-10'),
        ('STEM Fair Registration', 'Students interested in the STEM Fair must register by March 15.', 'HIGH', '2026-03-15'),
    ]
    for a in announcements:
        conn.execute(
            'INSERT INTO "Announcement" (id, title, content, authorId, scope, priority, expiresAt) VALUES (?,?,?,?,?,?,?)',
            (generate_id(), a[0], a[1], principal_id, 'SCHOOL', a[2], a[3])
        )

    # ── Events ───────────────────────────────────────────────────────────────
    events = [
        ('Semester 2 Midterm Exams', 'EXAM', '2026-03-10', '2026-03-14'),
        ('Spring Break', 'HOLIDAY', '2026-03-23', '2026-03-28'),
        ('Parent-Teacher Meeting', 'PTM', '2026-03-07', '2026-03-07'),
        ('Annual Sports Day', 'SPORTS', '2026-04-05', '2026-04-05'),
        ('Science & Arts Exhibition', 'CULTURAL', '2026-04-20', '2026-04-20'),
        ('Graduation Ceremony', 'CULTURAL', '2026-06-12', '2026-06-12'),
    ]
    for e in events:
        conn.execute(
            'INSERT INTO "Event" (id, title, type, startDate, endDate, createdBy) VALUES (?,?,?,?,?,?)',
            (generate_id(), e[0], e[1], e[2], e[3], principal_id)
        )

    conn.commit()

    # Print credentials
    print("\n🔐 Staff login credentials (shown once at seed time):")
    print("   " + "─" * 65)
    for role, email, pw in credentials:
        print(f"   [{role:<14}] {email:<35} → {pw}")
    print("   " + "─" * 65)
    print("   All passwords are bcrypt-hashed. Only the hash is stored.\n")


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a SELECT query and return list of dicts."""
    conn = get_db()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def execute(sql: str, params: tuple = ()) -> int:
    """Execute an INSERT/UPDATE/DELETE and return lastrowid."""
    conn = get_db()
    try:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def execute_query(sql: str) -> dict:
    """Run arbitrary SQL (from AI chat) and return rows + columns or error."""
    conn = get_db()
    try:
        cur = conn.execute(sql)
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description] if cur.description else []
        return {"rows": [dict(r) for r in rows], "columns": cols, "error": None}
    except Exception as e:
        return {"rows": [], "columns": [], "error": str(e)}
    finally:
        conn.close()
