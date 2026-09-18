import { getAdminSupabaseClient, parseRequestBody } from '../_supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed, please use POST' });
  }

  const body = parseRequestBody(req);
  const { teacherId, fileData, fileType } = body || {};

  if (!teacherId || typeof teacherId !== 'string') {
    return res.status(400).json({ error: '未提供有效的教師識別碼 (teacherId)' });
  }

  if (!fileData || typeof fileData !== 'string') {
    return res.status(400).json({ error: '未提供相片檔案資料' });
  }

  const cleanFileType = (fileType || '').toLowerCase();
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(cleanFileType)) {
    return res.status(400).json({
      error: '照片格式不符：僅支援 JPEG (.jpg, .jpeg)、PNG (.png) 或 WebP (.webp) 格式',
    });
  }

  // Base64 to buffer conversion
  const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Max 5 MB check
  const MAX_BYTES = 5 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) {
    const sizeInMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return res.status(400).json({
      error: `檔案過大 (${sizeInMb} MB)：照片檔案大小不得超過 5 MB`,
    });
  }

  let ext = 'webp';
  if (cleanFileType === 'image/jpeg') ext = 'jpg';
  else if (cleanFileType === 'image/png') ext = 'png';
  else if (cleanFileType === 'image/webp') ext = 'webp';

  const targetFileName = `avatar.${ext}`;
  const targetFilePath = `${teacherId}/${targetFileName}`;

  try {
    const { client: adminSupabase } = getAdminSupabaseClient();

    // 1. Ensure bucket exists
    const { data: buckets } = await adminSupabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === 'teacher-avatars')) {
      await adminSupabase.storage.createBucket('teacher-avatars', {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
    }

    // 2. Clean up old files in teacher-avatars/${teacherId}
    const { data: existingFiles } = await adminSupabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (existingFiles && existingFiles.length > 0) {
      const filesToRemove = existingFiles.map((f: any) => `${teacherId}/${f.name}`);
      await adminSupabase.storage.from('teacher-avatars').remove(filesToRemove);
    }

    // 3. Upload file with upsert
    const { data: uploadData, error: uploadErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .upload(targetFilePath, buffer, {
        contentType: cleanFileType,
        upsert: true,
      });

    if (uploadErr || !uploadData) {
      console.error('[Vercel API upload-teacher-avatar] Upload error:', uploadErr);
      return res.status(400).json({
        error: `上傳照片至 Supabase Storage 失敗: ${uploadErr?.message || '未知錯誤'}`,
      });
    }

    // 4. Create Signed URL (valid for 24 hours)
    const { data: signedData, error: signErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .createSignedUrl(targetFilePath, 60 * 60 * 24);

    if (signErr || !signedData?.signedUrl) {
      console.error('[Vercel API upload-teacher-avatar] Create signed URL error:', signErr);
      return res.status(400).json({
        error: `產生照片存取連結失敗: ${signErr?.message || '未知錯誤'}`,
      });
    }

    return res.json({
      success: true,
      storagePath: targetFilePath,
      signedUrl: signedData.signedUrl,
    });
  } catch (err: any) {
    console.error('[Vercel API upload-teacher-avatar] Unexpected error:', err);
    return res.status(500).json({
      error: `處理教師照片時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
}
