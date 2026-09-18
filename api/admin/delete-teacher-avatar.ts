import { getAdminSupabaseClient, parseRequestBody } from '../_supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed, please use POST' });
  }

  const body = parseRequestBody(req);
  const { teacherId } = body || {};

  if (!teacherId || typeof teacherId !== 'string') {
    return res.status(400).json({ error: '未提供有效的教師識別碼 (teacherId)' });
  }

  try {
    const { client: adminSupabase } = getAdminSupabaseClient();

    const { data: existingFiles, error: listErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (listErr) {
      console.error('[Vercel API delete-teacher-avatar] Error listing files:', listErr);
      return res.status(400).json({
        error: `無法查詢 Storage 照片目錄: ${listErr.message}`,
      });
    }

    if (existingFiles && existingFiles.length > 0) {
      const filesToRemove = existingFiles.map((f: any) => `${teacherId}/${f.name}`);
      const { error: removeErr } = await adminSupabase.storage
        .from('teacher-avatars')
        .remove(filesToRemove);

      if (removeErr) {
        console.error('[Vercel API delete-teacher-avatar] Error removing files:', removeErr);
        return res.status(400).json({
          error: `從 Supabase Storage 刪除照片失敗: ${removeErr.message}`,
        });
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Vercel API delete-teacher-avatar] Unexpected error:', err);
    return res.status(500).json({
      error: `刪除教師照片時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
}
