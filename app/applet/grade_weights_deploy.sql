-- ==============================================================================
-- 靜宜大學華語中心：學生個別自訂六項成績權重 正式部署 SQL (grade_weights_deploy.sql)
-- 版本：v6.5 Final
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. 建立學生成績個別權重資料表 (public.student_grade_weights)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_grade_weights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
    attendance_weight numeric(5,2) NOT NULL DEFAULT 20.00,
    quiz_weight numeric(5,2) NOT NULL DEFAULT 15.00,
    midterm_weight numeric(5,2) NOT NULL DEFAULT 20.00,
    final_weight numeric(5,2) NOT NULL DEFAULT 20.00,
    homework_weight numeric(5,2) NOT NULL DEFAULT 15.00,
    attitude_weight numeric(5,2) NOT NULL DEFAULT 10.00,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_student_grade_weights_student_term UNIQUE (student_id, term_id),
    CONSTRAINT chk_attendance_weight_range CHECK (attendance_weight >= 0.00 AND attendance_weight <= 100.00),
    CONSTRAINT chk_quiz_weight_range CHECK (quiz_weight >= 0.00 AND quiz_weight <= 100.00),
    CONSTRAINT chk_midterm_weight_range CHECK (midterm_weight >= 0.00 AND midterm_weight <= 100.00),
    CONSTRAINT chk_final_weight_range CHECK (final_weight >= 0.00 AND final_weight <= 100.00),
    CONSTRAINT chk_homework_weight_range CHECK (homework_weight >= 0.00 AND homework_weight <= 100.00),
    CONSTRAINT chk_attitude_weight_range CHECK (attitude_weight >= 0.00 AND attitude_weight <= 100.00),
    CONSTRAINT chk_grade_weights_sum_100 CHECK (
        (attendance_weight + quiz_weight + midterm_weight + final_weight + homework_weight + attitude_weight) = 100.00
    )
);

CREATE INDEX IF NOT EXISTS idx_student_grade_weights_lookup 
ON public.student_grade_weights(student_id, term_id);

