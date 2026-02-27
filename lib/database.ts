import Database from 'better-sqlite3'
import { hashSync } from 'bcrypt'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'scholar.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
    if (!db) {
        db = new Database(DB_PATH)
        db.pragma('journal_mode = WAL')
        db.pragma('foreign_keys = ON')
        initializeDatabase(db)
    }
    return db
}

function initializeDatabase(db: Database.Database) {
    const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Student'")
        .get()
    if (tableExists) return

    db.exec(`
    -- =============================================
    -- 1. CORE IDENTITY TABLES
    -- =============================================

    CREATE TABLE "AcademicYear" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- '2025-2026'
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      isCurrent INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE "Term" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- 'Semester 1', 'Semester 2'
      academicYearId TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      isCurrent INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (academicYearId) REFERENCES "AcademicYear"(id)
    );

    CREATE TABLE "Department" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- 'Mathematics', 'Science'
      headTeacherId TEXT           -- FK set after teachers created
    );

    CREATE TABLE "User" (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'TEACHER',  -- PRINCIPAL, VICE_PRINCIPAL, TEACHER, ADMIN, COUNSELOR
      departmentId TEXT,
      phone TEXT,
      hireDate TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (departmentId) REFERENCES "Department"(id)
    );

    -- =============================================
    -- 2. ACADEMIC STRUCTURE
    -- =============================================

    CREATE TABLE "Subject" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- 'Algebra I', 'AP Biology'
      code TEXT NOT NULL,          -- 'MATH101', 'BIO201'
      departmentId TEXT NOT NULL,
      creditHours REAL NOT NULL DEFAULT 1.0,
      FOREIGN KEY (departmentId) REFERENCES "Department"(id)
    );

    CREATE TABLE "Room" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- 'Room 101', 'Science Lab A'
      building TEXT DEFAULT 'Main',
      capacity INTEGER NOT NULL DEFAULT 30,
      type TEXT DEFAULT 'CLASSROOM'  -- CLASSROOM, LAB, AUDITORIUM, GYM
    );

    CREATE TABLE "Section" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,          -- '10-A', '11-B'
      gradeLevel INTEGER NOT NULL, -- 9, 10, 11, 12
      academicYearId TEXT NOT NULL, -- section belongs to a year, not just a term
      termId TEXT NOT NULL,
      roomId TEXT,
      maxCapacity INTEGER DEFAULT 35,
      FOREIGN KEY (academicYearId) REFERENCES "AcademicYear"(id),
      FOREIGN KEY (termId) REFERENCES "Term"(id),
      FOREIGN KEY (roomId) REFERENCES "Room"(id)
    );

    -- =============================================
    -- 3. PEOPLE
    -- =============================================

    CREATE TABLE "Student" (
      id TEXT PRIMARY KEY,
      admissionNo TEXT UNIQUE NOT NULL,  -- school-facing roll/admission number e.g. 'ADM-2025-0001'
      name TEXT NOT NULL,
      email TEXT,
      dateOfBirth TEXT,
      gender TEXT,                 -- 'M', 'F', 'Other'
      enrollmentDate TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, TRANSFERRED, GRADUATED, SUSPENDED
      gradeLevel INTEGER NOT NULL,
      sectionId TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sectionId) REFERENCES "Section"(id)
    );

    CREATE TABLE "Guardian" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,  -- 'Father', 'Mother', 'Guardian'
      phone TEXT NOT NULL,
      email TEXT,
      occupation TEXT
    );

    CREATE TABLE "StudentGuardian" (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      guardianId TEXT NOT NULL,
      isPrimary INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (studentId) REFERENCES "Student"(id),
      FOREIGN KEY (guardianId) REFERENCES "Guardian"(id)
    );

    -- =============================================
    -- 4. TEACHING ASSIGNMENTS
    -- =============================================

    CREATE TABLE "TeacherSubject" (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      termId TEXT NOT NULL,
      FOREIGN KEY (teacherId) REFERENCES "User"(id),
      FOREIGN KEY (subjectId) REFERENCES "Subject"(id),
      FOREIGN KEY (sectionId) REFERENCES "Section"(id),
      FOREIGN KEY (termId) REFERENCES "Term"(id)
    );

    CREATE TABLE "Schedule" (
      id TEXT PRIMARY KEY,
      teacherSubjectId TEXT NOT NULL,
      dayOfWeek INTEGER NOT NULL,  -- 1=Mon, 5=Fri
      period INTEGER NOT NULL,     -- 1-8
      startTime TEXT NOT NULL,     -- '08:00'
      endTime TEXT NOT NULL,       -- '08:45'
      roomId TEXT,
      FOREIGN KEY (teacherSubjectId) REFERENCES "TeacherSubject"(id),
      FOREIGN KEY (roomId) REFERENCES "Room"(id),
      UNIQUE (teacherSubjectId, dayOfWeek, period),  -- teacher can't teach same subject twice in same slot
      UNIQUE (roomId, dayOfWeek, period)             -- room can't host two classes at once
    );

    -- =============================================
    -- 5. GRADES & ASSESSMENTS
    -- =============================================

    CREATE TABLE "Assignment" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,          -- HOMEWORK, QUIZ, MIDTERM, FINAL, PROJECT, CLASSWORK
      subjectId TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      teacherId TEXT NOT NULL,
      termId TEXT NOT NULL,
      dueDate TEXT,
      maxScore REAL NOT NULL DEFAULT 100,
      weight REAL NOT NULL DEFAULT 1.0,  -- weight for final grade calc
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subjectId) REFERENCES "Subject"(id),
      FOREIGN KEY (sectionId) REFERENCES "Section"(id),
      FOREIGN KEY (teacherId) REFERENCES "User"(id),
      FOREIGN KEY (termId) REFERENCES "Term"(id)
    );

    CREATE TABLE "Grade" (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      assignmentId TEXT NOT NULL,
      score REAL,                  -- NULL = not graded yet
      feedback TEXT,
      submittedAt TEXT,
      gradedAt TEXT,
      FOREIGN KEY (studentId) REFERENCES "Student"(id),
      FOREIGN KEY (assignmentId) REFERENCES "Assignment"(id)
    );

    CREATE TABLE "GradeScale" (
      id TEXT PRIMARY KEY,
      letterGrade TEXT NOT NULL,   -- 'A+', 'A', 'B+', etc.
      minScore REAL NOT NULL,
      maxScore REAL NOT NULL,
      gpa REAL NOT NULL
    );

    -- =============================================
    -- 6. ATTENDANCE
    -- =============================================

    CREATE TABLE "Attendance" (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,        -- PRESENT, ABSENT, LATE, EXCUSED
      period INTEGER,              -- NULL = full day, 1-8 = per period
      notes TEXT,
      markedById TEXT,             -- teacher who marked it
      FOREIGN KEY (studentId) REFERENCES "Student"(id),
      FOREIGN KEY (sectionId) REFERENCES "Section"(id),
      FOREIGN KEY (markedById) REFERENCES "User"(id),
      UNIQUE (studentId, date, period)  -- prevent duplicate attendance for same student/day/period
    );

    -- =============================================
    -- 7. COMMUNICATION & EVENTS
    -- =============================================

    CREATE TABLE "Announcement" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      authorId TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'SCHOOL',  -- SCHOOL, GRADE, SECTION
      targetId TEXT,               -- sectionId or gradeLevel depending on scope
      priority TEXT DEFAULT 'NORMAL',  -- LOW, NORMAL, HIGH, URGENT
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT,
      FOREIGN KEY (authorId) REFERENCES "User"(id)
    );

    CREATE TABLE "Event" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,          -- EXAM, HOLIDAY, PTM, SPORTS, CULTURAL
      startDate TEXT NOT NULL,
      endDate TEXT,
      isAllDay INTEGER DEFAULT 1,
      createdBy TEXT NOT NULL,
      FOREIGN KEY (createdBy) REFERENCES "User"(id)
    );

    -- =============================================
    -- INDEXES for performance
    -- =============================================
    CREATE INDEX idx_student_section ON "Student"(sectionId);
    CREATE INDEX idx_student_grade_level ON "Student"(gradeLevel);
    CREATE INDEX idx_attendance_date ON "Attendance"(date);
    CREATE INDEX idx_attendance_student ON "Attendance"(studentId);
    CREATE INDEX idx_grade_student ON "Grade"(studentId);
    CREATE INDEX idx_grade_assignment ON "Grade"(assignmentId);
    CREATE INDEX idx_assignment_subject ON "Assignment"(subjectId);
    CREATE INDEX idx_teacher_subject ON "TeacherSubject"(teacherId);
  `)

    seedDatabase(db)
}

