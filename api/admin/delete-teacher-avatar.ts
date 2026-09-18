import { createClient } from '@supabase/supabase-js';

function sendJsonResponse(res: any, statusCode: number, data: any) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
  } catch (e) {
    console.warn('[Vercel API delete-teacher-avatar] Standard response warning:', e);
  }
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Vercel API delete-teacher-avatar] Fallback response error:', err);
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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return sendJsonResponse(res, 405, {
        success: false,
        error: 'Method Not Allowed, please use POST',
      });
    }

    const body = await readRequestBody(req);
    const { teacherId } = body || {};

    if (!teacherId || typeof teacherId !== 'string') {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '未提供有效的教師識別碼 (teacherId)',
      });
    }

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

    const { data: existingFiles, error: listErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (listErr) {
      console.error('[Vercel API delete-teacher-avatar] Error listing files:', listErr);
      return sendJsonResponse(res, 400, {
        success: false,
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
        return sendJsonResponse(res, 400, {
          success: false,
          error: `從 Supabase Storage 刪除照片失敗: ${removeErr.message}`,
        });
      }
    }

    return sendJsonResponse(res, 200, { success: true });
  } catch (err: any) {
    console.error('[Vercel API delete-teacher-avatar] Unexpected error:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: `刪除教師照片時發生伺服器錯誤: ${err?.message || String(err)}`,
    });
  }
}
