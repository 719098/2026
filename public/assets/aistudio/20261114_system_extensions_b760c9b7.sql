BEGIN;

-- ============================================================================
-- 靜宜大學華語文中心管理系統 - 功能擴充資料庫遷移腳本（最終嚴格安全版）
-- 注意：向後相容設計，不刪除、不清空、不覆寫任何既有資料表或歷史資料。
-- ============================================================================

-- 1. public.students 新增選填註冊起訖日期欄位（供個人檔案與在學證明書使用）
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS registration_start_date DATE,
  ADD COLUMN IF NOT EXISTS registration_end_date DATE;

-- 2. 建立逾七天補點名／修改點名申請表 (public.attendance_makeup_requests)
CREATE TABLE IF NOT EXISTS public.attendance_makeup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id UUID REFERENCES public.class_sessions(id) ON DELETE SET NULL,
  course_session_id UUID REFERENCES public.course_sessions(id) ON DELETE SET NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  requester_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('MAKEUP', 'EDIT')),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 防止同一堂課同時存在多筆待審核或尚未使用的已核准申請
DROP INDEX IF EXISTS public.uq_makeup_pending_session;
CREATE UNIQUE INDEX IF NOT EXISTS uq_makeup_active_session
  ON public.attendance_makeup_requests (class_id, session_date)
  WHERE status IN ('PENDING', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_makeup_requests_status
  ON public.attendance_makeup_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_makeup_requests_class_date
  ON public.attendance_makeup_requests (class_id, session_date);

-- 2.1 受信任的後端驗證 Trigger：申請與審核階段強制檢查台灣時區 (> 7 天)、學期鎖定與實際排課存在性
CREATE OR REPLACE FUNCTION public.validate_attendance_makeup_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_taiwan_today DATE := (now() AT TIME ZONE 'Asia/Taipei')::DATE;
  v_is_term_locked BOOLEAN := false;
  v_has_blocked_session BOOLEAN := false;
  v_has_active_session BOOLEAN := false;
  v_has_valid_schedule BOOLEAN := false;
BEGIN
  IF NEW.session_date IS NULL THEN
    RAISE EXCEPTION '缺少目標上課日期 (session_date)';
  END IF;

  IF NEW.session_date >= v_taiwan_today OR (v_taiwan_today - NEW.session_date) <= 7 THEN
    RAISE EXCEPTION '僅允許對超過 7 天的歷史課堂申請補點名或修改（目標日期：%，台灣時間今日：%），7 天內堂次請依原本點名權限操作',
      NEW.session_date, v_taiwan_today;
  END IF;

  SELECT COALESCE(tm.is_locked, false)
  INTO v_is_term_locked
  FROM public.classes c
  LEFT JOIN public.terms tm ON c.term_id = tm.id
  WHERE c.id = NEW.class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到目標班級資料，無法建立補點名申請';
  END IF;

  IF v_is_term_locked THEN
    RAISE EXCEPTION '此學期已封存鎖定，禁止申請補點名或修改點名';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.class_sessions cs_blk
      WHERE cs_blk.class_id = NEW.class_id
        AND cs_blk.session_date = NEW.session_date
        AND UPPER(COALESCE(cs_blk.status, 'NORMAL')) IN ('CANCELLED', 'SUSPENDED', 'RESCHEDULED', 'HOLIDAY')
    ),
    EXISTS (
      SELECT 1 FROM public.class_sessions cs_ok
      WHERE cs_ok.class_id = NEW.class_id
        AND cs_ok.session_date = NEW.session_date
        AND UPPER(COALESCE(cs_ok.status, 'NORMAL')) IN ('NORMAL', 'MAKEUP')
    )
  INTO v_has_blocked_session, v_has_active_session;

  IF v_has_blocked_session AND NOT v_has_active_session THEN
    RAISE EXCEPTION '此課堂為停課、調課移出或假日狀態，禁止申請補點名';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.course_sessions cs
      WHERE cs.class_id = NEW.class_id
        AND cs.session_date = NEW.session_date
        AND cs.hours IN (2, 3, 4)
    )
    OR EXISTS (
      SELECT 1 FROM public.class_sessions cls_s
      WHERE cls_s.class_id = NEW.class_id
        AND cls_s.session_date = NEW.session_date
        AND UPPER(COALESCE(cls_s.status, 'NORMAL')) IN ('NORMAL', 'MAKEUP')
        AND cls_s.periods_count IN (2, 3, 4)
    )
    OR EXISTS (
      SELECT 1 FROM public.class_schedule_rules csr
      WHERE csr.class_id = NEW.class_id
        AND csr.day_of_week = EXTRACT(ISODOW FROM NEW.session_date)::INTEGER
        AND csr.periods_count IN (2, 3, 4)
    )
  ) INTO v_has_valid_schedule;

  IF NOT v_has_valid_schedule THEN
    RAISE EXCEPTION '找不到該班級於 % 的有效排課節數設定（需為 2、3 或 4 小時制），無法提出補點名申請', NEW.session_date;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_attendance_makeup_request_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_attendance_makeup_request_insert ON public.attendance_makeup_requests;