let idCounter = 0
function generateId(): string {
    idCounter++
    return `id_${Date.now()}_${idCounter}_${Math.random().toString(36).substring(2, 8)}`
}

function seedDatabase(db: Database.Database) {
    // Each staff member gets their own unique password, individually bcrypt-hashed.
    // Hashing happens BEFORE the transaction (hashSync is slow, can't run inside SQLite tx).
    // The auth flow uses bcrypt.compare(enteredPassword, storedHash) — never stores plain text.
    const staffData = [
        // Leadership
        { name: 'Dr. Jane Smith', role: 'PRINCIPAL', deptIdx: -1, email: 'principal@school.edu', password: 'Principal@2025!' },
        { name: 'Mr. Robert Clark', role: 'VICE_PRINCIPAL', deptIdx: -1, email: 'vp@school.edu', password: 'VPClark@2025#' },
        // Math Department
        { name: 'Mr. John Doe', role: 'TEACHER', deptIdx: 0, email: 'john.doe@school.edu', password: 'JohnMath@101' },
        { name: 'Ms. Sarah Wilson', role: 'TEACHER', deptIdx: 0, email: 'sarah.wilson@school.edu', password: 'SarahAlg@202' },
        // Science Department
        { name: 'Mr. Michael Chen', role: 'TEACHER', deptIdx: 1, email: 'michael.chen@school.edu', password: 'MikeSci@Bio1' },
        { name: 'Ms. Emily Davis', role: 'TEACHER', deptIdx: 1, email: 'emily.davis@school.edu', password: 'EmilyPhys@25' },
        // English Department
        { name: 'Mr. James Brown', role: 'TEACHER', deptIdx: 2, email: 'james.brown@school.edu', password: 'JamesEng@Lit' },
        { name: 'Ms. Lisa Patel', role: 'TEACHER', deptIdx: 2, email: 'lisa.patel@school.edu', password: 'LisaAP@Eng25' },
        // Social Studies
        { name: 'Mr. David Kim', role: 'TEACHER', deptIdx: 3, email: 'david.kim@school.edu', password: 'DavidHist@25' },
        { name: 'Ms. Rachel Green', role: 'TEACHER', deptIdx: 3, email: 'rachel.green@school.edu', password: 'RachelGov@25' },
        // Arts & PE
        { name: 'Mr. Carlos Rivera', role: 'TEACHER', deptIdx: 4, email: 'carlos.rivera@school.edu', password: 'CarlosPE@25!' },
        { name: 'Ms. Amanda Foster', role: 'TEACHER', deptIdx: 4, email: 'amanda.foster@school.edu', password: 'AmandaArt@25' },
        // Support staff
        { name: 'Ms. Karen White', role: 'COUNSELOR', deptIdx: -1, email: 'counselor@school.edu', password: 'KarenCoun@25' },
        { name: 'Mr. Tom Harris', role: 'ADMIN', deptIdx: -1, email: 'admin@school.edu', password: 'TomAdmin@25!' },
    ]

    // Hash every password individually before opening the transaction
    const staffWithHashes = staffData.map(s => ({ ...s, passwordHash: hashSync(s.password, 10) }))

    const seedAll = db.transaction(() => {
        // =============================================
        // ACADEMIC YEAR & TERMS
        // =============================================
        const yearId = generateId()
        db.prepare('INSERT INTO "AcademicYear" VALUES (?,?,?,?,?)').run(
            yearId, '2025-2026', '2025-08-15', '2026-06-15', 1
        )

        const term1Id = generateId()
        const term2Id = generateId()
        db.prepare('INSERT INTO "Term" VALUES (?,?,?,?,?,?)').run(
            term1Id, 'Semester 1', yearId, '2025-08-15', '2025-12-20', 0
        )
        db.prepare('INSERT INTO "Term" VALUES (?,?,?,?,?,?)').run(
            term2Id, 'Semester 2', yearId, '2026-01-06', '2026-06-15', 1
        )

        // =============================================
        // DEPARTMENTS
        // =============================================
        const departments = [
            { id: generateId(), name: 'Mathematics' },
            { id: generateId(), name: 'Science' },
            { id: generateId(), name: 'English & Literature' },
            { id: generateId(), name: 'Social Studies' },
            { id: generateId(), name: 'Arts & Physical Education' },
        ]
        for (const d of departments) {
            db.prepare('INSERT INTO "Department" (id, name) VALUES (?,?)').run(d.id, d.name)
        }

        // =============================================
        // GRADE SCALE
        // =============================================
        const gradeScales = [
            { letter: 'A+', min: 97, max: 100, gpa: 4.0 },
            { letter: 'A', min: 93, max: 96.99, gpa: 4.0 },
            { letter: 'A-', min: 90, max: 92.99, gpa: 3.7 },
            { letter: 'B+', min: 87, max: 89.99, gpa: 3.3 },
            { letter: 'B', min: 83, max: 86.99, gpa: 3.0 },
            { letter: 'B-', min: 80, max: 82.99, gpa: 2.7 },
            { letter: 'C+', min: 77, max: 79.99, gpa: 2.3 },
            { letter: 'C', min: 73, max: 76.99, gpa: 2.0 },
            { letter: 'C-', min: 70, max: 72.99, gpa: 1.7 },
            { letter: 'D', min: 60, max: 69.99, gpa: 1.0 },
            { letter: 'F', min: 0, max: 59.99, gpa: 0.0 },
        ]
        for (const g of gradeScales) {
            db.prepare('INSERT INTO "GradeScale" VALUES (?,?,?,?,?)').run(
                generateId(), g.letter, g.min, g.max, g.gpa
            )
        }

        // =============================================
        // ROOMS
        // =============================================
        const rooms: { id: string; name: string; type: string }[] = []
        const roomTypes = [
            { name: 'Room 101', type: 'CLASSROOM' }, { name: 'Room 102', type: 'CLASSROOM' },
            { name: 'Room 103', type: 'CLASSROOM' }, { name: 'Room 104', type: 'CLASSROOM' },
            { name: 'Room 201', type: 'CLASSROOM' }, { name: 'Room 202', type: 'CLASSROOM' },
            { name: 'Room 203', type: 'CLASSROOM' }, { name: 'Room 204', type: 'CLASSROOM' },
            { name: 'Science Lab A', type: 'LAB' }, { name: 'Science Lab B', type: 'LAB' },
            { name: 'Computer Lab', type: 'LAB' }, { name: 'Art Studio', type: 'CLASSROOM' },
            { name: 'Gymnasium', type: 'GYM' }, { name: 'Auditorium', type: 'AUDITORIUM' },
        ]
        for (const r of roomTypes) {
            const id = generateId()
            rooms.push({ id, ...r })
            db.prepare('INSERT INTO "Room" VALUES (?,?,?,?,?)').run(id, r.name, 'Main', 30, r.type)
        }

        // =============================================
        // STAFF (Users) — each with their own bcrypt hash
        // =============================================
        const staff: { id: string; name: string; role: string; deptIdx: number; email: string }[] = []

        for (const s of staffWithHashes) {
            const id = generateId()
            staff.push({ id, ...s })
            db.prepare('INSERT INTO "User" (id, email, password, name, role, departmentId, phone, hireDate) VALUES (?,?,?,?,?,?,?,?)').run(
                id, s.email, s.passwordHash, s.name, s.role,
                s.deptIdx >= 0 ? departments[s.deptIdx].id : null,
                `555-${String(Math.floor(1000 + Math.random() * 9000))}`,
                `${2018 + Math.floor(Math.random() * 7)}-0${1 + Math.floor(Math.random() * 8)}-15`
            )
        }

        // Set department heads
        db.prepare('UPDATE "Department" SET headTeacherId = ? WHERE id = ?').run(staff[2].id, departments[0].id)
        db.prepare('UPDATE "Department" SET headTeacherId = ? WHERE id = ?').run(staff[4].id, departments[1].id)
        db.prepare('UPDATE "Department" SET headTeacherId = ? WHERE id = ?').run(staff[6].id, departments[2].id)
        db.prepare('UPDATE "Department" SET headTeacherId = ? WHERE id = ?').run(staff[8].id, departments[3].id)
        db.prepare('UPDATE "Department" SET headTeacherId = ? WHERE id = ?').run(staff[10].id, departments[4].id)

        // =============================================
        // SUBJECTS
        // =============================================
        const subjects = [
            // Math
            { id: generateId(), name: 'Algebra I', code: 'MATH101', deptIdx: 0, credits: 1.0 },
            { id: generateId(), name: 'Geometry', code: 'MATH102', deptIdx: 0, credits: 1.0 },
            { id: generateId(), name: 'Algebra II', code: 'MATH201', deptIdx: 0, credits: 1.0 },
            { id: generateId(), name: 'Pre-Calculus', code: 'MATH301', deptIdx: 0, credits: 1.0 },
            // Science
            { id: generateId(), name: 'Biology', code: 'SCI101', deptIdx: 1, credits: 1.0 },
            { id: generateId(), name: 'Chemistry', code: 'SCI201', deptIdx: 1, credits: 1.0 },
            { id: generateId(), name: 'Physics', code: 'SCI301', deptIdx: 1, credits: 1.0 },
            // English
            { id: generateId(), name: 'English 9', code: 'ENG101', deptIdx: 2, credits: 1.0 },
            { id: generateId(), name: 'English 10', code: 'ENG102', deptIdx: 2, credits: 1.0 },
            { id: generateId(), name: 'American Literature', code: 'ENG201', deptIdx: 2, credits: 1.0 },
            { id: generateId(), name: 'AP English', code: 'ENG301', deptIdx: 2, credits: 1.5 },
            // Social Studies
            { id: generateId(), name: 'World History', code: 'SS101', deptIdx: 3, credits: 1.0 },
            { id: generateId(), name: 'US History', code: 'SS201', deptIdx: 3, credits: 1.0 },
            { id: generateId(), name: 'Government', code: 'SS301', deptIdx: 3, credits: 0.5 },
            // Arts & PE
            { id: generateId(), name: 'Art', code: 'ART101', deptIdx: 4, credits: 0.5 },
            { id: generateId(), name: 'Physical Education', code: 'PE101', deptIdx: 4, credits: 0.5 },
            { id: generateId(), name: 'Music', code: 'MUS101', deptIdx: 4, credits: 0.5 },
        ]
        for (const s of subjects) {
            db.prepare('INSERT INTO "Subject" VALUES (?,?,?,?,?)').run(
                s.id, s.name, s.code, departments[s.deptIdx].id, s.credits
            )
        }

        // =============================================
        // SECTIONS (8 sections: 2 per grade level)
        // =============================================
        const sections: { id: string; name: string; gradeLevel: number }[] = []
        const sectionDefs = [
            { name: '9-A', gradeLevel: 9 }, { name: '9-B', gradeLevel: 9 },
            { name: '10-A', gradeLevel: 10 }, { name: '10-B', gradeLevel: 10 },
            { name: '11-A', gradeLevel: 11 }, { name: '11-B', gradeLevel: 11 },
            { name: '12-A', gradeLevel: 12 }, { name: '12-B', gradeLevel: 12 },
        ]
        for (let i = 0; i < sectionDefs.length; i++) {
            const s = sectionDefs[i]
            const id = generateId()
            sections.push({ id, ...s })
            db.prepare('INSERT INTO "Section" (id, name, gradeLevel, academicYearId, termId, roomId, maxCapacity) VALUES (?,?,?,?,?,?,?)').run(
                id, s.name, s.gradeLevel, yearId, term2Id, rooms[i].id, 35
            )
        }

        // =============================================
        // STUDENTS (40 students — 5 per section)
        // =============================================
        const studentNames = [
            // 9-A
            'Emma Thompson', 'Liam Garcia', 'Sophia Nguyen', 'Noah Williams', 'Olivia Brown',
            // 9-B
            'Ethan Davis', 'Ava Martinez', 'Mason Lee', 'Isabella Kim', 'Logan White',
            // 10-A
            'Alice Johnson', 'Bob Smith', 'Charlotte Wilson', 'Lucas Anderson', 'Mia Robinson',
            // 10-B
            'Benjamin Clark', 'Harper Young', 'Jack Taylor', 'Amelia Scott', 'Daniel Torres',
            // 11-A
            'Charlie Brown', 'Grace Kim', 'Alexander Wright', 'Ella Adams', 'Sebastian Hall',
            // 11-B
            'Zoe Hernandez', 'Owen Baker', 'Lily Evans', 'Caleb Mitchell', 'Nora Campbell',
            // 12-A
            'Diana Prince', 'William Harris', 'James Mitchell', 'Henry Wilson', 'Sofia Turner',
            // 12-B
            'Ivy Chen', 'Aria Phillips', 'Leo Rodriguez', 'Scarlett Morgan', 'Ryan Cooper',
        ]

        const genders = ['M', 'F', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M']
        const students: { id: string; name: string; sectionIdx: number; gradeLevel: number }[] = []

        for (let i = 0; i < studentNames.length; i++) {
            const sectionIdx = Math.floor(i / 5)
            const section = sections[sectionIdx]
            const id = generateId()
            const gender = genders[i % genders.length]
            const birthYear = 2010 - section.gradeLevel + 9
            // admissionNo format: ADM-YYYY-NNNN (school-facing roll number)
            const admissionNo = `ADM-2025-${String(i + 1).padStart(4, '0')}`
            students.push({ id, name: studentNames[i], sectionIdx, gradeLevel: section.gradeLevel })

            db.prepare('INSERT INTO "Student" (id, admissionNo, name, email, dateOfBirth, gender, enrollmentDate, status, gradeLevel, sectionId) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
                id, admissionNo, studentNames[i],
                `${studentNames[i].toLowerCase().replace(' ', '.')}@student.school.edu`,
                `${birthYear}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
                gender, '2025-08-15', 'ACTIVE', section.gradeLevel, section.id
            )
        }

        // =============================================
        // GUARDIANS
        // =============================================
        const guardianInsert = db.prepare('INSERT INTO "Guardian" VALUES (?,?,?,?,?,?)')
        const sgInsert = db.prepare('INSERT INTO "StudentGuardian" VALUES (?,?,?,?)')

        for (const s of students) {
            const lastName = s.name.split(' ')[1]
            const fatherId = generateId()
            const motherId = generateId()
            guardianInsert.run(fatherId, `Mr. ${lastName}`, 'Father', `555-${String(Math.floor(1000 + Math.random() * 9000))}`, `father.${lastName.toLowerCase()}@email.com`, 'Professional')
            guardianInsert.run(motherId, `Mrs. ${lastName}`, 'Mother', `555-${String(Math.floor(1000 + Math.random() * 9000))}`, `mother.${lastName.toLowerCase()}@email.com`, 'Professional')
            sgInsert.run(generateId(), s.id, fatherId, 1)
            sgInsert.run(generateId(), s.id, motherId, 0)
        }

        // =============================================
        // TEACHER-SUBJECT ASSIGNMENTS
        // =============================================
        // Map: teacher index in staff -> subject indices they teach, and which sections
        const teacherAssignments = [
            // Math teachers (staff[2], staff[3])
            { teacherIdx: 2, subjectIdx: 0, sectionIdxs: [0, 1] },       // Algebra I -> 9A,9B
            { teacherIdx: 2, subjectIdx: 1, sectionIdxs: [2, 3] },       // Geometry -> 10A,10B
            { teacherIdx: 3, subjectIdx: 2, sectionIdxs: [4, 5] },       // Algebra II -> 11A,11B
            { teacherIdx: 3, subjectIdx: 3, sectionIdxs: [6, 7] },       // Pre-Calc -> 12A,12B
            // Science teachers (staff[4], staff[5])
            { teacherIdx: 4, subjectIdx: 4, sectionIdxs: [0, 1] },       // Biology -> 9A,9B
            { teacherIdx: 4, subjectIdx: 5, sectionIdxs: [2, 3] },       // Chemistry -> 10A,10B
            { teacherIdx: 5, subjectIdx: 6, sectionIdxs: [4, 5, 6, 7] }, // Physics -> 11,12
            // English teachers (staff[6], staff[7])
            { teacherIdx: 6, subjectIdx: 7, sectionIdxs: [0, 1] },       // English 9
            { teacherIdx: 6, subjectIdx: 8, sectionIdxs: [2, 3] },       // English 10
            { teacherIdx: 7, subjectIdx: 9, sectionIdxs: [4, 5] },       // American Lit -> 11
            { teacherIdx: 7, subjectIdx: 10, sectionIdxs: [6, 7] },      // AP English -> 12
            // Social Studies (staff[8], staff[9])
            { teacherIdx: 8, subjectIdx: 11, sectionIdxs: [0, 1, 2, 3] },  // World History -> 9,10
            { teacherIdx: 9, subjectIdx: 12, sectionIdxs: [4, 5] },        // US History -> 11
            { teacherIdx: 9, subjectIdx: 13, sectionIdxs: [6, 7] },        // Government -> 12
            // Arts & PE (staff[10], staff[11])
            { teacherIdx: 10, subjectIdx: 15, sectionIdxs: [0, 1, 2, 3, 4, 5, 6, 7] }, // PE -> all
            { teacherIdx: 11, subjectIdx: 14, sectionIdxs: [0, 1, 2, 3] },              // Art -> 9,10
            { teacherIdx: 11, subjectIdx: 16, sectionIdxs: [4, 5, 6, 7] },              // Music -> 11,12
        ]

        const tsInsert = db.prepare('INSERT INTO "TeacherSubject" VALUES (?,?,?,?,?)')
        const teacherSubjects: { id: string; teacherIdx: number; subjectIdx: number; sectionIdx: number }[] = []

        for (const ta of teacherAssignments) {
            for (const secIdx of ta.sectionIdxs) {
                const tsId = generateId()
                teacherSubjects.push({ id: tsId, teacherIdx: ta.teacherIdx, subjectIdx: ta.subjectIdx, sectionIdx: secIdx })
                tsInsert.run(tsId, staff[ta.teacherIdx].id, subjects[ta.subjectIdx].id, sections[secIdx].id, term2Id)
            }
        }

        // =============================================
        // ASSIGNMENTS & GRADES
        // =============================================
        const assignmentInsert = db.prepare('INSERT INTO "Assignment" (id, title, type, subjectId, sectionId, teacherId, termId, dueDate, maxScore, weight) VALUES (?,?,?,?,?,?,?,?,?,?)')
        const gradeInsert = db.prepare('INSERT INTO "Grade" (id, studentId, assignmentId, score, gradedAt) VALUES (?,?,?,?,?)')

        const assignmentTypes = [
            { type: 'HOMEWORK', prefix: 'HW', weight: 0.2, count: 3 },
            { type: 'QUIZ', prefix: 'Quiz', weight: 0.15, count: 2 },
            { type: 'MIDTERM', prefix: 'Midterm', weight: 0.25, count: 1 },
            { type: 'PROJECT', prefix: 'Project', weight: 0.2, count: 1 },
            { type: 'FINAL', prefix: 'Final Exam', weight: 0.2, count: 1 },
        ]

        for (const ts of teacherSubjects) {
            const sectionStudents = students.filter(s => s.sectionIdx === ts.sectionIdx)

            for (const at of assignmentTypes) {
                for (let n = 1; n <= at.count; n++) {
                    const assignId = generateId()
                    const title = at.count > 1 ? `${at.prefix} ${n}` : at.prefix
                    const dueDate = `2026-0${1 + Math.floor(Math.random() * 2)}-${String(5 + Math.floor(Math.random() * 20)).padStart(2, '0')}`

                    assignmentInsert.run(
                        assignId, title, at.type, subjects[ts.subjectIdx].id, sections[ts.sectionIdx].id,
                        staff[ts.teacherIdx].id, term2Id, dueDate, 100, at.weight / at.count
                    )

                    // Grade each student
                    for (const student of sectionStudents) {
                        // Create varied but realistic score patterns
                        const baseAbility = (student.name.charCodeAt(0) % 30) + 55 // 55-85 based on name
                        const subjectAffinity = (student.name.charCodeAt(1) + ts.subjectIdx * 7) % 15 // 0-14
                        const typeBonus = at.type === 'HOMEWORK' ? 8 : at.type === 'QUIZ' ? 3 : 0
                        const randomness = (Math.random() - 0.5) * 16
                        const score = Math.round(Math.min(100, Math.max(25, baseAbility + subjectAffinity + typeBonus + randomness)) * 10) / 10

                        gradeInsert.run(
                            generateId(), student.id, assignId, score,
                            `2026-0${1 + Math.floor(Math.random() * 2)}-${String(8 + Math.floor(Math.random() * 15)).padStart(2, '0')}`
                        )
                    }
                }
            }
        }

        // =============================================
        // ATTENDANCE (last 15 school days)
        // =============================================
        const attendanceInsert = db.prepare('INSERT INTO "Attendance" (id, studentId, sectionId, date, status, markedById) VALUES (?,?,?,?,?,?)')

        for (let dayOffset = 0; dayOffset < 20; dayOffset++) {
            const date = new Date()
            date.setDate(date.getDate() - dayOffset)
            if (date.getDay() === 0 || date.getDay() === 6) continue // Skip weekends

            const dateStr = date.toISOString().split('T')[0]

            for (const student of students) {
                const section = sections[student.sectionIdx]
                // Find a teacher for this section
                const ts = teacherSubjects.find(t => t.sectionIdx === student.sectionIdx)
                const teacherId = ts ? staff[ts.teacherIdx].id : staff[2].id

                const rand = Math.random()
                const status = rand > 0.10 ? 'PRESENT' : rand > 0.05 ? 'ABSENT' : rand > 0.02 ? 'LATE' : 'EXCUSED'

                attendanceInsert.run(generateId(), student.id, section.id, dateStr, status, teacherId)
            }
        }

        // =============================================
        // SCHEDULE (periods for each teacher-subject)
        // =============================================
        const periods = [
            { period: 1, start: '08:00', end: '08:45' },
            { period: 2, start: '08:50', end: '09:35' },
            { period: 3, start: '09:40', end: '10:25' },
            { period: 4, start: '10:35', end: '11:20' },
            { period: 5, start: '11:25', end: '12:10' },
            { period: 6, start: '13:00', end: '13:45' },
            { period: 7, start: '13:50', end: '14:35' },
            { period: 8, start: '14:40', end: '15:25' },
        ]

        const schedInsert = db.prepare(
            'INSERT OR IGNORE INTO "Schedule" (id, teacherSubjectId, dayOfWeek, period, startTime, endTime, roomId) VALUES (?,?,?,?,?,?,?)'
        )

        // Assign periods to teacher-subject combos across weekdays.
        // Room rotates by periodCounter so that no two slots share the same (room, day, period),
        // satisfying the UNIQUE (roomId, dayOfWeek, period) constraint.
        let periodCounter = 0
        for (const ts of teacherSubjects) {
            // Each teacher-subject gets 3 periods per week
            for (let p = 0; p < 3; p++) {
                const day = (periodCounter % 5) + 1  // 1-5 (Mon-Fri)
                const periodSlot = periods[periodCounter % 8]
                const roomIdx = periodCounter % rooms.length  // rotate room per slot, not per teacher
                schedInsert.run(
                    generateId(), ts.id, day, periodSlot.period,
                    periodSlot.start, periodSlot.end, rooms[roomIdx].id
                )
                periodCounter++
            }
        }

        // =============================================
        // ANNOUNCEMENTS (with expiry dates)
        // =============================================
        const today = new Date()
        const announcements = [
            { title: '📢 Semester 2 Begins', content: 'Welcome back! Semester 2 classes have officially started. Please ensure all students have their updated schedules.', scope: 'SCHOOL', priority: 'HIGH', daysUntilExpiry: 7 },
            { title: '🔬 Science Fair Registration Open', content: 'Register for the annual science fair by Feb 28. Projects must be submitted by March 10.', scope: 'SCHOOL', priority: 'NORMAL', daysUntilExpiry: 14 },
            { title: '👥 Parent-Teacher Conference', content: 'PTM scheduled for March 15. All teachers must prepare student progress reports by March 12.', scope: 'SCHOOL', priority: 'HIGH', daysUntilExpiry: 21 },
            { title: '🎓 Grade 12 College Applications', content: 'College application workshop this Friday in the Auditorium. Attendance mandatory for all Grade 12 homeroom teachers.', scope: 'GRADE', priority: 'URGENT', daysUntilExpiry: 3 },
            { title: '🏆 Math Team Tryouts', content: 'Tryouts for the math competition team next Monday after school. Interested students should sign up with Mr. John Doe.', scope: 'SCHOOL', priority: 'NORMAL', daysUntilExpiry: 5 },
            { title: '📋 Midterm Grades Due', content: 'All midterm grades must be entered into the system by end of day Friday. Please ensure all assignments are graded.', scope: 'SCHOOL', priority: 'URGENT', daysUntilExpiry: 2 },
        ]

        for (const a of announcements) {
            const expires = new Date(today)
            expires.setDate(expires.getDate() + a.daysUntilExpiry)
            db.prepare('INSERT INTO "Announcement" (id, title, content, authorId, scope, priority, expiresAt) VALUES (?,?,?,?,?,?,?)').run(
                generateId(), a.title, a.content, staff[0].id, a.scope, a.priority, expires.toISOString().split('T')[0]
            )
        }

        // =============================================
        // EVENTS (school-wide + staff meetings)
        // =============================================
        const events = [
            { title: 'Midterm Examinations', type: 'EXAM', start: '2026-02-17', end: '2026-02-21', by: 0 },
            { title: 'Staff Meeting - Curriculum Review', type: 'PTM', start: '2026-02-26', end: '2026-02-26', by: 0 },
            { title: 'Math Department Meeting', type: 'PTM', start: '2026-02-27', end: '2026-02-27', by: 2 },
            { title: 'Science Department Meeting', type: 'PTM', start: '2026-02-28', end: '2026-02-28', by: 4 },
            { title: 'Parent-Teacher Meeting', type: 'PTM', start: '2026-03-15', end: '2026-03-15', by: 0 },
            { title: 'Spring Break', type: 'HOLIDAY', start: '2026-03-23', end: '2026-03-31', by: 0 },
            { title: 'Annual Sports Day', type: 'SPORTS', start: '2026-04-10', end: '2026-04-10', by: 0 },
            { title: 'Cultural Festival', type: 'CULTURAL', start: '2026-05-01', end: '2026-05-02', by: 0 },
            { title: 'Final Examinations', type: 'EXAM', start: '2026-05-25', end: '2026-06-05', by: 0 },
            { title: 'Graduation Ceremony', type: 'CULTURAL', start: '2026-06-12', end: '2026-06-12', by: 0 },
        ]

        for (const e of events) {
            db.prepare('INSERT INTO "Event" (id, title, type, startDate, endDate, createdBy) VALUES (?,?,?,?,?,?)').run(
                generateId(), e.title, e.type, e.start, e.end, staff[e.by].id
            )
        }
    })

    seedAll()

    console.log('\n✅ ScholarAI database seeded — 14 staff, 40 students, 17 subjects, 8 sections')
    console.log('\n🔐 Staff login credentials (plain text shown once at seed time only):')
    console.log('   ─────────────────────────────────────────────────────────────────')
    for (const s of staffWithHashes) {
        const roleLabel = s.role.padEnd(14)
        console.log(`   [${roleLabel}] ${s.email.padEnd(32)} → ${s.password}`)
    }
    console.log('   ─────────────────────────────────────────────────────────────────')
    console.log('   All passwords are bcrypt-hashed in the database. Only the hash is stored.\n')
}

// =============================================
// QUERY EXECUTOR
// =============================================
export function executeQuery(sql: string): { columns: string[]; rows: any[]; error?: string } {
    try {
        const database = getDb()

        const trimmed = sql.trim().toUpperCase()
        if (!trimmed.startsWith('SELECT')) {
            return { columns: [], rows: [], error: 'Only SELECT queries are allowed for safety.' }
        }

        let cleanSql = sql
            .replace(/```sql\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim()

        // SQLite compatibility
        cleanSql = cleanSql
            .replace(/::[\w]+/g, '')
            .replace(/ILIKE/gi, 'LIKE')
            .replace(/NOW\(\)/gi, "datetime('now')")
            .replace(/CURRENT_DATE/gi, "date('now')")

        const stmt = database.prepare(cleanSql)
        const rows = stmt.all()
        const columns = rows.length > 0 ? Object.keys(rows[0] as object) : []

        return { columns, rows }
    } catch (error: any) {
        return { columns: [], rows: [], error: error.message }
    }
}
