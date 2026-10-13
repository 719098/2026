-- ============================================================================
-- 華語中心系統：學生個別自訂六項成績權重 - 完整正式部署 SQL
-- 檔案名稱：grade_weights_deploy.sql
-- 版本：v6.5-final (嚴格驗證與安全移除版)
-- 特點：
-- 1. 包裝於單一 BEGIN ... COMMIT 交易塊中，具備全有全無原子性保障。
-- 2. student_id 外鍵嚴格引用 public.students(id)，changed_by 引用 public.profiles(id)。
-- 3. 嚴格 RPC 參數驗證：
--    - 六項權重逐項驗證 NOT NULL、0 <= weight <= 100、總和嚴格等於 100。
--    - 批量學生陣列驗證 NOT NULL、不可為空、不含 NULL UUID、不含重複 UUID、長度 1~500。
--    - 全有全無校驗：所有學生在指定學期必須有修課紀錄 (class_students -> classes.term_id)。
-- 4. 教師 RLS 嚴格加強：除授課關係外，同時驗證 profiles.id = auth.uid()、role = 'TEACHER'、is_active = true。
-- 5. 完全禁止直接寫入權重表（無 INSERT/UPDATE/DELETE Policy，authenticated 僅限 SELECT，所有寫入走 RPC）。
-- 6. 安全移除 student_grades.grade_letter：先檢查所有相依物件 (View, Materialized View, 函式)，若有未處理相依則拋出異常阻擋，確認安全才 DROP COLUMN (不使用 CASCADE)。
-- 7. 英文等第 (grade_letter) 完全移除，不加入任何 ABCD 邏輯。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 建立學生個別自訂成績權重表 (student_grade_weights)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_grade_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
    attendance_weight NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    quiz_weight NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    midterm_weight NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    final_weight NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    homework_weight NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    attitude_weight NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- 每個學生在每一學期僅能有一筆獨立自訂權重設定
    CONSTRAINT uq_student_grade_weights_student_term UNIQUE (student_id, term_id),

    -- 六項個別權重數值範圍約束：0 ~ 100
    CONSTRAINT chk_grade_weights_attendance_range CHECK (attendance_weight >= 0.00 AND attendance_weight <= 100.00),
    CONSTRAINT chk_grade_weights_quiz_range CHECK (quiz_weight >= 0.00 AND quiz_weight <= 100.00),
    CONSTRAINT chk_grade_weights_midterm_range CHECK (midterm_weight >= 0.00 AND midterm_weight <= 100.00),
    CONSTRAINT chk_grade_weights_final_range CHECK (final_weight >= 0.00 AND final_weight <= 100.00),
    CONSTRAINT chk_grade_weights_homework_range CHECK (homework_weight >= 0.00 AND homework_weight <= 100.00),
    CONSTRAINT chk_grade_weights_attitude_range CHECK (attitude_weight >= 0.00 AND attitude_weight <= 100.00),

    -- 六項權重合計必須嚴格等於 100
    CONSTRAINT chk_grade_weights_total_sum CHECK (
        (attendance_weight + quiz_weight + midterm_weight + final_weight + homework_weight + attitude_weight) = 100.00
    )
);

CREATE INDEX IF NOT EXISTS idx_student_grade_weights_student_term 
    ON public.student_grade_weights(student_id, term_id);

CREATE INDEX IF NOT EXISTS idx_student_grade_weights_term 
    ON public.student_grade_weights(term_id);

COMMENT ON TABLE public.student_grade_weights IS '學生個別學期成績自訂六項權重設定表（未設定者使用預設 20/15/20/20/15/10）';