-- ------------------------------------------------------------------------------
-- 2. 建立權重變更安全稽核日誌資料表 (public.student_grade_weight_audit_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_grade_weight_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    weight_id uuid,
    student_id uuid NOT NULL,
    term_id uuid NOT NULL,
    operator_id uuid,
    action varchar(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_weights jsonb,
    new_weights jsonb,
    change_reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_weight_audit_logs_student_term 
ON public.student_grade_weight_audit_logs(student_id, term_id);

CREATE INDEX IF NOT EXISTS idx_weight_audit_logs_created_at 
ON public.student_grade_weight_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. 更新 public.calculate_student_grades()
--    - 讀取個別權重；查無記錄則套用 20/15/20/20/15/10
--    - 徹底移除所有 A+、A...F 等第判斷與賦值
--    - 嚴格保留原始六項分數、total_score 與 is_passed
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_student_grades()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_term_id uuid;
  v_attendance_weight numeric := 20.00;
  v_quiz_weight numeric := 15.00;
  v_midterm_weight numeric := 20.00;
  v_final_weight numeric := 20.00;
  v_homework_weight numeric := 15.00;
  v_attitude_weight numeric := 10.00;
  v_total numeric;
BEGIN
  -- 1. 由班級關聯取得所屬學期 term_id
  IF NEW.class_id IS NOT NULL THEN
    SELECT c.term_id INTO v_term_id
    FROM public.classes c
    WHERE c.id = NEW.class_id;
  END IF;

  -- 2. 若存在學期與學生 ID，查詢是否有個別自訂權重
  IF v_term_id IS NOT NULL AND NEW.student_id IS NOT NULL THEN
    SELECT 
      w.attendance_weight,
      w.quiz_weight,
      w.midterm_weight,
      w.final_weight,
      w.homework_weight,
      w.attitude_weight
    INTO 
      v_attendance_weight,
      v_quiz_weight,
      v_midterm_weight,
      v_final_weight,
      v_homework_weight,
      v_attitude_weight
    FROM public.student_grade_weights w
    WHERE w.student_id = NEW.student_id
      AND w.term_id = v_term_id;

    -- 若查無自訂記錄，COALESCE 確保使用預設比例
    v_attendance_weight := COALESCE(v_attendance_weight, 20.00);
    v_quiz_weight       := COALESCE(v_quiz_weight, 15.00);
    v_midterm_weight    := COALESCE(v_midterm_weight, 20.00);
    v_final_weight      := COALESCE(v_final_weight, 20.00);
    v_homework_weight   := COALESCE(v_homework_weight, 15.00);
    v_attitude_weight   := COALESCE(v_attitude_weight, 10.00);
  END IF;

  -- 3. 計算總分 total_score（各項權重合計為 100，除以 100.0 後四捨五入至小數點後兩位）
  v_total := ROUND(
    (COALESCE(NEW.attendance_score, 0) * v_attendance_weight +
     COALESCE(NEW.quiz_score, 0)       * v_quiz_weight +
     COALESCE(NEW.midterm_score, 0)    * v_midterm_weight +
     COALESCE(NEW.final_score, 0)      * v_final_weight +
     COALESCE(NEW.homework_score, 0)   * v_homework_weight +
     COALESCE(NEW.attitude_score, 0)   * v_attitude_weight) / 100.0
  , 2);

  NEW.total_score := v_total;

  -- 4. 計算及格狀態 is_passed（總分 >= 60 及格）
  NEW.is_passed := (v_total >= 60.0);

  -- 5. 不再設定 NEW.grade_letter，更新時間戳記
  NEW.updated_at := clock_timestamp();

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4. 安全移除 student_grades.grade_letter 欄位
--    - 嚴格不使用 DROP CASCADE
--    - 事前檢查是否有非預期的 View 直接相依此欄位
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dependent_view text;
BEGIN
  -- 檢查是否有 View 相依此欄位
  SELECT c.relname INTO v_dependent_view
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class c ON c.oid = r.ev_class
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refobjid = 'public.student_grades'::regclass
    AND a.attname = 'grade_letter'
    AND c.relkind = 'v'
  LIMIT 1;

  IF v_dependent_view IS NOT NULL THEN
    RAISE EXCEPTION '檢測到 View [%] 相依於 student_grades.grade_letter，請先調整 View 定義再執行刪除！', v_dependent_view;
  END IF;

  -- 無相依視圖時，以無 CASCADE 方式安全移除欄位
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'student_grades' 
      AND column_name = 'grade_letter'
  ) THEN
    ALTER TABLE public.student_grades DROP COLUMN grade_letter;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. 建立學期封存鎖定驗證 Trigger (check_term_lock_on_weights)
--    - 採用 FOR SHARE 資料列鎖定
--    - 查無學期或鎖定狀態為 NULL 時立即 RAISE EXCEPTION 拒絕操作
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_term_lock_on_weights()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_term_id uuid;
  v_is_locked boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_term_id := OLD.term_id;
  ELSE
    v_term_id := NEW.term_id;
  END IF;

  -- 資料列共享鎖定，防範學期狀態在交易中被並發修改
  SELECT is_locked INTO v_is_locked
  FROM public.terms
  WHERE id = v_term_id
  FOR SHARE;

  -- 查無學期或鎖定狀態無法判定時拒絕操作
  IF v_is_locked IS NULL THEN
    RAISE EXCEPTION '指定的學期不存在或狀態無法判定 (term_id: %)', v_term_id;
  END IF;

  -- 學期已鎖定時禁止新增、修改或刪除
  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION '該學期已封存鎖定，禁止新增、修改或重置學生成績權重 (term_id: %)', v_term_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_term_lock_on_weights ON public.student_grade_weights;
CREATE TRIGGER trg_check_term_lock_on_weights
BEFORE INSERT OR UPDATE OR DELETE ON public.student_grade_weights
FOR EACH ROW
EXECUTE FUNCTION public.check_term_lock_on_weights();

-- ------------------------------------------------------------------------------
-- 6. 建立權重變更稽核日誌 Trigger (log_student_grade_weight_changes)
--    - 嚴格要求操作原因，無實質變更略過記錄
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_student_grade_weight_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reason text;
  v_operator_id uuid;
BEGIN
  -- 若為 UPDATE 且六項權重無任何實質變更，則略過稽核記錄
  IF TG_OP = 'UPDATE' THEN
    IF OLD.attendance_weight = NEW.attendance_weight AND
       OLD.quiz_weight = NEW.quiz_weight AND
       OLD.midterm_weight = NEW.midterm_weight AND
       OLD.final_weight = NEW.final_weight AND
       OLD.homework_weight = NEW.homework_weight AND
       OLD.attitude_weight = NEW.attitude_weight THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 取得並驗證 session 變更原因（由 RPC 傳入 set_config）
  v_reason := NULLIF(trim(current_setting('school.current_change_reason', true)), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION '變更學生成績權重時必須提供有效的變更原因說明 (p_change_reason)';
  END IF;

  v_operator_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.student_grade_weight_audit_logs (
      weight_id,
      student_id,
      term_id,
      operator_id,
      action,
      old_weights,
      new_weights,
      change_reason,
      created_at
    ) VALUES (
      NEW.id,
      NEW.student_id,
      NEW.term_id,
      v_operator_id,
      'INSERT',
      NULL,
      jsonb_build_object(
        'attendance_weight', NEW.attendance_weight,
        'quiz_weight', NEW.quiz_weight,
        'midterm_weight', NEW.midterm_weight,
        'final_weight', NEW.final_weight,
        'homework_weight', NEW.homework_weight,
        'attitude_weight', NEW.attitude_weight
      ),
      v_reason,
      clock_timestamp()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.student_grade_weight_audit_logs (
      weight_id,
      student_id,
      term_id,
      operator_id,
      action,
      old_weights,
      new_weights,
      change_reason,
      created_at
    ) VALUES (
      NEW.id,
      NEW.student_id,
      NEW.term_id,
      v_operator_id,
      'UPDATE',
      jsonb_build_object(
        'attendance_weight', OLD.attendance_weight,
        'quiz_weight', OLD.quiz_weight,
        'midterm_weight', OLD.midterm_weight,
        'final_weight', OLD.final_weight,
        'homework_weight', OLD.homework_weight,
        'attitude_weight', OLD.attitude_weight
      ),
      jsonb_build_object(
        'attendance_weight', NEW.attendance_weight,
        'quiz_weight', NEW.quiz_weight,
        'midterm_weight', NEW.midterm_weight,
        'final_weight', NEW.final_weight,
        'homework_weight', NEW.homework_weight,
        'attitude_weight', NEW.attitude_weight
      ),
      v_reason,
      clock_timestamp()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.student_grade_weight_audit_logs (
      weight_id,
      student_id,
      term_id,
      operator_id,
      action,
      old_weights,
      new_weights,
      change_reason,
      created_at
    ) VALUES (
      OLD.id,
      OLD.student_id,
      OLD.term_id,
      v_operator_id,
      'DELETE',
      jsonb_build_object(
        'attendance_weight', OLD.attendance_weight,
        'quiz_weight', OLD.quiz_weight,
        'midterm_weight', OLD.midterm_weight,
        'final_weight', OLD.final_weight,
        'homework_weight', OLD.homework_weight,
        'attitude_weight', OLD.attitude_weight
      ),
      jsonb_build_object(
        'attendance_weight', 20.00,
        'quiz_weight', 15.00,
        'midterm_weight', 20.00,
        'final_weight', 20.00,
        'homework_weight', 15.00,
        'attitude_weight', 10.00
      ),
      v_reason,
      clock_timestamp()
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_student_grade_weight_changes ON public.student_grade_weights;
CREATE TRIGGER trg_log_student_grade_weight_changes
AFTER INSERT OR UPDATE OR DELETE ON public.student_grade_weights
FOR EACH ROW
EXECUTE FUNCTION public.log_student_grade_weight_changes();

-- ------------------------------------------------------------------------------
-- 7. 單一重算機制：透過既有 trg_calc_student_grades Trigger 重算學期成績
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_student_grades_for_term(
  p_student_id uuid,
  p_term_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- 僅更新 student_grades.updated_at，直接觸發既有的 BEFORE UPDATE Trigger (trg_calc_student_grades)
  -- 嚴格不變更 attendance_score 等六項原始分數
  UPDATE public.student_grades sg
  SET updated_at = clock_timestamp()
  FROM public.classes c
  WHERE sg.class_id = c.id
    AND c.term_id = p_term_id
    AND sg.student_id = p_student_id;
END;
$function$;

-- 權重異動後自動觸發成績重算 Trigger
CREATE OR REPLACE FUNCTION public.trg_after_weight_change_recalculate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid;
  v_term_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
    v_term_id := OLD.term_id;
  ELSE
    v_student_id := NEW.student_id;
    v_term_id := NEW.term_id;
  END IF;

  PERFORM public.recalculate_student_grades_for_term(v_student_id, v_term_id);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_weight_change_recalc ON public.student_grade_weights;
CREATE TRIGGER trg_weight_change_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.student_grade_weights
FOR EACH ROW
EXECUTE FUNCTION public.trg_after_weight_change_recalculate();

-- ------------------------------------------------------------------------------
-- 8. SECURITY DEFINER RPC 1: 單人設定自訂權重 (set_student_grade_weights)
--    - 嚴格要求啟用中 ADMIN 權限
--    - 使用 IS DISTINCT FROM：當六項全部相同時不 UPDATE，不觸發稽核或重算
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade_weights(
  p_student_id uuid,
  p_term_id uuid,
  p_attendance_weight numeric,
  p_quiz_weight numeric,
  p_midterm_weight numeric,
  p_final_weight numeric,
  p_homework_weight numeric,
  p_attitude_weight numeric,
  p_change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_locked boolean;
  v_sum numeric;
  v_rows_affected integer;
BEGIN
  -- 1. 權限檢查：必須為啟用中的 ADMIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION '權限不足：只有啟用中的系統管理員 (ADMIN) 可以修改學生成績權重';
  END IF;

  -- 2. 參數非空檢查
  IF p_student_id IS NULL OR p_term_id IS NULL THEN
    RAISE EXCEPTION '學生 ID (p_student_id) 與學期 ID (p_term_id) 不能為 NULL';
  END IF;

  IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
    RAISE EXCEPTION '變更學生成績權重時必須提供有效的變更原因說明 (p_change_reason)';
  END IF;

  IF p_attendance_weight IS NULL OR p_quiz_weight IS NULL OR 
     p_midterm_weight IS NULL OR p_final_weight IS NULL OR 
     p_homework_weight IS NULL OR p_attitude_weight IS NULL THEN
    RAISE EXCEPTION '六項成績權重皆不能為 NULL';
  END IF;

  -- 3. 權重範圍 (0~100) 檢查
  IF p_attendance_weight < 0 OR p_attendance_weight > 100 OR
     p_quiz_weight < 0 OR p_quiz_weight > 100 OR
     p_midterm_weight < 0 OR p_midterm_weight > 100 OR
     p_final_weight < 0 OR p_final_weight > 100 OR
     p_homework_weight < 0 OR p_homework_weight > 100 OR
     p_attitude_weight < 0 OR p_attitude_weight > 100 THEN
    RAISE EXCEPTION '各項成績權重必須介於 0 到 100 之間';
  END IF;

  -- 4. 權重總和 100% 檢查
  v_sum := p_attendance_weight + p_quiz_weight + p_midterm_weight + 
           p_final_weight + p_homework_weight + p_attitude_weight;
  IF v_sum <> 100.00 THEN
    RAISE EXCEPTION '六項成績權重總和必須嚴格等於 100%% (目前總和: %)', v_sum;
  END IF;

  -- 5. 學期鎖定檢查（FOR SHARE 鎖定資料列）
  SELECT is_locked INTO v_is_locked
  FROM public.terms
  WHERE id = p_term_id
  FOR SHARE;

  IF v_is_locked IS NULL THEN
    RAISE EXCEPTION '指定的學期不存在或狀態無法判定 (term_id: %)', p_term_id;
  END IF;

  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION '該學期已封存鎖定，禁止修改學生成績權重';
  END IF;

  -- 6. 驗證該學生於指定學期中具備修課紀錄
  IF NOT EXISTS (
    SELECT 1 
    FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = p_student_id
      AND c.term_id = p_term_id
  ) THEN
    RAISE EXCEPTION '該學生於指定學期中查無修課紀錄，無法設定個別權重';
  END IF;

  -- 7. 設定變更原因至 session 變數以供稽核 Trigger 讀取
  PERFORM set_config('school.current_change_reason', trim(p_change_reason), true);

  -- 8. UPSERT 自訂權重
  --    使用 IS DISTINCT FROM：當六項全部相同時不執行 UPDATE，不更動 updated_at，不觸發稽核或重算
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
    clock_timestamp()
  )
  ON CONFLICT (student_id, term_id)
  DO UPDATE SET
    attendance_weight = EXCLUDED.attendance_weight,
    quiz_weight       = EXCLUDED.quiz_weight,
    midterm_weight    = EXCLUDED.midterm_weight,
    final_weight      = EXCLUDED.final_weight,
    homework_weight   = EXCLUDED.homework_weight,
    attitude_weight   = EXCLUDED.attitude_weight,
    updated_at        = clock_timestamp()
  WHERE student_grade_weights.attendance_weight IS DISTINCT FROM EXCLUDED.attendance_weight
     OR student_grade_weights.quiz_weight       IS DISTINCT FROM EXCLUDED.quiz_weight
     OR student_grade_weights.midterm_weight    IS DISTINCT FROM EXCLUDED.midterm_weight
     OR student_grade_weights.final_weight      IS DISTINCT FROM EXCLUDED.final_weight
     OR student_grade_weights.homework_weight   IS DISTINCT FROM EXCLUDED.homework_weight
     OR student_grade_weights.attitude_weight   IS DISTINCT FROM EXCLUDED.attitude_weight;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE 
      WHEN v_rows_affected > 0 THEN '學生個別權重已成功設定並即時重算成績'
      ELSE '輸入之權重與既有設定完全相同，略過重算與稽核'
    END,
    'student_id', p_student_id,
    'term_id', p_term_id,
    'changed', (v_rows_affected > 0)
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 9. SECURITY DEFINER RPC 2: 批量設定自訂權重 (apply_batch_grade_weights)
--    - 嚴格要求啟用中 ADMIN 權限
--    - 單次上限 500 人、全有全無修課校驗、IS DISTINCT FROM 防護
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_batch_grade_weights(
  p_student_ids uuid[],
  p_term_id uuid,
  p_attendance_weight numeric,
  p_quiz_weight numeric,
  p_midterm_weight numeric,
  p_final_weight numeric,
  p_homework_weight numeric,
  p_attitude_weight numeric,
  p_change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_locked boolean;
  v_sum numeric;
  v_distinct_ids uuid[];
  v_invalid_ids uuid[];
  v_rows_affected integer;
BEGIN
  -- 1. 權限檢查：必須為啟用中的 ADMIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION '權限不足：只有啟用中的系統管理員 (ADMIN) 可以批量修改成績權重';
  END IF;

  -- 2. 批量名單驗證
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL OR array_length(p_student_ids, 1) = 0 THEN
    RAISE EXCEPTION '批量設定之學生命單不能為空';
  END IF;

  IF array_length(p_student_ids, 1) > 500 THEN
    RAISE EXCEPTION '單次批量操作最多支援 500 位學生 (傳入: % 人)', array_length(p_student_ids, 1);
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_student_ids) s_id WHERE s_id IS NULL) THEN
    RAISE EXCEPTION '學生命單中含有無效的 NULL 學生 ID';
  END IF;

  IF p_term_id IS NULL THEN
    RAISE EXCEPTION '學期 ID (p_term_id) 不能為 NULL';
  END IF;

  IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
    RAISE EXCEPTION '批量變更學生成績權重時必須提供有效的變更原因說明 (p_change_reason)';
  END IF;

  IF p_attendance_weight IS NULL OR p_quiz_weight IS NULL OR 
     p_midterm_weight IS NULL OR p_final_weight IS NULL OR 
     p_homework_weight IS NULL OR p_attitude_weight IS NULL THEN
    RAISE EXCEPTION '六項成績權重皆不能為 NULL';
  END IF;

  -- 3. 權重範圍 (0~100) 檢查
  IF p_attendance_weight < 0 OR p_attendance_weight > 100 OR
     p_quiz_weight < 0 OR p_quiz_weight > 100 OR
     p_midterm_weight < 0 OR p_midterm_weight > 100 OR
     p_final_weight < 0 OR p_final_weight > 100 OR
     p_homework_weight < 0 OR p_homework_weight > 100 OR
     p_attitude_weight < 0 OR p_attitude_weight > 100 THEN
    RAISE EXCEPTION '各項成績權重必須介於 0 到 100 之間';
  END IF;

  -- 4. 權重總和 100% 檢查
  v_sum := p_attendance_weight + p_quiz_weight + p_midterm_weight + 
           p_final_weight + p_homework_weight + p_attitude_weight;
  IF v_sum <> 100.00 THEN
    RAISE EXCEPTION '六項成績權重總和必須嚴格等於 100%% (目前總和: %)', v_sum;
  END IF;

  -- 5. 學期鎖定檢查
  SELECT is_locked INTO v_is_locked
  FROM public.terms
  WHERE id = p_term_id
  FOR SHARE;

  IF v_is_locked IS NULL THEN
    RAISE EXCEPTION '指定的學期不存在或狀態無法判定 (term_id: %)', p_term_id;
  END IF;

  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION '該學期已封存鎖定，禁止批量修改學生成績權重';
  END IF;

  -- 6. 去除重複學生 UUID
  SELECT array_agg(DISTINCT s_id) INTO v_distinct_ids
  FROM unnest(p_student_ids) s_id;

  -- 7. 嚴格驗證全體學生皆在該學期修課（全有全無原則）
  SELECT array_agg(d_id) INTO v_invalid_ids
  FROM unnest(v_distinct_ids) d_id
  WHERE NOT EXISTS (
    SELECT 1 
    FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = d_id
      AND c.term_id = p_term_id
  );

  IF v_invalid_ids IS NOT NULL AND array_length(v_invalid_ids, 1) > 0 THEN
    RAISE EXCEPTION '整批操作拒絕：以下學生在該學期查無修課紀錄: %', array_to_string(v_invalid_ids, ', ');
  END IF;

  -- 8. 設定變更原因至 session 變數
  PERFORM set_config('school.current_change_reason', trim(p_change_reason), true);

  -- 9. 批量 UPSERT
  --    使用 IS DISTINCT FROM：當六項全部相同時不執行 UPDATE，不觸發稽核與重算
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
    s_id,
    p_term_id,
    p_attendance_weight,
    p_quiz_weight,
    p_midterm_weight,
    p_final_weight,
    p_homework_weight,
    p_attitude_weight,
    clock_timestamp()
  FROM unnest(v_distinct_ids) s_id
  ON CONFLICT (student_id, term_id)
  DO UPDATE SET
    attendance_weight = EXCLUDED.attendance_weight,
    quiz_weight       = EXCLUDED.quiz_weight,
    midterm_weight    = EXCLUDED.midterm_weight,
    final_weight      = EXCLUDED.final_weight,
    homework_weight   = EXCLUDED.homework_weight,
    attitude_weight   = EXCLUDED.attitude_weight,
    updated_at        = clock_timestamp()
  WHERE student_grade_weights.attendance_weight IS DISTINCT FROM EXCLUDED.attendance_weight
     OR student_grade_weights.quiz_weight       IS DISTINCT FROM EXCLUDED.quiz_weight
     OR student_grade_weights.midterm_weight    IS DISTINCT FROM EXCLUDED.midterm_weight
     OR student_grade_weights.final_weight      IS DISTINCT FROM EXCLUDED.final_weight
     OR student_grade_weights.homework_weight   IS DISTINCT FROM EXCLUDED.homework_weight
     OR student_grade_weights.attitude_weight   IS DISTINCT FROM EXCLUDED.attitude_weight;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('已成功處理 %s 位學生，其中 %s 筆產生實質權重變更並即時重算', array_length(v_distinct_ids, 1), v_rows_affected),
    'student_count', array_length(v_distinct_ids, 1),
    'changed_count', v_rows_affected,
    'term_id', p_term_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 10. SECURITY DEFINER RPC 3: 單人恢復預設權重 (reset_student_grade_weights)
--     - 嚴格要求啟用中 ADMIN 權限
--     - 僅在實際 DELETE 時由 AFTER DELETE Trigger 自動重算；無記錄不額外呼叫重算
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_student_grade_weights(
  p_student_id uuid,
  p_term_id uuid,
  p_change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_locked boolean;
  v_deleted boolean;
BEGIN
  -- 1. 權限檢查：必須為啟用中的 ADMIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION '權限不足：只有啟用中的系統管理員 (ADMIN) 可以重置學生成績權重';
  END IF;

  -- 2. 參數非空檢查
  IF p_student_id IS NULL OR p_term_id IS NULL THEN
    RAISE EXCEPTION '學生 ID (p_student_id) 與學期 ID (p_term_id) 不能為 NULL';
  END IF;

  IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
    RAISE EXCEPTION '重置學生成績權重時必須提供有效的變更原因說明 (p_change_reason)';
  END IF;

  -- 3. 學期鎖定檢查
  SELECT is_locked INTO v_is_locked
  FROM public.terms
  WHERE id = p_term_id
  FOR SHARE;

  IF v_is_locked IS NULL THEN
    RAISE EXCEPTION '指定的學期不存在或狀態無法判定 (term_id: %)', p_term_id;
  END IF;

  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION '該學期已封存鎖定，禁止重置學生成績權重';
  END IF;

  -- 4. 設定變更原因至 session 變數以供稽核 Trigger 讀取
  PERFORM set_config('school.current_change_reason', trim(p_change_reason), true);

  -- 5. 刪除自訂權重記錄（DELETE 成功時由現有 AFTER DELETE Trigger 自動觸發重算與稽核）
  DELETE FROM public.student_grade_weights
  WHERE student_id = p_student_id
    AND term_id = p_term_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 6. 沒有自訂記錄時，不額外呼叫 recalculate_student_grades_for_term()

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE 
      WHEN v_deleted THEN '學生已恢復為全校標準預設權重 (20/15/20/20/15/10) 並完成重算'
      ELSE '該生原本即使用標準預設權重，未產生變更'
    END,
    'student_id', p_student_id,
    'term_id', p_term_id,
    'was_custom', v_deleted
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 11. SECURITY DEFINER RPC 4: 批量恢復預設權重 (reset_batch_grade_weights)
--     - 嚴格要求啟用中 ADMIN 權限
--     - 僅由 AFTER DELETE Trigger 針對實際刪除列重算；無多餘迴圈
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_batch_grade_weights(
  p_student_ids uuid[],
  p_term_id uuid,
  p_change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_locked boolean;
  v_distinct_ids uuid[];
  v_invalid_ids uuid[];
  v_deleted_count integer;
BEGIN
  -- 1. 權限檢查：必須為啟用中的 ADMIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION '權限不足：只有啟用中的系統管理員 (ADMIN) 可以批量重置學生成績權重';
  END IF;

  -- 2. 批量名單驗證
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL OR array_length(p_student_ids, 1) = 0 THEN
    RAISE EXCEPTION '批量重置之學生命單不能為空';
  END IF;

  IF array_length(p_student_ids, 1) > 500 THEN
    RAISE EXCEPTION '單次批量操作最多支援 500 位學生 (傳入: % 人)', array_length(p_student_ids, 1);
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_student_ids) s_id WHERE s_id IS NULL) THEN
    RAISE EXCEPTION '學生命單中含有無效的 NULL 學生 ID';
  END IF;

  IF p_term_id IS NULL THEN
    RAISE EXCEPTION '學期 ID (p_term_id) 不能為 NULL';
  END IF;

  IF p_change_reason IS NULL OR trim(p_change_reason) = '' THEN
    RAISE EXCEPTION '批量重置學生成績權重時必須提供有效的變更原因說明 (p_change_reason)';
  END IF;

  -- 3. 學期鎖定檢查
  SELECT is_locked INTO v_is_locked
  FROM public.terms
  WHERE id = p_term_id
  FOR SHARE;

  IF v_is_locked IS NULL THEN
    RAISE EXCEPTION '指定的學期不存在或狀態無法判定 (term_id: %)', p_term_id;
  END IF;

  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION '該學期已封存鎖定，禁止批量重置學生成績權重';
  END IF;

  -- 4. 去除重複學生 UUID
  SELECT array_agg(DISTINCT s_id) INTO v_distinct_ids
  FROM unnest(p_student_ids) s_id;

  -- 5. 嚴格驗證全體學生皆在該學期修課
  SELECT array_agg(d_id) INTO v_invalid_ids
  FROM unnest(v_distinct_ids) d_id
  WHERE NOT EXISTS (
    SELECT 1 
    FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = d_id
      AND c.term_id = p_term_id
  );

  IF v_invalid_ids IS NOT NULL AND array_length(v_invalid_ids, 1) > 0 THEN
    RAISE EXCEPTION '整批操作拒絕：以下學生在該學期查無修課紀錄: %', array_to_string(v_invalid_ids, ', ');
  END IF;

  -- 6. 設定變更原因至 session 變數
  PERFORM set_config('school.current_change_reason', trim(p_change_reason), true);

  -- 7. 執行批量刪除（DELETE 成功時由現有 AFTER DELETE Trigger 自動重算實際刪除之學生）
  DELETE FROM public.student_grade_weights
  WHERE term_id = p_term_id
    AND student_id = ANY(v_distinct_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 8. 僅由 AFTER DELETE Trigger 針對實際刪除的資料列自動重算

  RETURN jsonb_build_object(
    'success', true,
    'message', format('已成功處理 %s 位學生，其中 %s 筆自訂權重已刪除並自動重算', array_length(v_distinct_ids, 1), v_deleted_count),
    'total_requested', array_length(v_distinct_ids, 1),
    'deleted_custom_records', v_deleted_count,
    'term_id', p_term_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 12. 設定資料列級安全機制 (RLS) 與嚴格權限限制
-- ------------------------------------------------------------------------------
ALTER TABLE public.student_grade_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_grade_weight_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_weights_select ON public.student_grade_weights;
DROP POLICY IF EXISTS p_audit_logs_select ON public.student_grade_weight_audit_logs;

-- student_grade_weights SELECT Policy
CREATE POLICY p_weights_select ON public.student_grade_weights
FOR SELECT
TO authenticated
USING (
  -- 1. 啟用中的 ADMIN 可查看全校權重
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'ADMIN'
      AND p.is_active = true
  )
  OR
  -- 2. 啟用中的 TEACHER 僅可查看自己授課班級學生於該學期的權重
  EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.teachers t ON t.profile_id = p.id
    JOIN public.classes c ON c.teacher_id = t.id
    JOIN public.class_students cs ON cs.class_id = c.id
    WHERE p.id = auth.uid()
      AND p.role = 'TEACHER'
      AND p.is_active = true
      AND t.employment_status = 'ACTIVE'
      AND cs.student_id = student_grade_weights.student_id
      AND c.term_id = student_grade_weights.term_id
  )
);

-- student_grade_weight_audit_logs SELECT Policy (僅啟用中 ADMIN 可查閱)
CREATE POLICY p_audit_logs_select ON public.student_grade_weight_audit_logs
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

-- 撤銷資料表直接寫入權限，強制經由 RPC 執行
REVOKE INSERT, UPDATE, DELETE ON public.student_grade_weights FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.student_grade_weight_audit_logs FROM authenticated, anon, public;

GRANT SELECT ON public.student_grade_weights TO authenticated;
GRANT SELECT ON public.student_grade_weight_audit_logs TO authenticated;

-- 撤銷 PUBLIC, anon, authenticated 對所有內部重算與 Trigger 函式的直接 EXECUTE 權限
REVOKE EXECUTE ON FUNCTION public.recalculate_student_grades_for_term(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_after_weight_change_recalculate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_term_lock_on_weights() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_student_grade_weight_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_student_grades() FROM PUBLIC, anon, authenticated;

-- 保留四個 ADMIN RPC 的 authenticated 呼叫權限（函式內部嚴格查核 profiles.role='ADMIN' 且 is_active=true）
GRANT EXECUTE ON FUNCTION public.set_student_grade_weights TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_batch_grade_weights TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_student_grade_weights TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_batch_grade_weights TO authenticated;

-- ------------------------------------------------------------------------------
-- 13. 重新整理 PostgREST 快取
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
