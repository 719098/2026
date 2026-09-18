import { getAdminSupabaseClient, parseRequestBody } from '../_supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed, please use POST' });
  }

  const body = parseRequestBody(req);
  const { teacherId, profileId, email, newPassword } = body || {};

  const cleanPassword = typeof newPassword === 'string' ? newPassword : '';
  if (!cleanPassword || cleanPassword.length < 6) {
    return res.status(400).json({ error: '新密碼為必填欄位且長度至少需要 6 位數' });
  }

  try {
    const { client: adminSupabase, hasServiceRoleKey } = getAdminSupabaseClient();

    if (!hasServiceRoleKey) {
      return res.status(500).json({
        error: '系統未設定 SUPABASE_SERVICE_ROLE_KEY，無法於服務端重設密碼',
      });
    }

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
      return res.status(404).json({ error: '找不到對應的教師 Auth User ID (profile_id)' });
    }

    // Update password in Supabase Auth
    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(
      targetProfileId,
      { password: cleanPassword, email_confirm: true }
    );

    if (updateErr) {
      console.error('[Vercel API reset-teacher-password] Error:', updateErr);
      return res.status(400).json({ error: `重設密碼失敗：${updateErr.message}` });
    }

    if (teacherId) {
      await adminSupabase
        .from('teachers')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', teacherId);
    }

    return res.json({ success: true, message: '教師密碼已成功重設！' });
  } catch (err: any) {
    console.error('[Vercel API reset-teacher-password] Exception:', err);
    return res.status(500).json({ error: `重設密碼時發生伺服器錯誤: ${err.message || String(err)}` });
  }
}