CREATE TRIGGER trg_validate_attendance_makeup_request_insert
  BEFORE INSERT ON public.attendance_makeup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_makeup_request_insert();

CREATE OR REPLACE FUNCTION public.validate_attendance_makeup_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_taiwan_today DATE := (now() AT TIME ZONE 'Asia/Taipei')::DATE;
  v_is_term_locked BOOLEAN := false;
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status = 'PENDING' THEN
    IF NEW.session_date >= v_taiwan_today OR (v_taiwan_today - NEW.session_date) <= 7 THEN
      RAISE EXCEPTION '目標課堂日期 (%) 未超過 7 天補點名期限，禁止核准為逾七天補點名單', NEW.session_date;
    END IF;

    SELECT COALESCE(tm.is_locked, false)
    INTO v_is_term_locked
    FROM public.classes c
    LEFT JOIN public.terms tm ON c.term_id = tm.id
    WHERE c.id = NEW.class_id;

    IF COALESCE(v_is_term_locked, false) THEN
      RAISE EXCEPTION '此學期已封存鎖定，禁止核准補點名申請';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_attendance_makeup_request_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_attendance_makeup_request_update ON public.attendance_makeup_requests;
CREATE TRIGGER trg_validate_attendance_makeup_request_update
  BEFORE UPDATE ON public.attendance_makeup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_makeup_request_update();

-- 3. 啟用 RLS 並設定最小權限原則
ALTER TABLE public.attendance_makeup_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.attendance_makeup_requests FROM anon;
REVOKE DELETE ON public.attendance_makeup_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance_makeup_requests TO authenticated;

DROP POLICY IF EXISTS "makeup_requests_select_policy" ON public.attendance_makeup_requests;
CREATE POLICY "makeup_requests_select_policy"
  ON public.attendance_makeup_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'ADMIN' AND p.is_active = true
    )
    OR requester_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.classes c
      JOIN public.teachers t ON c.teacher_id = t.id
      WHERE c.id = attendance_makeup_requests.class_id
        AND t.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "makeup_requests_insert_teacher_policy" ON public.attendance_makeup_requests;
CREATE POLICY "makeup_requests_insert_teacher_policy"
  ON public.attendance_makeup_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_profile_id = auth.uid()
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND review_notes IS NULL
    AND used_at IS NULL
    AND session_date < (now() AT TIME ZONE 'Asia/Taipei')::DATE
    AND ((now() AT TIME ZONE 'Asia/Taipei')::DATE - session_date) > 7
    AND EXISTS (
      SELECT 1 FROM public.profiles p_self
      WHERE p_self.id = auth.uid() AND p_self.is_active = true
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'ADMIN' AND p.is_active = true
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.classes c
          JOIN public.teachers t ON c.teacher_id = t.id
          WHERE c.id = attendance_makeup_requests.class_id
            AND t.profile_id = auth.uid()
        )
        AND (
          attendance_makeup_requests.teacher_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.teachers t2
            WHERE t2.id = attendance_makeup_requests.teacher_id
              AND t2.profile_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "makeup_requests_update_admin_policy" ON public.attendance_makeup_requests;
CREATE POLICY "makeup_requests_update_admin_policy"
  ON public.attendance_makeup_requests
  FOR UPDATE
  TO authenticated
  USING (
    status = 'PENDING'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'ADMIN' AND p.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'ADMIN' AND p.is_active = true
    )
    AND status IN ('APPROVED', 'REJECTED')
    AND (reviewed_by IS NULL OR reviewed_by = auth.uid())
    AND used_at IS NULL
  );

-- 4. 點名異動稽核紀錄 RLS 與安全權限
-- 已於正式資料庫確認：
-- (1) log_attendance_audit、handle_updated_at、calculate_attendance_earned_hours 均為 SECURITY DEFINER 且 search_path = public, pg_temp；
-- (2) attendance_audit_logs 已具備既有政策 audit_adm（管理員 ALL）與 audit_sel（管理員或授課教師 SELECT）。
-- 因此保留既有 Trigger 與既有 audit_adm / audit_sel 政策不動，僅收回前端 authenticated 直接寫刪權限，並清理本遷移早期草案殘留政策（如曾建立），避免重複政策衝突。
ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_audit_logs_insert_policy" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "attendance_audit_logs_update_policy" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "attendance_audit_logs_delete_policy" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "attendance_audit_logs_select_policy" ON public.attendance_audit_logs;

REVOKE ALL ON public.attendance_audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.attendance_audit_logs FROM authenticated;
GRANT SELECT ON public.attendance_audit_logs TO authenticated;

-- 延用現有 UPDATE Trigger。補點名時回傳精確的稽核 ID 與 OLD。
CREATE OR REPLACE FUNCTION public.log_attendance_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_capture BOOLEAN := current_setting('attendance_makeup.audit_result', true) = 'capture';
    v_audit_id public.attendance_audit_logs.id%TYPE;
