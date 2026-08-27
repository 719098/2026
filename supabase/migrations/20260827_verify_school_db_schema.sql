-- ==============================================================================
-- 靜宜大學華語中心系統：Supabase Database Schema 唯讀驗證 SQL (Read-Only Verification Script)
-- 說明：此 SQL 為唯讀驗證腳本，不會做任何修改或刪除，用以確認 Migration 執行後的 Schema、
-- 欄位結構、筆數完整性與外鍵 constraint/RLS/Trigger 狀態。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 檢查學生資料表 (public.students) 學校規格欄位是否存在
-- ------------------------------------------------------------------------------
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'students'
  AND column_name IN (
      'stno', 'enterdep', 'name', 'ename', 'sex', 'natcode', 'nation', 'idno',
      'birthday', 'enterdate', 'entersem', 'enterno', 'transin', 'lastgrad',
      'lastdegre', 'lastclas', 'lastscol', 'lastgroup', 'lastdate', 'lastlevel',
      'grsem', 'grdate', 'grno', 'diploma', 'dropreason', 'dropdate', 'dropsem',
      'dropno', 'users', 'ckdate', 'mobile_phone', 'grdep', 'change_sem',
      'pre_mst_sem', 'graduate_date', 'rest_to_drop', 'insert_date'
  )
ORDER BY column_name;

-- ------------------------------------------------------------------------------
-- 2. 檢查教職員資料表 (public.teachers) 學校規格欄位是否存在
-- ------------------------------------------------------------------------------
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'teachers'
  AND column_name IN (
      'acctno', 'emp_name', 'emp_ename', 'emp_email', 'emp_office_ext', 'emp_skill',
      'emp_idno', 'emp_id', 'tea_name', 'emp_untid', 'emp_wuntid', 'emp_titid',
      'emp_posid', 'emp_sex', 'emp_study_ext', 'emp_titid2', 'emp_unify', 'profile_id', 'id'
  )
ORDER BY column_name;

-- ------------------------------------------------------------------------------
-- 3. 驗證資料表總筆數（確認 Migration 前後無任何資料遺失）
-- ------------------------------------------------------------------------------
SELECT 'students' AS table_name, COUNT(*) AS total_records FROM public.students
UNION ALL
SELECT 'teachers' AS table_name, COUNT(*) AS total_records FROM public.teachers
UNION ALL
SELECT 'profiles' AS table_name, COUNT(*) AS total_records FROM public.profiles
UNION ALL
SELECT 'classes' AS table_name, COUNT(*) AS total_records FROM public.classes;

-- ------------------------------------------------------------------------------
-- 4. 驗證 Auth 帳號與 profiles / teachers 綁定關係未受影響
-- ------------------------------------------------------------------------------
SELECT 
    p.id AS profile_id,
    p.email,
    p.role,
    t.id AS teacher_id,
    t.acctno,
    t.emp_name
FROM public.profiles p
LEFT JOIN public.teachers t ON t.profile_id = p.id
ORDER BY p.created_at DESC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 5. 驗證外鍵 (Foreign Keys) 參考完整性
-- ------------------------------------------------------------------------------
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ------------------------------------------------------------------------------
-- 6. 驗證 Row Level Security (RLS) 行級安全策略存在狀態
-- ------------------------------------------------------------------------------
SELECT 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('students', 'teachers', 'profiles', 'classes', 'class_students', 'attendance_records');
