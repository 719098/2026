import { createClient } from '@supabase/supabase-js';

function sendJsonResponse(res: any, statusCode: number, data: any) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
  } catch (e) {
    console.warn('[Vercel API upload-teacher-avatar] Standard response warning:', e);
  }
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Vercel API upload-teacher-avatar] Fallback response error:', err);
  }
}

async function readRequestBody(req: any): Promise<any> {
  if (!req) return {};
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }
  if (typeof req.on === 'function') {
    try {
      const chunks: any[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw || !raw.trim()) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function getValidSupabaseUrl(): string {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    'https://rcvetyahocznanvbggqf.supabase.co',
  ];
  for (const url of candidates) {
    if (url && typeof url === 'string') {
      const trimmed = url.trim();
      if (
        (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
        !trimmed.includes('@')
      ) {
        return trimmed;
      }
    }
  }
  return 'https://rcvetyahocznanvbggqf.supabase.co';
}

async function verifyCallerRole(req: any, requireAdmin: boolean) {
  const rawAuth = req.headers?.authorization || req.headers?.Authorization || '';
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false as const, status: 401, error: '未授權：缺少認證權杖 (Bearer Token)' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false as const, status: 401, error: '未授權：缺少有效的認證權杖' };
  }
  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  const activeKey = serviceRoleKey || anonKey;
  const authClient = createClient(supabaseUrl, activeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(serviceRoleKey ? {} : { global: { headers: { Authorization: `Bearer ${token}` } } }),
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: '未授權：無效或已過期的登入憑證' };
  }
  const { data: profile, error: profErr } = await authClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profErr || !profile || profile.is_active === false) {
    return { ok: false as const, status: 403, error: '無權限：帳號已停用或未設定系統角色' };
  }
  const role = String(profile.role || '').toUpperCase();
  if (requireAdmin && role !== 'ADMIN') {
    return { ok: false as const, status: 403, error: '無權限：僅管理員可執行此操作' };
  }
  return { ok: true as const, userId: userData.user.id, role };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return sendJsonResponse(res, 405, {
        success: false,
        error: 'Method Not Allowed, please use POST',
      });
    }

    const caller = await verifyCallerRole(req, true);
    if (!caller.ok) {
      return sendJsonResponse(res, caller.status, {
        success: false,
        error: caller.error,
      });
    }

    const body = await readRequestBody(req);
    const { teacherId, fileData, fileType } = body || {};

    if (!teacherId || typeof teacherId !== 'string') {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '未提供有效的教師識別碼 (teacherId)',
      });
    }

    if (!fileData || typeof fileData !== 'string') {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '未提供相片檔案資料',
      });
    }

    const cleanFileType = (fileType || '').toLowerCase();
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(cleanFileType)) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '照片格式不符：僅支援 JPEG (.jpg, .jpeg)、PNG (.png) 或 WebP (.webp) 格式',
      });
    }

    const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const MAX_BYTES = 5 * 1024 * 1024;
    if (buffer.length > MAX_BYTES) {
      const sizeInMb = (buffer.length / (1024 * 1024)).toFixed(2);
      return sendJsonResponse(res, 400, {
        success: false,
        error: `檔案過大 (${sizeInMb} MB)：照片檔案大小不得超過 5 MB`,
      });
    }

    let ext = 'webp';
    if (cleanFileType === 'image/jpeg') ext = 'jpg';
    else if (cleanFileType === 'image/png') ext = 'png';
    else if (cleanFileType === 'image/webp') ext = 'webp';

    const targetFileName = `avatar.${ext}`;
    const targetFilePath = `${teacherId}/${targetFileName}`;

    const supabaseUrl = getValidSupabaseUrl();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    const anonKey =
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';

    const activeKey = serviceRoleKey || anonKey;

    if (!activeKey) {
      return sendJsonResponse(res, 500, {
        success: false,
        error: '伺服器未設定 Supabase 金鑰',
      });
    }

    const adminSupabase = createClient(supabaseUrl, activeKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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
      return sendJsonResponse(res, 400, {
        success: false,
        error: `上傳照片至 Supabase Storage 失敗: ${uploadErr?.message || '未知錯誤'}`,
      });
    }

    // 4. Create Signed URL (valid for 24 hours)
    const { data: signedData, error: signErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .createSignedUrl(targetFilePath, 60 * 60 * 24);

    if (signErr || !signedData?.signedUrl) {
      console.error('[Vercel API upload-teacher-avatar] Create signed URL error:', signErr);
      return sendJsonResponse(res, 400, {
        success: false,
        error: `產生照片存取連結失敗: ${signErr?.message || '未知錯誤'}`,
      });
    }

    return sendJsonResponse(res, 200, {
      success: true,
      storagePath: targetFilePath,
      signedUrl: signedData.signedUrl,
    });
  } catch (err: any) {
    console.error('[Vercel API upload-teacher-avatar] Unexpected error:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: `處理教師照片時發生伺服器錯誤: ${err?.message || String(err)}`,
    });
  }
}