-- ----------------------------------------------------------------------------
-- 2. 建立權重變更稽核日誌表 (student_grade_weight_audit_logs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_grade_weight_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'RESET_TO_DEFAULT')),
    old_weights JSONB,
    new_weights JSONB,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    change_reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_weight_audit_logs_student_term 
    ON public.student_grade_weight_audit_logs(student_id, term_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_weight_audit_logs_changed_by 
    ON public.student_grade_weight_audit_logs(changed_by);

COMMENT ON TABLE public.student_grade_weight_audit_logs IS '學生個別成績權重異動與恢復預設之稽核日誌';

-- ----------------------------------------------------------------------------
-- 3. 安全移除 student_grades.grade_letter 相關相依物件與欄位（不使用 DROP CASCADE）
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_dep_views TEXT;
    v_dep_funcs TEXT;
    v_idx_record RECORD;
BEGIN
    -- 1. 檢查是否有任何 View / Materialized View 依賴 student_grades.grade_letter (透過 pg_depend 系統目錄)
    SELECT string_agg(DISTINCT n.nspname || '.' || c.relname, ', ')
    INTO v_dep_views
    FROM pg_depend d
    JOIN pg_attribute a 
        ON a.attrelid = d.refobjid 
       AND a.attnum = d.refobjsubid
    JOIN pg_class c 
        ON c.oid = d.objid
    JOIN pg_namespace n 
        ON n.oid = c.relnamespace
    WHERE a.attrelid = 'public.student_grades'::regclass
      AND a.attname = 'grade_letter'
      AND c.relkind IN ('v', 'm');

    IF v_dep_views IS NOT NULL AND v_dep_views <> '' THEN
        RAISE EXCEPTION '安全檢查失敗：存在依賴 student_grades.grade_letter 的檢視表 (Views: %)，已中斷部署，請先調整相關 View', v_dep_views;
    END IF;

    -- 2. 檢查是否有其他資料庫函式 (非本次改寫之 calculate_student_grades) 依賴此欄位
    SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ')
    INTO v_dep_funcs
    FROM pg_depend d
    JOIN pg_attribute a 
        ON a.attrelid = d.refobjid 
       AND a.attnum = d.refobjsubid
    JOIN pg_proc p 
        ON p.oid = d.objid
    JOIN pg_namespace n 
        ON n.oid = p.pronamespace
    WHERE a.attrelid = 'public.student_grades'::regclass
      AND a.attname = 'grade_letter'
      AND p.proname <> 'calculate_student_grades';

    IF v_dep_funcs IS NOT NULL AND v_dep_funcs <> '' THEN
        RAISE EXCEPTION '安全檢查失敗：存在依賴 student_grades.grade_letter 的函式 (Functions: %)，已中斷部署，請先調整相關函式', v_dep_funcs;
    END IF;

    -- 3. 若有針對 grade_letter 建立的獨立索引，先安全移除索引（非 CASCADE）
    FOR v_idx_record IN (
        SELECT indexname
        FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'student_grades' 
          AND indexdef ILIKE '%grade_letter%'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(v_idx_record.indexname) || ';';
    END LOOP;

    -- 4. 若 student_grades 上存在 grade_letter 欄位，以安全方式刪除欄位 (RESTRICT，嚴禁 CASCADE)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'student_grades' 
          AND column_name = 'grade_letter'
    ) THEN
        ALTER TABLE public.student_grades DROP COLUMN grade_letter;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. 建立內部重算函式：依學期刷新特定學生在 student_grades 之成績
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_student_grades_for_term(
    p_student_id UUID,
    p_term_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 透過 classes.term_id 關聯，觸發 student_grades 原有 BEFORE Trigger 重算
    -- 不更改原始六項分數，僅更新 updated_at 以激發 trg_calc_student_grades
    UPDATE public.student_grades sg
    SET updated_at = timezone('utc'::text, now())
    FROM public.classes c
    WHERE sg.class_id = c.id
      AND sg.student_id = p_student_id
      AND c.term_id = p_term_id;
END;
$$;

COMMENT ON FUNCTION public.recalculate_student_grades_for_term(UUID, UUID) IS '內部系統函式：重算特定學生在特定學期所有班級的總分與及格狀態';

-- ----------------------------------------------------------------------------
-- 5. 建立學期鎖定檢查 Trigger 函式 (check_term_lock_on_weights)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_term_lock_on_weights()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_term_id UUID;
    v_is_locked BOOLEAN;
    v_term_found BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_target_term_id := OLD.term_id;
    ELSE
        v_target_term_id := NEW.term_id;
    END IF;

    -- 查詢學期鎖定狀態，使用 FOR SHARE 鎖定防止競態條件
    SELECT is_locked, TRUE
    INTO v_is_locked, v_term_found
    FROM public.terms
    WHERE id = v_target_term_id
    FOR SHARE;

    IF NOT v_term_found OR v_is_locked IS NULL THEN
        RAISE EXCEPTION '指定的學期不存在 (term_id: %)', v_target_term_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION '學期已鎖定結算，禁止新增、修改或恢復預設成績權重 (term_id: %)', v_target_term_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_term_lock_on_weights() IS '學期鎖定檢查 Trigger：鎖定學期禁止任何權重變更操作';

DROP TRIGGER IF EXISTS trg_check_term_lock_on_weights ON public.student_grade_weights;
CREATE TRIGGER trg_check_term_lock_on_weights
    BEFORE INSERT OR UPDATE OR DELETE
    ON public.student_grade_weights
    FOR EACH ROW
    EXECUTE FUNCTION public.check_term_lock_on_weights();

-- ----------------------------------------------------------------------------
-- 6. 建立權重變更自動稽核與成績重算 Trigger 函式
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_grade_weights_change_and_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reason TEXT;
    v_operator_id UUID;
    v_action TEXT;
    v_target_student_id UUID;
    v_target_term_id UUID;
    v_old_json JSONB := NULL;
    v_new_json JSONB := NULL;
BEGIN
    -- 取得操作者身分
    v_operator_id := auth.uid();

    -- 取得由 RPC 設定之操作原因 Context (修正：標準 PL/pgSQL 區塊語法使用 END;)
    BEGIN
        v_reason := current_setting('app.current_weight_change_reason', true);
    EXCEPTION WHEN OTHERS THEN
        v_reason := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_target_student_id := NEW.student_id;
        v_target_term_id := NEW.term_id;
        v_new_json := jsonb_build_object(
            'attendance_weight', NEW.attendance_weight,
            'quiz_weight', NEW.quiz_weight,
            'midterm_weight', NEW.midterm_weight,
            'final_weight', NEW.final_weight,
            'homework_weight', NEW.homework_weight,
            'attitude_weight', NEW.attitude_weight
        );
        IF v_reason IS NULL OR trim(v_reason) = '' THEN
            v_reason := '設定學生個別成績權重';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_target_student_id := NEW.student_id;
        v_target_term_id := NEW.term_id;
        v_old_json := jsonb_build_object(
            'attendance_weight', OLD.attendance_weight,
            'quiz_weight', OLD.quiz_weight,
            'midterm_weight', OLD.midterm_weight,
            'final_weight', OLD.final_weight,
            'homework_weight', OLD.homework_weight,
            'attitude_weight', OLD.attitude_weight
        );
        v_new_json := jsonb_build_object(
            'attendance_weight', NEW.attendance_weight,
            'quiz_weight', NEW.quiz_weight,
            'midterm_weight', NEW.midterm_weight,
            'final_weight', NEW.final_weight,
            'homework_weight', NEW.homework_weight,
            'attitude_weight', NEW.attitude_weight
        );
        IF v_reason IS NULL OR trim(v_reason) = '' THEN
            v_reason := '更新學生個別成績權重';
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'RESET_TO_DEFAULT';
        v_target_student_id := OLD.student_id;
        v_target_term_id := OLD.term_id;
        v_old_json := jsonb_build_object(
            'attendance_weight', OLD.attendance_weight,
            'quiz_weight', OLD.quiz_weight,
            'midterm_weight', OLD.midterm_weight,
            'final_weight', OLD.final_weight,
            'homework_weight', OLD.homework_weight,
            'attitude_weight', OLD.attitude_weight
        );
        v_new_json := jsonb_build_object(
            'attendance_weight', 20.00,
            'quiz_weight', 15.00,
            'midterm_weight', 20.00,
            'final_weight', 20.00,
            'homework_weight', 15.00,
            'attitude_weight', 10.00
        );
        IF v_reason IS NULL OR trim(v_reason) = '' THEN
            v_reason := '恢復為全校預設成績權重 (20/15/20/20/15/10)';
        END IF;
    END IF;

    -- 寫入稽核紀錄
    INSERT INTO public.student_grade_weight_audit_logs (
        student_id,
        term_id,
        action_type,
        old_weights,
        new_weights,
        changed_by,
        change_reason,
        changed_at
    ) VALUES (
        v_target_student_id,
        v_target_term_id,
        v_action,
        v_old_json,
        v_new_json,
        v_operator_id,
        v_reason,
        timezone('utc'::text, now())
    );

    -- 即時自動重算該學生在該學期之成績
    PERFORM public.recalculate_student_grades_for_term(v_target_student_id, v_target_term_id);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_grade_weights_change_and_recalc() IS '權重異動 Trigger：自動寫入稽核日誌並即時重算該學生在該學期之成績';

DROP TRIGGER IF EXISTS trg_after_student_grade_weights_change ON public.student_grade_weights;
CREATE TRIGGER trg_after_student_grade_weights_change
    AFTER INSERT OR UPDATE OR DELETE
    ON public.student_grade_weights
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_grade_weights_change_and_recalc();

-- ----------------------------------------------------------------------------
-- 7. 改寫 public.calculate_student_grades()：支援個別自訂權重，移除 ABCD 等第
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_student_grades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_term_id UUID;
    v_att_w NUMERIC(5,2) := 20.00;
    v_quiz_w NUMERIC(5,2) := 15.00;
    v_mid_w NUMERIC(5,2) := 20.00;
    v_fin_w NUMERIC(5,2) := 20.00;
    v_hw_w NUMERIC(5,2) := 15.00;
    v_attit_w NUMERIC(5,2) := 10.00;
    v_calc_score NUMERIC(5,2);
BEGIN
    -- 1. 透過 classes 取得當前成績所屬學期 term_id
    SELECT c.term_id INTO v_term_id
    FROM public.classes c
    WHERE c.id = NEW.class_id;

    -- 2. 若存在學期，嘗試讀取該學生在該學期之個別權重設定
    IF v_term_id IS NOT NULL THEN
        SELECT 
            w.attendance_weight,
            w.quiz_weight,
            w.midterm_weight,
            w.final_weight,
            w.homework_weight,
            w.attitude_weight
        INTO 
            v_att_w,
            v_quiz_w,
            v_mid_w,
            v_fin_w,
            v_hw_w,
            v_attit_w
        FROM public.student_grade_weights w
        WHERE w.student_id = NEW.student_id
          AND w.term_id = v_term_id;

        -- 若無自訂紀錄，維持預設值 20/15/20/20/15/10
        IF NOT FOUND THEN
            v_att_w := 20.00;
            v_quiz_w := 15.00;
            v_mid_w := 20.00;
            v_fin_w := 20.00;
            v_hw_w := 15.00;
            v_attit_w := 10.00;
        END IF;
    END IF;

    -- 3. 計算數字總分（四捨五入至小數點後兩位，不變更六項原始分數）
    v_calc_score := ROUND(
        (
            COALESCE(NEW.attendance_score, 0) * (v_att_w / 100.0) +
            COALESCE(NEW.quiz_score, 0) * (v_quiz_w / 100.0) +
            COALESCE(NEW.midterm_score, 0) * (v_mid_w / 100.0) +
            COALESCE(NEW.final_score, 0) * (v_fin_w / 100.0) +
            COALESCE(NEW.homework_score, 0) * (v_hw_w / 100.0) +
            COALESCE(NEW.attitude_score, 0) * (v_attit_w / 100.0)
        )::NUMERIC,
        2
    );

    NEW.total_score := v_calc_score;
    NEW.is_passed := (v_calc_score >= 60.00);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.calculate_student_grades() IS '成績計算 Trigger 函式：優先讀取個別自訂權重，否則使用預設比例；完全移除 ABCD 英文等第';

-- ----------------------------------------------------------------------------
-- 8. RPC: set_student_grade_weights (單人設定權重)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade_weights(
    p_student_id UUID,
    p_term_id UUID,
    p_attendance_weight NUMERIC,
    p_quiz_weight NUMERIC,
    p_midterm_weight NUMERIC,
    p_final_weight NUMERIC,
    p_homework_weight NUMERIC,
    p_attitude_weight NUMERIC,
    p_change_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_is_locked BOOLEAN;
    v_term_found BOOLEAN := FALSE;
    v_has_enrollment BOOLEAN := FALSE;
    v_result_id UUID;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION '未登入或憑證無效';
    END IF;

    -- 權限驗證：必須為啟用中的 ADMIN
    SELECT (role = 'ADMIN' AND is_active = true) INTO v_is_admin
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
        RAISE EXCEPTION '權限不足：只有啟用中的系統管理員可以設定自訂權重';
    END IF;

    -- 檢查基本參數
    IF p_student_id IS NULL THEN
        RAISE EXCEPTION '學生代碼 (student_id) 不可為 NULL';
    END IF;

    IF p_term_id IS NULL THEN
        RAISE EXCEPTION '學期代碼 (term_id) 不可為 NULL';
    END IF;

    IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
        RAISE EXCEPTION '必須填寫權重調整原因';
    END IF;

    -- 六項權重數值逐項驗證：不可為 NULL、介於 0~100、總和嚴格等於 100
    IF p_attendance_weight IS NULL OR p_attendance_weight < 0.00 OR p_attendance_weight > 100.00 THEN
        RAISE EXCEPTION '出席權重 (attendance_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_quiz_weight IS NULL OR p_quiz_weight < 0.00 OR p_quiz_weight > 100.00 THEN
        RAISE EXCEPTION '小考權重 (quiz_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_midterm_weight IS NULL OR p_midterm_weight < 0.00 OR p_midterm_weight > 100.00 THEN
        RAISE EXCEPTION '期中考權重 (midterm_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_final_weight IS NULL OR p_final_weight < 0.00 OR p_final_weight > 100.00 THEN
        RAISE EXCEPTION '期末考權重 (final_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_homework_weight IS NULL OR p_homework_weight < 0.00 OR p_homework_weight > 100.00 THEN
        RAISE EXCEPTION '作業權重 (homework_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_attitude_weight IS NULL OR p_attitude_weight < 0.00 OR p_attitude_weight > 100.00 THEN
        RAISE EXCEPTION '課堂表現權重 (attitude_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;

    IF (p_attendance_weight + p_quiz_weight + p_midterm_weight + p_final_weight + p_homework_weight + p_attitude_weight) <> 100.00 THEN
        RAISE EXCEPTION '六項成績權重總和必須嚴格等於 100 (目前合計: %)', 
            (p_attendance_weight + p_quiz_weight + p_midterm_weight + p_final_weight + p_homework_weight + p_attitude_weight);
    END IF;

    -- 檢查學期存在與鎖定狀態
    SELECT is_locked, TRUE INTO v_is_locked, v_term_found
    FROM public.terms
    WHERE id = p_term_id
    FOR SHARE;

    IF NOT v_term_found OR v_is_locked IS NULL THEN
        RAISE EXCEPTION '指定的學期不存在 (term_id: %)', p_term_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION '該學期已結算鎖定，禁止修改權重 (term_id: %)', p_term_id;
    END IF;

    -- 驗證學生在該學期確實有修課紀錄
    SELECT EXISTS (
        SELECT 1 
        FROM public.class_students cs
        JOIN public.classes c ON c.id = cs.class_id
        WHERE cs.student_id = p_student_id
          AND c.term_id = p_term_id
    ) INTO v_has_enrollment;

    IF NOT v_has_enrollment THEN
        RAISE EXCEPTION '學生 (ID: %) 在該學期查無任何修課紀錄，無法自訂權重', p_student_id;
    END IF;

    -- 傳遞稽核原因給 Session Context
    PERFORM set_config('app.current_weight_change_reason', trim(p_change_reason), true);

    -- 執行 INSERT 或 UPDATE；若六項權重數值均無變更 (IS NOT DISTINCT FROM)，不更新且不重複觸發稽核
    INSERT INTO public.student_grade_weights (
        student_id,
        term_id,
        attendance_weight,
        quiz_weight,
        midterm_weight,
        final_weight,
        homework_weight,
        attitude_weight,
        updated_at
    ) VALUES (
        p_student_id,
        p_term_id,
        p_attendance_weight,
        p_quiz_weight,
        p_midterm_weight,
        p_final_weight,
        p_homework_weight,
        p_attitude_weight,
        timezone('utc'::text, now())
    )
    ON CONFLICT (student_id, term_id) DO UPDATE
    SET 
        attendance_weight = EXCLUDED.attendance_weight,
        quiz_weight = EXCLUDED.quiz_weight,
        midterm_weight = EXCLUDED.midterm_weight,
        final_weight = EXCLUDED.final_weight,
        homework_weight = EXCLUDED.homework_weight,
        attitude_weight = EXCLUDED.attitude_weight,
        updated_at = timezone('utc'::text, now())
    WHERE (
        student_grade_weights.attendance_weight IS DISTINCT FROM EXCLUDED.attendance_weight OR
        student_grade_weights.quiz_weight IS DISTINCT FROM EXCLUDED.quiz_weight OR
        student_grade_weights.midterm_weight IS DISTINCT FROM EXCLUDED.midterm_weight OR
        student_grade_weights.final_weight IS DISTINCT FROM EXCLUDED.final_weight OR
        student_grade_weights.homework_weight IS DISTINCT FROM EXCLUDED.homework_weight OR
        student_grade_weights.attitude_weight IS DISTINCT FROM EXCLUDED.attitude_weight
    )
    RETURNING id INTO v_result_id;

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'term_id', p_term_id,
        'modified', (v_result_id IS NOT NULL)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: apply_batch_grade_weights (批量設定權重，全有全無，最多 500 人)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_batch_grade_weights(
    p_student_ids UUID[],
    p_term_id UUID,
    p_attendance_weight NUMERIC,
    p_quiz_weight NUMERIC,
    p_midterm_weight NUMERIC,
    p_final_weight NUMERIC,
    p_homework_weight NUMERIC,
    p_attitude_weight NUMERIC,
    p_change_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_is_locked BOOLEAN;
    v_term_found BOOLEAN := FALSE;
    v_student_count INTEGER;
    v_unique_count INTEGER;
    v_invalid_student_id UUID;
    v_applied_count INTEGER := 0;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION '未登入或憑證無效';
    END IF;

    -- 權限驗證
    SELECT (role = 'ADMIN' AND is_active = true) INTO v_is_admin
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
        RAISE EXCEPTION '權限不足：只有啟用中的系統管理員可以批量設定權重';
    END IF;

    -- 1. 學生陣列基礎檢驗：不可為 NULL、不可為空、不可包含 NULL UUID、1~500 人
    IF p_student_ids IS NULL THEN
        RAISE EXCEPTION '學生名單 (p_student_ids) 不可為 NULL';
    END IF;

    v_student_count := array_length(p_student_ids, 1);
    IF v_student_count IS NULL OR v_student_count = 0 THEN
        RAISE EXCEPTION '未指定任何學生 (名單不可為空)';
    END IF;

    IF v_student_count > 500 THEN
        RAISE EXCEPTION '單次批量設定上限為 500 人 (目前指定: % 人)', v_student_count;
    END IF;

    -- 檢查是否包含 NULL UUID
    IF EXISTS (
        SELECT 1 FROM unnest(p_student_ids) AS sid WHERE sid IS NULL
    ) THEN
        RAISE EXCEPTION '學生名單陣列中包含無效的空值 (NULL UUID)';
    END IF;

    -- 檢查重複 UUID
    SELECT count(DISTINCT sid) INTO v_unique_count
    FROM unnest(p_student_ids) AS sid;

    IF v_unique_count <> v_student_count THEN
        RAISE EXCEPTION '學生名單包含重複的學生代碼 (總數: %, 唯一數: %)，請移除重複項', v_student_count, v_unique_count;
    END IF;

    -- 原因檢查
    IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
        RAISE EXCEPTION '必須填寫批量設定原因';
    END IF;

    -- 2. 六項權重數值逐項驗證：不可為 NULL、介於 0~100、總和嚴格等於 100
    IF p_attendance_weight IS NULL OR p_attendance_weight < 0.00 OR p_attendance_weight > 100.00 THEN
        RAISE EXCEPTION '出席權重 (attendance_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_quiz_weight IS NULL OR p_quiz_weight < 0.00 OR p_quiz_weight > 100.00 THEN
        RAISE EXCEPTION '小考權重 (quiz_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_midterm_weight IS NULL OR p_midterm_weight < 0.00 OR p_midterm_weight > 100.00 THEN
        RAISE EXCEPTION '期中考權重 (midterm_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_final_weight IS NULL OR p_final_weight < 0.00 OR p_final_weight > 100.00 THEN
        RAISE EXCEPTION '期末考權重 (final_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_homework_weight IS NULL OR p_homework_weight < 0.00 OR p_homework_weight > 100.00 THEN
        RAISE EXCEPTION '作業權重 (homework_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;
    IF p_attitude_weight IS NULL OR p_attitude_weight < 0.00 OR p_attitude_weight > 100.00 THEN
        RAISE EXCEPTION '課堂表現權重 (attitude_weight) 不可為空且必須介於 0 至 100 之間';
    END IF;

    IF (p_attendance_weight + p_quiz_weight + p_midterm_weight + p_final_weight + p_homework_weight + p_attitude_weight) <> 100.00 THEN
        RAISE EXCEPTION '六項成績權重總和必須嚴格等於 100 (目前合計: %)', 
            (p_attendance_weight + p_quiz_weight + p_midterm_weight + p_final_weight + p_homework_weight + p_attitude_weight);
    END IF;

    -- 檢查學期存在與鎖定
    IF p_term_id IS NULL THEN
        RAISE EXCEPTION '學期代碼 (term_id) 不可為 NULL';
    END IF;

    SELECT is_locked, TRUE INTO v_is_locked, v_term_found
    FROM public.terms
    WHERE id = p_term_id
    FOR SHARE;

    IF NOT v_term_found OR v_is_locked IS NULL THEN
        RAISE EXCEPTION '指定的學期不存在 (term_id: %)', p_term_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION '該學期已結算鎖定，禁止批量修改權重 (term_id: %)', p_term_id;
    END IF;

    -- 3. 驗證「所有」學生均在該學期有修課紀錄（全有全無）
    SELECT sid INTO v_invalid_student_id
    FROM unnest(p_student_ids) AS sid
    WHERE NOT EXISTS (
        SELECT 1 
        FROM public.class_students cs
        JOIN public.classes c ON c.id = cs.class_id
        WHERE cs.student_id = sid
          AND c.term_id = p_term_id
    )
    LIMIT 1;

    IF v_invalid_student_id IS NOT NULL THEN
        RAISE EXCEPTION '學生 (ID: %) 在該學期沒有任何修課紀錄，批量操作已全部取消', v_invalid_student_id;
    END IF;

    -- 設定稽核原因
    PERFORM set_config('app.current_weight_change_reason', trim(p_change_reason), true);

    -- 批量 INSERT / UPDATE（僅在六項權重有實質差異時更新）
    WITH inserted AS (
        INSERT INTO public.student_grade_weights (
            student_id,
            term_id,
            attendance_weight,
            quiz_weight,
            midterm_weight,
            final_weight,
            homework_weight,
            attitude_weight,
            updated_at
        )
        SELECT 
            sid,
            p_term_id,
            p_attendance_weight,
            p_quiz_weight,
            p_midterm_weight,
            p_final_weight,
            p_homework_weight,
            p_attitude_weight,
            timezone('utc'::text, now())
        FROM unnest(p_student_ids) AS sid
        ON CONFLICT (student_id, term_id) DO UPDATE
        SET 
            attendance_weight = EXCLUDED.attendance_weight,
            quiz_weight = EXCLUDED.quiz_weight,
            midterm_weight = EXCLUDED.midterm_weight,
            final_weight = EXCLUDED.final_weight,
            homework_weight = EXCLUDED.homework_weight,
            attitude_weight = EXCLUDED.attitude_weight,
            updated_at = timezone('utc'::text, now())
        WHERE (
            student_grade_weights.attendance_weight IS DISTINCT FROM EXCLUDED.attendance_weight OR
            student_grade_weights.quiz_weight IS DISTINCT FROM EXCLUDED.quiz_weight OR
            student_grade_weights.midterm_weight IS DISTINCT FROM EXCLUDED.midterm_weight OR
            student_grade_weights.final_weight IS DISTINCT FROM EXCLUDED.final_weight OR
            student_grade_weights.homework_weight IS DISTINCT FROM EXCLUDED.homework_weight OR
            student_grade_weights.attitude_weight IS DISTINCT FROM EXCLUDED.attitude_weight
        )
        RETURNING id
    )
    SELECT count(*) INTO v_applied_count FROM inserted;

    RETURN jsonb_build_object(
        'success', true,
        'total_requested', v_student_count,
        'actually_updated', v_applied_count,
        'term_id', p_term_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC: reset_student_grade_weights (單人恢復預設)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_student_grade_weights(
    p_student_id UUID,
    p_term_id UUID,
    p_change_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_is_locked BOOLEAN;
    v_term_found BOOLEAN := FALSE;
    v_deleted_count INTEGER := 0;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION '未登入或憑證無效';
    END IF;

    -- 權限驗證
    SELECT (role = 'ADMIN' AND is_active = true) INTO v_is_admin
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
        RAISE EXCEPTION '權限不足：只有啟用中的系統管理員可以重置權重';
    END IF;

    IF p_student_id IS NULL THEN
        RAISE EXCEPTION '學生代碼 (student_id) 不可為 NULL';
    END IF;

    IF p_term_id IS NULL THEN
        RAISE EXCEPTION '學期代碼 (term_id) 不可為 NULL';
    END IF;

    IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
        RAISE EXCEPTION '必須填寫恢復預設原因';
    END IF;

    -- 檢查學期存在與鎖定狀態
    SELECT is_locked, TRUE INTO v_is_locked, v_term_found
    FROM public.terms
    WHERE id = p_term_id
    FOR SHARE;

    IF NOT v_term_found OR v_is_locked IS NULL THEN
        RAISE EXCEPTION '指定的學期不存在 (term_id: %)', p_term_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION '該學期已結算鎖定，禁止恢復預設 (term_id: %)', p_term_id;
    END IF;

    -- 設定稽核原因
    PERFORM set_config('app.current_weight_change_reason', trim(p_change_reason), true);

    -- 刪除自訂紀錄（沿用 AFTER DELETE Trigger 自動觸發稽核與重算）
    -- 若無自訂紀錄，DELETE 影響為 0 筆，不觸發 Trigger，亦不額外重複重算
    WITH deleted AS (
        DELETE FROM public.student_grade_weights
        WHERE student_id = p_student_id
          AND term_id = p_term_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_count FROM deleted;

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'term_id', p_term_id,
        'was_customized', (v_deleted_count > 0)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. RPC: reset_batch_grade_weights (批量恢復預設，全有全無驗證，最多 500 人)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_batch_grade_weights(
    p_student_ids UUID[],
    p_term_id UUID,
    p_change_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_is_locked BOOLEAN;
    v_term_found BOOLEAN := FALSE;
    v_student_count INTEGER;
    v_unique_count INTEGER;
    v_invalid_student_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION '未登入或憑證無效';
    END IF;

    -- 權限驗證
    SELECT (role = 'ADMIN' AND is_active = true) INTO v_is_admin
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
        RAISE EXCEPTION '權限不足：只有啟用中的系統管理員可以批量重置權重';
    END IF;

    -- 1. 學生陣列基礎檢驗：不可為 NULL、不可為空、不可包含 NULL UUID、1~500 人
    IF p_student_ids IS NULL THEN
        RAISE EXCEPTION '學生名單 (p_student_ids) 不可為 NULL';
    END IF;

    v_student_count := array_length(p_student_ids, 1);
    IF v_student_count IS NULL OR v_student_count = 0 THEN
        RAISE EXCEPTION '未指定任何學生 (名單不可為空)';
    END IF;

    IF v_student_count > 500 THEN
        RAISE EXCEPTION '單次批量重置上限為 500 人 (目前指定: % 人)', v_student_count;
    END IF;

    -- 檢查是否包含 NULL UUID
    IF EXISTS (
        SELECT 1 FROM unnest(p_student_ids) AS sid WHERE sid IS NULL
    ) THEN
        RAISE EXCEPTION '學生名單陣列中包含無效的空值 (NULL UUID)';
    END IF;

    -- 檢查重複 UUID
    SELECT count(DISTINCT sid) INTO v_unique_count
    FROM unnest(p_student_ids) AS sid;

    IF v_unique_count <> v_student_count THEN
        RAISE EXCEPTION '學生名單包含重複的學生代碼 (總數: %, 唯一數: %)，請移除重複項', v_student_count, v_unique_count;
    END IF;

    -- 檢查原因
    IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
        RAISE EXCEPTION '必須填寫批量恢復原因';
    END IF;

    -- 檢查學期存在與鎖定
    IF p_term_id IS NULL THEN
        RAISE EXCEPTION '學期代碼 (term_id) 不可為 NULL';
    END IF;

    SELECT is_locked, TRUE INTO v_is_locked, v_term_found
    FROM public.terms
    WHERE id = p_term_id
    FOR SHARE;

    IF NOT v_term_found OR v_is_locked IS NULL THEN
        RAISE EXCEPTION '指定的學期不存在 (term_id: %)', p_term_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION '該學期已結算鎖定，禁止批量重置權重 (term_id: %)', p_term_id;
    END IF;

    -- 2. 驗證「所有」學生均在該學期有修課紀錄（全有全無）
    SELECT sid INTO v_invalid_student_id
    FROM unnest(p_student_ids) AS sid
    WHERE NOT EXISTS (
        SELECT 1 
        FROM public.class_students cs
        JOIN public.classes c ON c.id = cs.class_id
        WHERE cs.student_id = sid
          AND c.term_id = p_term_id
    )
    LIMIT 1;

    IF v_invalid_student_id IS NOT NULL THEN
        RAISE EXCEPTION '學生 (ID: %) 在該學期沒有任何修課紀錄，批量重置操作已全部取消', v_invalid_student_id;
    END IF;

    -- 設定稽核原因
    PERFORM set_config('app.current_weight_change_reason', trim(p_change_reason), true);

    -- 僅刪除真正存在自訂紀錄的學生
    -- AFTER DELETE Trigger 會精確對實際刪除的每一筆紀錄觸發稽核與重算
    WITH deleted AS (
        DELETE FROM public.student_grade_weights
        WHERE term_id = p_term_id
          AND student_id = ANY(p_student_ids)
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_count FROM deleted;

    RETURN jsonb_build_object(
        'success', true,
        'total_requested', v_student_count,
        'actually_reset', v_deleted_count,
        'term_id', p_term_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. RLS 安全防護與權限設定（嚴格禁止直接寫入權重表，僅開放 SELECT 與 RPC）
-- ----------------------------------------------------------------------------

-- 啟用 RLS
ALTER TABLE public.student_grade_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_grade_weight_audit_logs ENABLE ROW LEVEL SECURITY;

-- 清除舊 Policy
DROP POLICY IF EXISTS "admin_manage_student_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "admin_view_student_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "teacher_view_student_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "student_view_own_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "admin_view_grade_weight_audit_logs" ON public.student_grade_weight_audit_logs;

-- Policy 1: ADMIN 僅限 SELECT 查看所有學生之自訂權重
CREATE POLICY "admin_view_student_grade_weights"
ON public.student_grade_weights
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.is_active = true
    )
);

-- Policy 2: TEACHER 僅限 SELECT 查看自己任教班級學生之自訂權重（必須為啟用中 TEACHER，禁止修改）
CREATE POLICY "teacher_view_student_grade_weights"
ON public.student_grade_weights
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 
        FROM public.profiles p
        JOIN public.teachers t ON t.profile_id = p.id
        JOIN public.classes c ON c.teacher_id = t.id
        JOIN public.class_students cs ON cs.class_id = c.id
        WHERE p.id = auth.uid()
          AND p.role = 'TEACHER'
          AND p.is_active = true
          AND cs.student_id = student_grade_weights.student_id
          AND c.term_id = student_grade_weights.term_id
    )
);

-- Policy 3: ADMIN 可 SELECT 查看稽核日誌
CREATE POLICY "admin_view_grade_weight_audit_logs"
ON public.student_grade_weight_audit_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.is_active = true
    )
);

-- 表格權限設定：
-- 1. 撤銷所有角色對權重表與稽核表的所有權限
REVOKE ALL ON TABLE public.student_grade_weights FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_grade_weight_audit_logs FROM PUBLIC, anon, authenticated;

-- 2. 僅授予 authenticated 角色 SELECT 讀取權限（禁止直接 INSERT/UPDATE/DELETE）
GRANT SELECT ON public.student_grade_weights TO authenticated;
GRANT SELECT ON public.student_grade_weight_audit_logs TO authenticated;

-- 函式 EXECUTE 授權管理：
-- 1. 撤銷 PUBLIC、anon、authenticated 對內部輔助與 Trigger 函式的直接呼叫權限
REVOKE ALL ON FUNCTION public.recalculate_student_grades_for_term(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_term_lock_on_weights() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_grade_weights_change_and_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_student_grades() FROM PUBLIC, anon, authenticated;

-- 2. 授予 authenticated 角色執行四個對外 RPC（內部已嚴格校驗啟用中 ADMIN 與學期鎖定）
GRANT EXECUTE ON FUNCTION public.set_student_grade_weights(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_batch_grade_weights(UUID[], UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_student_grade_weights(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_batch_grade_weights(UUID[], UUID, TEXT) TO authenticated;

COMMIT;
