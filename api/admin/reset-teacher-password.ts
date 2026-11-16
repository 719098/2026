import { createClient } from '@supabase/supabase-js';

function sendJsonResponse(res: any, statusCode: number, data: any) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
  } catch (e) {
    console.warn('[Vercel API reset-teacher-password] Standard response warning:', e);
  }
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Vercel API reset-teacher-password] Fallback response error:', err);
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
    const { teacherId, profileId, email, newPassword } = body || {};

    const cleanPassword = typeof newPassword === 'string' ? newPassword : '';
    if (!cleanPassword || cleanPassword.length < 6) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '新密碼為必填欄位且長度至少需要 6 位數',
      });
    }

    const supabaseUrl = getValidSupabaseUrl();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!serviceRoleKey) {
      return sendJsonResponse(res, 500, {
        success: false,
        error: '系統未設定 SUPABASE_SERVICE_ROLE_KEY，無法於服務端重設密碼',
      });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let targetProfileId = profileId;

    if (!targetProfileId && teacherId) {
      const { data: teacherRow } = await adminSupabase
        .from('teachers')
        .select('profile_id, emp_email')
        .eq('id', teacherId)
        .maybeSingle();
      if (teacherRow) {
        targetProfileId = teacherRow.profile_id;
      }
    }

    if (!targetProfileId && email) {
      const { data: profileRow } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (profileRow) {
        targetProfileId = profileRow.id;
      }
    }

    if (!targetProfileId) {
      return sendJsonResponse(res, 404, {
        success: false,
        error: '找不到對應的教師 Auth User ID (profile_id)',
      });
    }

    // Update password in Supabase Auth
    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(
      targetProfileId,
      { password: cleanPassword, email_confirm: true }
    );

    if (updateErr) {
      console.error('[Vercel API reset-teacher-password] Error:', updateErr);
      return sendJsonResponse(res, 400, {
        success: false,
        error: `重設密碼失敗: ${updateErr.message}`,
      });
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message: '教師密碼已成功在 Supabase Auth 系統重設！',
    });
  } catch (err: any) {
    console.error('[Vercel API reset-teacher-password] Unexpected exception:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: `重設密碼時發生伺服器錯誤: ${err?.message || String(err)}`,
    });
  }
}
