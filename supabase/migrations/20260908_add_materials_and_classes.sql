-- ==============================================================================
-- 靜宜大學華語中心系統：新增教材主資料、班級多教材支援與 10 個正式班級 Migration SQL
-- ==============================================================================

-- 1. 為 public.classes 新增 capacity 欄位 (若尚未存在)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 40;
UPDATE public.classes SET capacity = 40 WHERE capacity IS NULL OR capacity = 0;

-- 2. 建立教材主資料表 (public.materials)
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 啟動 RLS 與權限
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for authenticated users on materials" ON public.materials;
CREATE POLICY "Allow select for authenticated users on materials" ON public.materials FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated users on materials" ON public.materials;
CREATE POLICY "Allow all for authenticated users on materials" ON public.materials FOR ALL USING (true);
GRANT ALL ON public.materials TO authenticated, service_role, anon;

-- 3. Seed 教材主資料 (UPSERT 避免重複)
INSERT INTO public.materials (name, description) VALUES
    ('漢語拼音', '發音與聲調基礎教材'),
    ('當代中文課程1', '當代中文課程第一冊'),
    ('當代中文課程2', '當代中文課程第二冊'),
    ('當代中文課程3', '當代中文課程第三冊'),
    ('當代中文課程4', '當代中文課程第四冊'),
    ('當代社會剪影系列第三冊', '高級文化與社會專題教材')
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = NOW();

-- 4. 建立班級多教材關聯表 (public.class_materials)
CREATE TABLE IF NOT EXISTS public.class_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    lesson_start VARCHAR(50) DEFAULT '',
    lesson_end VARCHAR(50) DEFAULT '',
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT class_materials_unique_item UNIQUE (class_id, material_id, lesson_start, lesson_end)
);

-- 啟動 RLS 與權限
ALTER TABLE public.class_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for authenticated users on class_materials" ON public.class_materials;
CREATE POLICY "Allow select for authenticated users on class_materials" ON public.class_materials FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated users on class_materials" ON public.class_materials;
CREATE POLICY "Allow all for authenticated users on class_materials" ON public.class_materials FOR ALL USING (true);
GRANT ALL ON public.class_materials TO authenticated, service_role, anon;

-- 5. 重置 Supabase PostgREST 快取
NOTIFY pgrst, 'reload schema';
