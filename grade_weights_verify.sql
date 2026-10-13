-- ============================================================================
-- 華語中心系統：學生個別自訂六項成績權重 - 部署後唯讀驗證 SQL
-- 檔案名稱：grade_weights_verify.sql
-- 特點：純 SELECT 查詢，無任何 DDL/DML，包含正確之 pg_class.relrowsecurity
-- ============================================================================

-- 1. 檢查資料表欄位結構、型別與預設值
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('student_grade_weights', 'student_grade_weight_audit_logs')
ORDER BY table_name, ordinal_position;

-- 2. 檢查外鍵約束是否正確指向 public.students 與 public.terms、public.profiles
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('student_grade_weights', 'student_grade_weight_audit_logs')
ORDER BY tc.table_name, kcu.column_name;

-- 3. 檢查約束條件（唯一鍵、0~100 範圍檢查、總和 100 檢查）
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'student_grade_weights'
ORDER BY tc.constraint_name;

-- 4. 確認 student_grades 中 grade_letter 欄位已安全移除 (預期回傳 0 筆)
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'student_grades'
  AND column_name = 'grade_letter';

-- 5. 檢查 Trigger 是否正確掛載於 student_grades 與 student_grade_weights
SELECT 
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_timing AS timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('student_grades', 'student_grade_weights')
ORDER BY event_object_table, trigger_name;

-- 6. 檢查 calculate_student_grades() 函式定義（確認已無 grade_letter 並支援個別權重）
SELECT 
    routine_name,
    routine_type,
    security_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'calculate_student_grades';

-- 7. 檢查四個管理員專用 RPC 是否正確建立
SELECT 
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'set_student_grade_weights',
      'apply_batch_grade_weights',
      'reset_student_grade_weights',
      'reset_batch_grade_weights'
  )
ORDER BY routine_name;

-- 8. 檢查 RLS 啟用狀態與 Policies（確認已無 student_view_own_grade_weights，且無任何直接寫入 Policy）
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    p.policyname,
    p.cmd,
    p.roles,
    p.qual,
    p.with_check
FROM pg_class c
JOIN pg_namespace n
    ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
    ON p.schemaname = n.nspname
   AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN (
      'student_grade_weights',
      'student_grade_weight_audit_logs'
  )
ORDER BY c.relname, p.policyname;

-- 9. 檢查資料表 GRANT 權限（確認 authenticated 只有 SELECT，沒有 INSERT/UPDATE/DELETE）
SELECT 
    table_name,
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('student_grade_weights', 'student_grade_weight_audit_logs')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 10. 檢查函式 EXECUTE 授權狀態（確認內部函式已收回，四個 RPC 授予 authenticated）
SELECT 
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
      'calculate_student_grades',
      'recalculate_student_grades_for_term',
      'check_term_lock_on_weights',
      'handle_grade_weights_change_and_recalc',
      'set_student_grade_weights',
      'apply_batch_grade_weights',
      'reset_student_grade_weights',
      'reset_batch_grade_weights'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY routine_name, grantee;
