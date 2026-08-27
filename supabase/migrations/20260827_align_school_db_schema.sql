-- ==============================================================================
-- 靜宜大學華語中心系統：Supabase Database Schema 與學校既有資料庫對齊 Migration SQL
-- 執行說明：請在 Supabase Dashboard -> SQL Editor 貼上並執行本 Migration 腳本。
-- 本腳本會將現有 Supabase 的學生 (students) 與教職員 (teachers) 資料表欄位對齊學校規格。
-- 包含安全的欄位重新命名與結構化新欄位擴充，不會刪除任何資料表或遺失既有資料。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 一、學生資料表 (public.students) 欄位對齊與擴充
-- ------------------------------------------------------------------------------

-- 1. 重新命名既有欄位（若欄位名稱為舊名則進行重命名）
DO $$
BEGIN
    -- student_no -> stno (學號)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='student_no') THEN
        ALTER TABLE public.students RENAME COLUMN student_no TO stno;
    END IF;

    -- english_name -> ename (英文姓名)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='english_name') THEN
        ALTER TABLE public.students RENAME COLUMN english_name TO ename;
    END IF;

    -- passport_no -> idno (身份證號/護照號碼)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='passport_no') THEN
        ALTER TABLE public.students RENAME COLUMN passport_no TO idno;
    END IF;

    -- nationality -> nation (國籍)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='nationality') THEN
        ALTER TABLE public.students RENAME COLUMN nationality TO nation;
    END IF;

    -- gender -> sex (性別)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='gender') THEN
        ALTER TABLE public.students RENAME COLUMN gender TO sex;
    END IF;

    -- birth_date -> birthday (生日)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='birth_date') THEN
        ALTER TABLE public.students RENAME COLUMN birth_date TO birthday;
    END IF;

    -- phone -> mobile_phone (手機號碼)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='phone') THEN
        ALTER TABLE public.students RENAME COLUMN phone TO mobile_phone;
    END IF;

    -- current_status -> rest_to_drop (在學/休退學狀態)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='current_status') THEN
        ALTER TABLE public.students RENAME COLUMN current_status TO rest_to_drop;
    END IF;
END $$;

-- 2. 新增學校學生既有資料庫的所有結構化欄位
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS enterdep varchar(6),
    ADD COLUMN IF NOT EXISTS natcode varchar(2),
    ADD COLUMN IF NOT EXISTS enterdate varchar(5),
    ADD COLUMN IF NOT EXISTS entersem varchar(4),
    ADD COLUMN IF NOT EXISTS enterno varchar(90),
    ADD COLUMN IF NOT EXISTS transin varchar(1),
    ADD COLUMN IF NOT EXISTS lastgrad varchar(1),
    ADD COLUMN IF NOT EXISTS lastdegre varchar(1),
    ADD COLUMN IF NOT EXISTS lastclas varchar(4),
    ADD COLUMN IF NOT EXISTS lastscol varchar(4),
    ADD COLUMN IF NOT EXISTS lastgroup varchar(4),
    ADD COLUMN IF NOT EXISTS lastdate varchar(5),
    ADD COLUMN IF NOT EXISTS lastlevel varchar(2),
    ADD COLUMN IF NOT EXISTS grsem varchar(4),
    ADD COLUMN IF NOT EXISTS grdate varchar(5),
    ADD COLUMN IF NOT EXISTS grno varchar(90),
    ADD COLUMN IF NOT EXISTS diploma varchar(60),
    ADD COLUMN IF NOT EXISTS dropreason varchar(2),
    ADD COLUMN IF NOT EXISTS dropdate varchar(7),
    ADD COLUMN IF NOT EXISTS dropsem varchar(4),
    ADD COLUMN IF NOT EXISTS dropno varchar(90),
    ADD COLUMN IF NOT EXISTS users varchar(20),
    ADD COLUMN IF NOT EXISTS ckdate timestamptz,
    ADD COLUMN IF NOT EXISTS grdep varchar(6),
    ADD COLUMN IF NOT EXISTS change_sem varchar(4),
    ADD COLUMN IF NOT EXISTS pre_mst_sem varchar(4),
    ADD COLUMN IF NOT EXISTS graduate_date varchar(7),
    ADD COLUMN IF NOT EXISTS insert_date varchar(7);


-- ------------------------------------------------------------------------------
-- 二、教職員資料表 (public.teachers) 欄位對齊與擴充
-- ------------------------------------------------------------------------------

-- 1. 重新命名既有欄位
DO $$
BEGIN
    -- teacher_no -> acctno (教職員帳號/編號)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='teacher_no') THEN
        ALTER TABLE public.teachers RENAME COLUMN teacher_no TO acctno;
    END IF;

    -- name -> emp_name (中文姓名)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='name') THEN
        ALTER TABLE public.teachers RENAME COLUMN name TO emp_name;
    END IF;

    -- english_name -> emp_ename (英文姓名)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='english_name') THEN
        ALTER TABLE public.teachers RENAME COLUMN english_name TO emp_ename;
    END IF;

    -- email -> emp_email (電子郵件)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='email') THEN
        ALTER TABLE public.teachers RENAME COLUMN email TO emp_email;
    END IF;

    -- phone -> emp_office_ext (校內分機/電話)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='phone') THEN
        ALTER TABLE public.teachers RENAME COLUMN phone TO emp_office_ext;
    END IF;

    -- specialty -> emp_skill (專長/技能)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teachers' AND column_name='specialty') THEN
        ALTER TABLE public.teachers RENAME COLUMN specialty TO emp_skill;
    END IF;
END $$;

-- 2. 新增學校教職員既有資料庫的所有結構化欄位
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS emp_idno varchar(10),
    ADD COLUMN IF NOT EXISTS emp_id varchar(6),
    ADD COLUMN IF NOT EXISTS tea_name varchar(75),
    ADD COLUMN IF NOT EXISTS emp_untid text,
    ADD COLUMN IF NOT EXISTS emp_wuntid text,
    ADD COLUMN IF NOT EXISTS emp_titid varchar(6),
    ADD COLUMN IF NOT EXISTS emp_posid varchar(2),
    ADD COLUMN IF NOT EXISTS emp_sex varchar(1),
    ADD COLUMN IF NOT EXISTS emp_study_ext varchar(5),
    ADD COLUMN IF NOT EXISTS emp_titid2 varchar(6),
    ADD COLUMN IF NOT EXISTS emp_unify varchar(10);

-- ------------------------------------------------------------------------------
-- 三、重新整理 Supabase PostgREST Schema 快取
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
