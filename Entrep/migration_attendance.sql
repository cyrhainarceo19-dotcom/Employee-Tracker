-- =============================================================================
-- Employee Tracker — Attendance/Migration
-- Schema Version: 1.2.0 (fully idempotent)
-- =============================================================================
-- This file can be re-run safely. Every statement is idempotent:
--   CREATE TABLE IF NOT EXISTS
--   CREATE INDEX IF NOT EXISTS
--   DROP IF EXISTS + CREATE (triggers, policies)
-- =============================================================================

-- =============================================================================
-- PHASE 1: TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    time_in         TIMESTAMPTZ,
    time_out        TIMESTAMPTZ,
    hours_rendered  NUMERIC(4,1),
    status          TEXT NOT NULL DEFAULT 'present'
                        CONSTRAINT valid_attendance_status
                        CHECK (status IN ('present', 'late', 'half-day', 'absent')),
    notes           TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- =============================================================================
-- PHASE 2: INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_attendance_user_id
    ON public.attendance (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date
    ON public.attendance (date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_user_date
    ON public.attendance (user_id, date DESC) WHERE deleted_at IS NULL;

-- =============================================================================
-- PHASE 3: TRIGGERS (reuses existing set_audit_fields function)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_attendance_audit ON public.attendance;
CREATE TRIGGER trg_attendance_audit
    BEFORE UPDATE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.set_audit_fields();

-- =============================================================================
-- PHASE 4: ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_attendance"       ON public.attendance;
DROP POLICY IF EXISTS "admins_read_all_attendance"       ON public.attendance;
DROP POLICY IF EXISTS "users_insert_own_attendance"      ON public.attendance;
DROP POLICY IF EXISTS "users_update_own_attendance"      ON public.attendance;
DROP POLICY IF EXISTS "admins_update_any_attendance"     ON public.attendance;
DROP POLICY IF EXISTS "admins_delete_any_attendance"     ON public.attendance;

CREATE POLICY "users_read_own_attendance"
    ON public.attendance FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "admins_read_all_attendance"
    ON public.attendance FOR SELECT
    USING (public.is_admin());

CREATE POLICY "users_insert_own_attendance"
    ON public.attendance FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_attendance"
    ON public.attendance FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_update_any_attendance"
    ON public.attendance FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_any_attendance"
    ON public.attendance FOR DELETE
    USING (public.is_admin());

-- =============================================================================
-- PHASE 5: UNIQUE CONSTRAINT — one active record per user per day
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_user_date_active
    ON public.attendance (user_id, date)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- PHASE 6: BREAK TIME SUPPORT
-- =============================================================================

ALTER TABLE public.attendance
    ADD COLUMN IF NOT EXISTS break_start     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS break_end       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS break_duration  NUMERIC(5,1) DEFAULT 0;

ALTER TABLE public.attendance
    DROP CONSTRAINT IF EXISTS valid_attendance_status;

ALTER TABLE public.attendance
    ADD CONSTRAINT valid_attendance_status
    CHECK (status IN ('present','late','half-day','absent','on_break','timed_out'));

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- =============================================================================
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.attendance'::regclass AND NOT tgisinternal;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'attendance';
-- =============================================================================