BEGIN
    -- 僅在任一分節狀態、實得時數或備註發生改變時寫入
    IF (OLD.period_1 IS DISTINCT FROM NEW.period_1) OR
       (OLD.period_2 IS DISTINCT FROM NEW.period_2) OR
       (OLD.period_3 IS DISTINCT FROM NEW.period_3) OR
       (OLD.period_4 IS DISTINCT FROM NEW.period_4) OR
       (OLD.earned_hours IS DISTINCT FROM NEW.earned_hours) OR
       (OLD.note IS DISTINCT FROM NEW.note) THEN

        INSERT INTO public.attendance_audit_logs (
            attendance_record_id,
            session_id,
            student_id,
            old_period_1,
            old_period_2,
            old_period_3,
            old_period_4,
            new_period_1,
            new_period_2,
            new_period_3,
            new_period_4,
            old_earned_hours,
            new_earned_hours,
            changed_by,
            reason,
            created_at
        ) VALUES (
            OLD.id,
            OLD.session_id,
            OLD.student_id,
            OLD.period_1,
            OLD.period_2,
            OLD.period_3,
            OLD.period_4,
            NEW.period_1,
            NEW.period_2,
            NEW.period_3,
            NEW.period_4,
            OLD.earned_hours,
            NEW.earned_hours,
            COALESCE(NEW.operated_by, auth.uid()),
            COALESCE(NEW.note, '點名狀態變更'),
            NOW()
        ) RETURNING id INTO v_audit_id;
    END IF;

    -- 回傳本列 UPDATE 的資料供補點名 RPC 使用。此設定不影響稽核內容或是否寫入。
    IF v_capture THEN
        PERFORM set_config(
            'attendance_makeup.audit_result',
            jsonb_build_object('record_id', NEW.id, 'audit_id', v_audit_id,
                               'old_row', to_jsonb(OLD))::text,
            true
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- 5. 內部輔助函式：嚴格依入退班紀錄 (class_students) 與轉班歷史 (student_enrollment_history)
--    判斷學生於指定日期是否確實屬於目標班級（不接受 attendance_records 繞過檢查）。
CREATE OR REPLACE FUNCTION public.is_student_enrolled_in_class_on_date(
  p_student_id UUID,
  p_class_id UUID,
  p_session_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg_start DATE;
  v_enter_raw TEXT;
  v_enter_date DATE := NULL;
  v_term_start_date DATE;
  v_cs_curr RECORD;
  v_has_cs_curr BOOLEAN := false;
  v_hist_at_date RECORD;
  v_first_hist RECORD;
  v_start_date DATE;
BEGIN
  IF p_student_id IS NULL OR p_class_id IS NULL OR p_session_date IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.registration_start_date, NULLIF(trim(COALESCE(s.enterdate, '')), '')
  INTO v_reg_start, v_enter_raw
  FROM public.students s
  WHERE s.id = p_student_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_enter_raw IS NOT NULL AND v_enter_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_enter_date := v_enter_raw::DATE;
  END IF;

  SELECT tm.start_date
  INTO v_term_start_date
  FROM public.classes c
  LEFT JOIN public.terms tm ON c.term_id = tm.id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT cs.joined_at, cs.dropped_at, cs.enrollment_status
  INTO v_cs_curr
  FROM public.class_students cs
  WHERE cs.student_id = p_student_id
    AND cs.class_id = p_class_id
  LIMIT 1;
  v_has_cs_curr := FOUND;

  -- 若 class_students 明確標記於該班級當日或之前離班／退班，即不屬於該班
  IF v_has_cs_curr AND (
    (v_cs_curr.dropped_at IS NOT NULL AND p_session_date >= v_cs_curr.dropped_at)
    OR (COALESCE(v_cs_curr.enrollment_status, 'ENROLLED') = 'DROPPED' AND v_cs_curr.dropped_at IS NULL)
  ) THEN
    RETURN false;
  END IF;

  -- 1. 優先查詢 p_session_date 當日或之前最新一筆轉班／分班歷史紀錄
  SELECT h.to_class_id, h.effective_date
  INTO v_hist_at_date
  FROM public.student_enrollment_history h
  WHERE h.student_id = p_student_id
    AND h.effective_date <= p_session_date
  ORDER BY h.effective_date DESC, h.created_at DESC, h.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_hist_at_date.to_class_id <> p_class_id THEN
      RETURN false;
    END IF;

    IF v_reg_start IS NOT NULL AND p_session_date < v_reg_start THEN
      RETURN false;
    END IF;

    -- 若目前仍在該班級且無更早期多次出入班紀錄，亦須滿足 class_students.joined_at
    IF v_has_cs_curr AND v_cs_curr.joined_at IS NOT NULL AND p_session_date < v_cs_curr.joined_at THEN
      IF v_hist_at_date.effective_date = v_cs_curr.joined_at THEN
        RETURN false;
      END IF;
    END IF;

    RETURN true;
  END IF;

  -- 2. 若 p_session_date 早於所有歷史異動紀錄，檢查首筆異動前之原班級 from_class_id
  SELECT h.from_class_id, h.effective_date
  INTO v_first_hist
  FROM public.student_enrollment_history h
  WHERE h.student_id = p_student_id
  ORDER BY h.effective_date ASC, h.created_at ASC, h.id ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_first_hist.from_class_id IS DISTINCT FROM p_class_id THEN
      RETURN false;
    END IF;
    IF p_session_date >= v_first_hist.effective_date THEN
      RETURN false;
    END IF;
    IF v_reg_start IS NOT NULL AND p_session_date < v_reg_start THEN
      RETURN false;
    END IF;
    IF v_enter_date IS NOT NULL AND p_session_date < v_enter_date THEN
      RETURN false;
    END IF;
    IF v_term_start_date IS NOT NULL AND p_session_date < v_term_start_date THEN
      RETURN false;
    END IF;

    -- 需具備可驗證的入學或入班起始依據（對齊前端 timeline 規則）
    IF v_enter_date IS NULL AND v_reg_start IS NULL AND (NOT v_has_cs_curr OR v_cs_curr.joined_at IS NULL OR v_cs_curr.joined_at >= v_first_hist.effective_date) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  -- 3. 無轉班歷史者，嚴格依 class_students 在籍紀錄及入班／入學日期判定
  IF NOT v_has_cs_curr THEN
    RETURN false;
  END IF;

  v_start_date := COALESCE(v_cs_curr.joined_at, v_enter_date, v_reg_start);
  IF v_start_date IS NULL OR p_session_date < v_start_date THEN
    RETURN false;
  END IF;

  IF v_reg_start IS NOT NULL AND p_session_date < v_reg_start THEN
    RETURN false;
  END IF;

  IF v_term_start_date IS NOT NULL AND p_session_date < v_term_start_date THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_student_enrolled_in_class_on_date(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;

-- 6. 單次逾七天補點名／修改原子交易 RPC（統一為 8 個參數）
--    於單一交易內完成：
--    (a) 驗證身分（啟用中之管理員或原申請且為該班授課教師）
--    (b) 驗證台灣時區 (> 7 天)、學期未鎖定、課堂非停課／調課移出／假日、單次 APPROVED 核准單鎖定
--    (c) 嚴格由實際 course_sessions、class_sessions 或 class_schedule_rules 取得 2/3/4 小時制節數與實際時間（不假設 3 小時或 09:00-12:00）
--    (d) 拒絕空名單與部分名單；嚴格依入退班與轉班時間軸驗證完整應到名單，若與 attendance_records 矛盾立即報錯要求行政確認
--    (e) 依既有點名狀態代碼（PRESENT=1, LEAVE=0.5, ABSENT=0）由後端計算 earned_hours
--    (f) 寫入 course_sessions、attendance_records 與 attendance_audit_logs 後才核銷核准單為 COMPLETED
DROP FUNCTION IF EXISTS public.submit_makeup_attendance_atomic(
  UUID, UUID, DATE, TIME, TIME, INTEGER, BOOLEAN, JSONB
);

CREATE OR REPLACE FUNCTION public.submit_makeup_attendance_atomic(
  p_request_id UUID,
  p_class_id UUID,
  p_session_date DATE,
  p_period_start TIME,
  p_period_end TIME,
  p_hours INTEGER,
  p_is_submitted BOOLEAN,
  p_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_taiwan_today DATE := (now() AT TIME ZONE 'Asia/Taipei')::DATE;
  v_is_active_user BOOLEAN := false;
  v_is_admin BOOLEAN := false;
  v_is_owner_teacher BOOLEAN := false;
  v_term_id UUID;
  v_is_term_locked BOOLEAN := false;
  v_req public.attendance_makeup_requests%ROWTYPE;
  v_course_session_id UUID;
  v_cs_hours INTEGER;
  v_cs_start TIME;
  v_cs_end TIME;
  v_class_session_hours INTEGER;
  v_class_session_start TIME;
  v_class_session_end TIME;
  v_rule_hours INTEGER;
  v_rule_start TIME;
  v_rule_end TIME;
  v_hours INTEGER;
  v_period_start TIME;
  v_period_end TIME;
  v_has_blocked_session BOOLEAN := false;
  v_has_active_session BOOLEAN := false;
  v_expected_roster UUID[] := ARRAY[]::UUID[];
  v_conflict_student_id UUID;
  v_missing_count INTEGER := 0;
  v_rec JSONB;
  v_student_id UUID;
  v_seen_students UUID[] := ARRAY[]::UUID[];
  v_has_existing_att BOOLEAN := false;
  v_p1 TEXT;
  v_p2 TEXT;
  v_p3 TEXT;
  v_p4 TEXT;
  v_earned NUMERIC;
  v_remarks TEXT;
  v_evidence_path TEXT;
  v_input_row public.attendance_records%ROWTYPE;
  v_saved_row public.attendance_records%ROWTYPE;
  v_old_row public.attendance_records%ROWTYPE;
  v_audit_id public.attendance_audit_logs.id%TYPE;
  v_audit_result JSONB;
  v_previous_audit_setting TEXT;
  v_audit_reason TEXT;
  v_processed_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '未經授權的存取：請先登入系統';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND is_active = true
  ) INTO v_is_active_user;

  IF NOT v_is_active_user THEN
    RAISE EXCEPTION '權限不足：您的帳號已停用或尚未完成啟用';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role = 'ADMIN' AND is_active = true
  ) INTO v_is_admin;

  SELECT c.term_id, COALESCE(tm.is_locked, false)
  INTO v_term_id, v_is_term_locked
  FROM public.classes c
  LEFT JOIN public.terms tm ON c.term_id = tm.id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到目標班級資料';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.teachers t ON c.teacher_id = t.id
    WHERE c.id = p_class_id AND t.profile_id = v_uid
  ) INTO v_is_owner_teacher;

  IF NOT v_is_admin AND NOT v_is_owner_teacher THEN
    RAISE EXCEPTION '權限不足：您非此班級授課教師或管理員';
  END IF;

  IF v_is_term_locked THEN
    RAISE EXCEPTION '此學期已封存鎖定，禁止寫入點名紀錄';
  END IF;

  -- 強制驗證台灣時區 (> 7 天歷史堂次)
  IF p_session_date IS NULL OR p_session_date >= v_taiwan_today OR (v_taiwan_today - p_session_date) <= 7 THEN
    RAISE EXCEPTION '此課堂日期 (%) 未超過 7 天補點名期限（台灣時間今日：%），請依一般點名流程操作', p_session_date, v_taiwan_today;
  END IF;

  IF NOT COALESCE(p_is_submitted, false) THEN
    RAISE EXCEPTION '補點名核准為單次使用，僅允許正式送出點名（不可僅暫存草稿）';
  END IF;

  IF jsonb_typeof(COALESCE(p_records, '[]'::JSONB)) <> 'array' OR jsonb_array_length(COALESCE(p_records, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION '點名資料不可為空，無法送出並核銷補點名核准單';
  END IF;

  -- 鎖定該筆核准單並驗證授權對象與單次可用狀態
  SELECT *
  INTO v_req
  FROM public.attendance_makeup_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到對應的補點名核准單';
  END IF;

  IF v_req.class_id <> p_class_id OR v_req.session_date <> p_session_date THEN
    RAISE EXCEPTION '補點名核准單與目標課堂不符';
  END IF;

  IF NOT v_is_admin AND v_req.requester_profile_id <> v_uid THEN
    RAISE EXCEPTION '權限不足：僅原申請教師或管理員可使用此補點名核准單';
  END IF;

  IF v_req.status <> 'APPROVED' OR v_req.used_at IS NOT NULL THEN
    RAISE EXCEPTION '此補點名申請目前狀態為 %，無法重複使用', v_req.status;
  END IF;

  -- 檢查課堂是否為停課／調課移出／假日狀態
  SELECT
    EXISTS (
      SELECT 1 FROM public.class_sessions cs_blk
      WHERE cs_blk.class_id = p_class_id
        AND cs_blk.session_date = p_session_date
        AND UPPER(COALESCE(cs_blk.status, 'NORMAL')) IN ('CANCELLED', 'SUSPENDED', 'RESCHEDULED', 'HOLIDAY')
    ),
    EXISTS (
      SELECT 1 FROM public.class_sessions cs_ok
      WHERE cs_ok.class_id = p_class_id
        AND cs_ok.session_date = p_session_date
        AND UPPER(COALESCE(cs_ok.status, 'NORMAL')) IN ('NORMAL', 'MAKEUP')
    )
  INTO v_has_blocked_session, v_has_active_session;

  IF v_has_blocked_session AND NOT v_has_active_session THEN
    RAISE EXCEPTION '此課堂為停課、調課移出或假日狀態，禁止寫入點名紀錄';
  END IF;

  -- 嚴格從 course_sessions -> class_sessions -> class_schedule_rules 取得實際節數（支援 2, 3, 4 小時制）與上課起訖時間
  -- 禁止預設 3 小時或預設 09:00~12:00
  SELECT id, hours, period_start, period_end
  INTO v_course_session_id, v_cs_hours, v_cs_start, v_cs_end
  FROM public.course_sessions
  WHERE class_id = p_class_id AND session_date = p_session_date
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  SELECT periods_count, start_time, end_time
  INTO v_class_session_hours, v_class_session_start, v_class_session_end
  FROM public.class_sessions
  WHERE class_id = p_class_id
    AND session_date = p_session_date
    AND UPPER(COALESCE(status, 'NORMAL')) IN ('NORMAL', 'MAKEUP')
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT periods_count, start_time, end_time
  INTO v_rule_hours, v_rule_start, v_rule_end
  FROM public.class_schedule_rules
  WHERE class_id = p_class_id
    AND day_of_week = EXTRACT(ISODOW FROM p_session_date)::INTEGER
  ORDER BY created_at ASC
  LIMIT 1;

  v_hours := COALESCE(
    CASE WHEN v_cs_hours IN (2, 3, 4) THEN v_cs_hours ELSE NULL END,
    CASE WHEN v_class_session_hours IN (2, 3, 4) THEN v_class_session_hours ELSE NULL END,
    CASE WHEN v_rule_hours IN (2, 3, 4) THEN v_rule_hours ELSE NULL END
  );

  IF v_hours IS NULL THEN
    RAISE EXCEPTION '無法確認此班級於 % 的實際上課節數（查無 course_sessions、class_sessions 或有效排課規則之 2/3/4 小時制資料），禁止補點名', p_session_date;
  END IF;

  IF p_hours IS NOT NULL AND p_hours <> v_hours THEN
    RAISE EXCEPTION '送出節數 (% 節) 與資料庫排課節數 (% 節) 不符，請重新整理頁面後再試', p_hours, v_hours;
  END IF;

  v_period_start := COALESCE(v_cs_start, v_class_session_start, v_rule_start);
  v_period_end := COALESCE(v_cs_end, v_class_session_end, v_rule_end);

  IF v_course_session_id IS NULL THEN
    IF v_period_start IS NULL OR v_period_end IS NULL THEN
      RAISE EXCEPTION '無法確認此班級於 % 的實際上課起訖時間（查無 class_sessions 或有效排課規則），禁止使用預設時間補點名', p_session_date;
    END IF;

    INSERT INTO public.course_sessions (
      class_id, session_date, period_start, period_end, hours,
      is_attendance_submitted, operated_by
    ) VALUES (
      p_class_id,
      p_session_date,
      v_period_start,
      v_period_end,
      v_hours,
      true,
      v_uid
    )
    RETURNING id INTO v_course_session_id;
  ELSE
    -- 若既有 course_sessions 與 attendance_records 存在資料矛盾（該生當日依學籍／轉班時間軸不屬於此班），立即攔截並要求行政確認
    SELECT ar.student_id
    INTO v_conflict_student_id
    FROM public.attendance_records ar
    WHERE ar.session_id = v_course_session_id
      AND NOT public.is_student_enrolled_in_class_on_date(ar.student_id, p_class_id, p_session_date)
    LIMIT 1;

    IF v_conflict_student_id IS NOT NULL THEN
      RAISE EXCEPTION '資料衝突：點名紀錄表已存在學生 % 於 % 的紀錄，但學籍入退班與轉班歷史顯示當日並不屬於此班級，請管理員確認學籍或點名資料後再行補點名',
        v_conflict_student_id, p_session_date;
    END IF;

    UPDATE public.course_sessions
    SET is_attendance_submitted = true,
        operated_by = v_uid,
        updated_at = now()
    WHERE id = v_course_session_id;
  END IF;

  -- 建立當日該班級完整應到學生名單（嚴格依入退班紀錄與轉班時間軸計算）
  SELECT COALESCE(array_agg(DISTINCT cand.student_id), ARRAY[]::UUID[])
  INTO v_expected_roster
  FROM (
    SELECT cs.student_id FROM public.class_students cs WHERE cs.class_id = p_class_id
    UNION
    SELECT h.student_id FROM public.student_enrollment_history h WHERE h.from_class_id = p_class_id OR h.to_class_id = p_class_id
    UNION
    SELECT ar.student_id FROM public.attendance_records ar WHERE ar.session_id = v_course_session_id
  ) cand
  WHERE public.is_student_enrolled_in_class_on_date(cand.student_id, p_class_id, p_session_date);

  IF COALESCE(array_length(v_expected_roster, 1), 0) = 0 THEN
    RAISE EXCEPTION '查無此班級於 % 的有效應到學生名單（請確認學生入班日期與轉班紀錄），無法送出補點名', p_session_date;
  END IF;

  v_audit_reason := format(
    '[%s] %s（核准單：%s）',
    CASE WHEN v_req.request_type = 'MAKEUP' THEN '逾7日補點名' ELSE '逾7日修改點名' END,
    v_req.reason,
    v_req.id::TEXT
  );

  -- 逐筆驗證名單歸屬、計算時數、寫入點名與稽核紀錄
  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    BEGIN
      v_student_id := NULLIF(trim(v_rec->>'student_id'), '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION '無效的學生識別碼格式：%', COALESCE(v_rec->>'student_id', 'NULL');
    END;

    IF v_student_id IS NULL THEN
      RAISE EXCEPTION '點名資料缺少 student_id';
    END IF;

    IF v_student_id = ANY(v_seen_students) THEN
      RAISE EXCEPTION '點名資料包含重複的學生識別碼：%', v_student_id;
    END IF;
    v_seen_students := array_append(v_seen_students, v_student_id);

    IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_student_id) THEN
      RAISE EXCEPTION '找不到對應學生資料（ID：%），無法寫入點名', v_student_id;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.session_id = v_course_session_id
        AND ar.student_id = v_student_id
    ) INTO v_has_existing_att;

    IF NOT (v_student_id = ANY(v_expected_roster)) THEN
      IF v_has_existing_att THEN
        RAISE EXCEPTION '資料衝突：點名表已存在學生 % 於 % 之紀錄，但入退班或轉班歷史顯示當日並不屬於此班級，請聯繫管理員確認',
          v_student_id, p_session_date;
      ELSE
        RAISE EXCEPTION '權限與名單驗證失敗：學生 % 於 % 並不屬於此班級，無法寫入點名紀錄',
          v_student_id, p_session_date;
      END IF;
    END IF;

    -- 驗證節次狀態：沿用既有系統之合法狀態代碼（PRESENT, LEAVE, ABSENT）
    v_p1 := UPPER(NULLIF(trim(v_rec->>'period_1'), ''));
    v_p2 := CASE WHEN v_hours >= 2 THEN UPPER(NULLIF(trim(v_rec->>'period_2'), '')) ELSE NULL END;
    v_p3 := CASE WHEN v_hours >= 3 THEN UPPER(NULLIF(trim(v_rec->>'period_3'), '')) ELSE NULL END;
    v_p4 := CASE WHEN v_hours >= 4 THEN UPPER(NULLIF(trim(v_rec->>'period_4'), '')) ELSE NULL END;

    IF v_p1 IS NULL OR v_p1 NOT IN ('PRESENT', 'LEAVE', 'ABSENT') THEN
      RAISE EXCEPTION '無效的第 1 節點名狀態：%（學生 %）', COALESCE(v_p1, 'NULL'), v_student_id;
    END IF;
    IF v_hours >= 2 AND (v_p2 IS NULL OR v_p2 NOT IN ('PRESENT', 'LEAVE', 'ABSENT')) THEN
      RAISE EXCEPTION '無效的第 2 節點名狀態：%（學生 %）', COALESCE(v_p2, 'NULL'), v_student_id;
    END IF;
    IF v_hours >= 3 AND (v_p3 IS NULL OR v_p3 NOT IN ('PRESENT', 'LEAVE', 'ABSENT')) THEN
      RAISE EXCEPTION '無效的第 3 節點名狀態：%（學生 %）', COALESCE(v_p3, 'NULL'), v_student_id;
    END IF;
    IF v_hours >= 4 AND (v_p4 IS NULL OR v_p4 NOT IN ('PRESENT', 'LEAVE', 'ABSENT')) THEN
      RAISE EXCEPTION '無效的第 4 節點名狀態：%（學生 %）', COALESCE(v_p4, 'NULL'), v_student_id;
    END IF;

    -- 由可信任的後端依既有折算規則計算 earned_hours（PRESENT=1, LEAVE=0.5, ABSENT=0）
    v_earned :=
      (CASE WHEN v_p1 = 'PRESENT' THEN 1.0 WHEN v_p1 = 'LEAVE' THEN 0.5 ELSE 0.0 END)
      + (CASE WHEN v_hours >= 2 THEN CASE WHEN v_p2 = 'PRESENT' THEN 1.0 WHEN v_p2 = 'LEAVE' THEN 0.5 ELSE 0.0 END ELSE 0.0 END)
      + (CASE WHEN v_hours >= 3 THEN CASE WHEN v_p3 = 'PRESENT' THEN 1.0 WHEN v_p3 = 'LEAVE' THEN 0.5 ELSE 0.0 END ELSE 0.0 END)
      + (CASE WHEN v_hours >= 4 THEN CASE WHEN v_p4 = 'PRESENT' THEN 1.0 WHEN v_p4 = 'LEAVE' THEN 0.5 ELSE 0.0 END ELSE 0.0 END);

    v_remarks := NULLIF(trim(COALESCE(v_rec->>'remarks', v_rec->>'note', '')), '');
    v_evidence_path := NULLIF(trim(COALESCE(v_rec->>'evidence_image_path', '')), '');

    v_input_row := jsonb_populate_record(
      NULL::public.attendance_records,
      jsonb_build_object('period_1', v_p1, 'period_2', v_p2,
                         'period_3', v_p3, 'period_4', v_p4)
    );

    v_previous_audit_setting := current_setting('attendance_makeup.audit_result', true);
    PERFORM set_config('attendance_makeup.audit_result', 'capture', true);

    INSERT INTO public.attendance_records (
      session_id, student_id, period_1, period_2, period_3, period_4,
      earned_hours, operated_by, note, remarks, evidence_image_path, updated_at
    ) VALUES (
      v_course_session_id,
      v_student_id,
      v_input_row.period_1,
      v_input_row.period_2,
      v_input_row.period_3,
      v_input_row.period_4,
      v_earned,
      v_uid,
      v_remarks,
      v_remarks,
      v_evidence_path,
      now()
    )
    ON CONFLICT (session_id, student_id)
    DO UPDATE SET
      period_1 = EXCLUDED.period_1,
      period_2 = EXCLUDED.period_2,
      period_3 = EXCLUDED.period_3,
      period_4 = EXCLUDED.period_4,
      earned_hours = EXCLUDED.earned_hours,
      operated_by = EXCLUDED.operated_by,
      note = EXCLUDED.note,
      remarks = EXCLUDED.remarks,
      evidence_image_path = EXCLUDED.evidence_image_path,
      updated_at = now()
    RETURNING * INTO v_saved_row;

    -- 每筆 UPSERT 前重設回傳值。UPDATE Trigger 若已寫入，直接使用其回傳 ID。
    v_audit_result := NULLIF(current_setting('attendance_makeup.audit_result'), 'capture')::JSONB;
    PERFORM set_config(
      'attendance_makeup.audit_result', COALESCE(v_previous_audit_setting, ''), true
    );

    IF v_audit_result IS NOT NULL
       AND (v_audit_result->>'record_id')::UUID IS DISTINCT FROM v_saved_row.id THEN
      RAISE EXCEPTION '補點名稽核回傳的點名紀錄 ID 不符';
    END IF;

    v_audit_id := v_audit_result->>'audit_id';
    IF v_audit_id IS NOT NULL THEN
      UPDATE public.attendance_audit_logs
      SET reason = v_audit_reason,
          changed_by = v_uid,
          new_period_1 = v_saved_row.period_1,
          new_period_2 = v_saved_row.period_2,
          new_period_3 = v_saved_row.period_3,
          new_period_4 = v_saved_row.period_4,
          new_earned_hours = v_saved_row.earned_hours
      WHERE id = v_audit_id
        AND attendance_record_id = v_saved_row.id;

      IF NOT FOUND THEN
        RAISE EXCEPTION '找不到本次 UPDATE Trigger 建立的補點名稽核紀錄';
      END IF;
    ELSE
      -- 首次 INSERT 的 OLD 為 NULL。同值 UPDATE 則保留實際 OLD。
      v_old_row := jsonb_populate_record(NULL::public.attendance_records, v_audit_result->'old_row');
      INSERT INTO public.attendance_audit_logs (
        attendance_record_id, session_id, student_id,
        old_period_1, old_period_2, old_period_3, old_period_4,
        new_period_1, new_period_2, new_period_3, new_period_4,
        old_earned_hours, new_earned_hours, changed_by, reason, created_at
      ) VALUES (
        v_saved_row.id, v_saved_row.session_id, v_saved_row.student_id,
        v_old_row.period_1, v_old_row.period_2, v_old_row.period_3, v_old_row.period_4,
        v_saved_row.period_1, v_saved_row.period_2, v_saved_row.period_3, v_saved_row.period_4,
        v_old_row.earned_hours, v_saved_row.earned_hours, v_uid, v_audit_reason, now()
      );
    END IF;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  -- 強制檢查：必須涵蓋當日全體應到學生，禁止部分名單提交即耗盡單次核准額度
  SELECT count(*)
  INTO v_missing_count
  FROM unnest(v_expected_roster) AS exp_id
  WHERE NOT (exp_id = ANY(v_seen_students));

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION '補點名名單不完整：尚有 % 位當日應到學生未包含於送出資料中，禁止部分提交並核銷核准單', v_missing_count;
  END IF;

  -- 僅於全體名單寫入與稽核紀錄成功後才標記為 COMPLETED 並立即重新鎖定
  UPDATE public.attendance_makeup_requests
  SET status = 'COMPLETED',
      course_session_id = COALESCE(course_session_id, v_course_session_id),
      used_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND status = 'APPROVED'
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '核銷補點名核准單失敗：狀態已變更或已被使用';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'course_session_id', v_course_session_id,
    'request_id', p_request_id,
    'status', 'COMPLETED',
    'hours', v_hours,
    'processed_count', v_processed_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_makeup_attendance_atomic(
  UUID, UUID, DATE, TIME, TIME, INTEGER, BOOLEAN, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_makeup_attendance_atomic(
  UUID, UUID, DATE, TIME, TIME, INTEGER, BOOLEAN, JSONB
) TO authenticated;

-- RPC 由本遷移角色擁有。該角色須能在不套用用戶端 RLS 的情況下核銷。
DO $migration$
BEGIN
  IF row_security_active('public.attendance_makeup_requests'::regclass) THEN
    RAISE EXCEPTION '補點名 RPC 擁有者 % 受申請表 RLS 限制，無法核銷 APPROVED 申請', current_user;
  END IF;

  IF row_security_active('public.attendance_audit_logs'::regclass) THEN
    RAISE EXCEPTION '補點名 RPC 擁有者 % 受稽核表 RLS 限制，無法替教師寫入稽核', current_user;
  END IF;

  IF NOT has_table_privilege(current_user, 'public.attendance_makeup_requests', 'UPDATE') THEN
    RAISE EXCEPTION '補點名 RPC 擁有者 % 缺少申請表 UPDATE 權限', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.attendance_records'::regclass
      AND tgfoid = 'public.log_attendance_audit()'::regprocedure
      AND tgname = 'trg_attendance_records_audit'
      AND tgenabled IN ('O', 'A')
      AND tgtype IN (17, 19)
      AND tgqual IS NULL
      AND tgattr = ''::int2vector
  ) THEN
    RAISE EXCEPTION '找不到已啟用、涵蓋全列 UPDATE 的既有點名稽核 Trigger';
  END IF;
  -- 只規劃語句，檢查 UPSERT 所需欄位與唯一索引。
  EXECUTE $check$
    EXPLAIN INSERT INTO public.attendance_records (
      session_id, student_id, period_1, period_2, period_3, period_4,
      earned_hours, operated_by, note, remarks, evidence_image_path, updated_at
    )
    SELECT session_id, student_id, period_1, period_2, period_3, period_4,
           earned_hours, operated_by, note, remarks, evidence_image_path, updated_at
    FROM public.attendance_records WHERE false
    ON CONFLICT (session_id, student_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
  $check$;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.attendance_audit_logs'::regclass
      AND attname IN ('old_period_1', 'old_period_2', 'old_period_3',
                      'old_period_4', 'old_earned_hours')
      AND NOT attisdropped
      AND attnotnull
  ) THEN
    RAISE EXCEPTION '首次補點名需要稽核表的舊節次與舊時數欄位允許 NULL';
  END IF;
END;
$migration$;

-- 7. 重新整理 Supabase PostgREST Schema 快取
NOTIFY pgrst, 'reload schema';

COMMIT;
