-- ============================================================================
-- Smart Campus Resource Optimizer: Timetable Maker Schema Migration
-- Database: PostgreSQL 15+ (Supabase)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    hod_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TEACHERS (FACULTY)
CREATE TABLE IF NOT EXISTS teachers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id VARCHAR(50) NOT NULL UNIQUE,
    user_id UUID,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE,
    designation VARCHAR(50) DEFAULT 'Assistant Professor',
    max_weekly_hours NUMERIC(4,1) DEFAULT 20.0,
    max_daily_hours NUMERIC(3,1) DEFAULT 4.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TEACHER AVAILABILITY RESTRICTIONS
CREATE TABLE IF NOT EXISTS teacher_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    availability_type VARCHAR(20) DEFAULT 'unavailable' CHECK (availability_type IN ('available', 'unavailable', 'preferred')),
    reason VARCHAR(255),
    CONSTRAINT chk_teacher_time_order CHECK (start_time < end_time)
);

-- 4. ROOMS & LABORATORIES
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    building VARCHAR(100) NOT NULL,
    floor INT DEFAULT 1,
    room_type VARCHAR(50) NOT NULL CHECK (
        room_type IN ('classroom', 'lab', 'seminar_hall', 'workshop', 'auditorium', 'equipment_pool')
    ),
    lab_specialization VARCHAR(100),
    capacity INT NOT NULL CHECK (capacity > 0),
    exclusive_use BOOLEAN DEFAULT TRUE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROOM AVAILABILITY RESTRICTIONS
CREATE TABLE IF NOT EXISTS room_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT FALSE,
    reason VARCHAR(255) DEFAULT 'Maintenance / Department Reserved',
    CONSTRAINT chk_room_time_order CHECK (start_time < end_time)
);

-- 6. COURSES (With L-T-P & Configurable Session Durations)
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_code VARCHAR(50) NOT NULL UNIQUE,
    course_name VARCHAR(150) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    semester INT NOT NULL CHECK (semester BETWEEN 1 AND 8),
    academic_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    credits NUMERIC(3,1) NOT NULL DEFAULT 4.0,
    
    lecture_count INT NOT NULL DEFAULT 3,
    tutorial_count INT NOT NULL DEFAULT 0,
    practical_count INT NOT NULL DEFAULT 0,
    
    lecture_duration NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    tutorial_duration NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    practical_duration NUMERIC(3,2) NOT NULL DEFAULT 2.00,
    
    total_weekly_hours NUMERIC(4,2) GENERATED ALWAYS AS (
        (lecture_count * lecture_duration) + 
        (tutorial_count * tutorial_duration) + 
        (practical_count * practical_duration)
    ) STORED,

    required_room_type VARCHAR(50) DEFAULT 'classroom',
    required_lab_specialization VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BATCHES & SECTIONS
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id VARCHAR(50) NOT NULL UNIQUE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    semester INT NOT NULL,
    section_name VARCHAR(10) NOT NULL,
    strength INT NOT NULL CHECK (strength > 0),
    academic_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. STUDENT GROUPS (For Lab Splitting)
CREATE TABLE IF NOT EXISTS student_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    group_name VARCHAR(20) NOT NULL,
    strength INT NOT NULL CHECK (strength > 0),
    CONSTRAINT unq_batch_group UNIQUE (batch_id, group_name)
);

-- 9. COURSE-FACULTY-BATCH ASSIGNMENTS
CREATE TABLE IF NOT EXISTS course_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    group_id UUID REFERENCES student_groups(id) ON DELETE SET NULL,
    role_type VARCHAR(20) DEFAULT 'primary' CHECK (role_type IN ('primary', 'assistant', 'lab_tutor')),
    CONSTRAINT unq_assignment UNIQUE (course_id, teacher_id, batch_id, group_id)
);

-- 10. TIMETABLE CONFIGURATION TEMPLATES
CREATE TABLE IF NOT EXISTS timetable_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    working_days JSONB NOT NULL DEFAULT '["Mon", "Tue", "Wed", "Thu", "Fri"]'::jsonb,
    day_start_time TIME NOT NULL DEFAULT '08:00:00',
    day_end_time TIME NOT NULL DEFAULT '17:00:00',
    period_duration_minutes INT NOT NULL DEFAULT 60,
    break_slots JSONB NOT NULL DEFAULT '[
        {"name": "Short Break", "start": "11:00:00", "end": "11:15:00"},
        {"name": "Lunch Break", "start": "13:15:00", "end": "14:00:00"}
    ]'::jsonb,
    max_faculty_daily_hours INT DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TIMETABLE VERSIONS
CREATE TABLE IF NOT EXISTS timetable_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL REFERENCES timetable_configs(id),
    department_id UUID NOT NULL REFERENCES departments(id),
    academic_year VARCHAR(20) NOT NULL,
    semester_type VARCHAR(10) NOT NULL CHECK (semester_type IN ('odd', 'even', 'summer')),
    version_number INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'analyzed', 'approved', 'published', 'archived')
    ),
    is_active BOOLEAN DEFAULT FALSE,
    solver_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TIMETABLE SESSIONS
CREATE TABLE IF NOT EXISTS timetable_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    group_id UUID REFERENCES student_groups(id) ON DELETE SET NULL,
    
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('theory', 'tutorial', 'lab')),
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours NUMERIC(3,2) NOT NULL,
    
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_session_times CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_sessions_version ON timetable_sessions(version_id);
CREATE INDEX IF NOT EXISTS idx_sessions_batch ON timetable_sessions(batch_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON timetable_sessions(teacher_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_room ON timetable_sessions(room_id, day_of_week, start_time);
