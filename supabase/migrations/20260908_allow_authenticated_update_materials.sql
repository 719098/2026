-- 最小必要權限：僅允許已登入之 authenticated 使用者 UPDATE 教材主資料 (public.materials)
-- 嚴格遵守規範：
-- 1. 僅針對 UPDATE 操作，不使用 FOR ALL
-- 2. 不使用 GRANT ALL
-- 3. 不更動 SELECT / INSERT / DELETE 的既有權限或政策

-- 確保 authenticated 具備 UPDATE 資料表權限
GRANT UPDATE ON public.materials TO authenticated;

-- 為 public.materials 建立最小必要的 UPDATE RLS Policy
DROP POLICY IF EXISTS "Allow update for authenticated users on materials" ON public.materials;
CREATE POLICY "Allow update for authenticated users on materials"
ON public.materials
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
