-- ============================================================================
-- 華語中心系統：學生個別自訂成績權重 - 安全回滾 SQL
-- 檔案名稱：grade_weights_rollback.sql
-- 限制保證：
-- 1. 禁止使用 DROP TABLE CASCADE。
-- 2. 保留已建立之 student_grade_weights 及稽核歷史紀錄，不遺失資料。
-- 3. 不重新加入任何 grade_letter 或 ABCD 英文等第。
-- 4. 確保回滾後全校 student_grades 資料一致性：
--    將所有學生成績依固定預設 20/15/20/20/15/10 重新計算 total_score 與 is_passed。
--    嚴格禁止修改六項原始成績。
-- ============================================================================

BEGIN;

-- 1. 移除四個管理員專用 RPC
DROP FUNCTION IF EXISTS public.set_student_grade_weights(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.apply_batch_grade_weights(UUID[], UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.reset_student_grade_weights(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.reset_batch_grade_weights(UUID[], UUID, TEXT);

-- 2. 移除 Trigger 及內部輔助函式
DROP TRIGGER IF EXISTS trg_after_student_grade_weights_change ON public.student_grade_weights;
DROP FUNCTION IF EXISTS public.handle_grade_weights_change_and_recalc();

DROP TRIGGER IF EXISTS trg_check_term_lock_on_weights ON public.student_grade_weights;
DROP FUNCTION IF EXISTS public.check_term_lock_on_weights();

DROP FUNCTION IF EXISTS public.recalculate_student_grades_for_term(UUID, UUID);

-- 3. 還原 calculate_student_grades() 為固定預設 20/15/20/20/15/10 比例計算
--    保留 0~100 數字總分與 is_passed 及格判定，完全不加回任何 grade_letter
CREATE OR REPLACE FUNCTION public.calculate_student_grades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.total_score := ROUND(
        (
            COALESCE(NEW.attendance_score, 0) * 0.20 +
            COALESCE(NEW.quiz_score, 0) * 0.15 +
            COALESCE(NEW.midterm_score, 0) * 0.20 +
            COALESCE(NEW.final_score, 0) * 0.20 +
            COALESCE(NEW.homework_score, 0) * 0.15 +
            COALESCE(NEW.attitude_score, 0) * 0.10
        )::NUMERIC,
        2
    );
    NEW.is_passed := (NEW.total_score >= 60.00);
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.calculate_student_grades() IS '回滾版本：恢復使用固定預設 20/15/20/20/15/10 比例計算數字總分，不含英文等第';

-- 4. 確保回滾後 student_grades 資料一致性：
--    透過更新 updated_at 激發還原後的 trg_calc_student_grades Trigger，
--    全面依照預設比例 20/15/20/20/15/10 重新計算 total_score 與 is_passed。
--    嚴格保證不修改任何六項原始分數。
UPDATE public.student_grades
SET updated_at = timezone('utc'::text, now())
WHERE id IS NOT NULL;

-- 5. 安全移除 RLS Policies，表格予以保留（不執行 DROP TABLE）以防止資料遺失
DROP POLICY IF EXISTS "admin_view_student_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "teacher_view_student_grade_weights" ON public.student_grade_weights;
DROP POLICY IF EXISTS "admin_view_grade_weight_audit_logs" ON public.student_grade_weight_audit_logs;

COMMIT;
