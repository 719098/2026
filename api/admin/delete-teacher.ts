import { createClient } from '@supabase/supabase-js';

function sendJsonResponse(res: any, statusCode: number, data: any) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
  } catch (e) {
    console.warn('[Vercel API delete-teacher] Standard response warning:', e);
  }
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Vercel API delete-teacher] Fallback response error:', err);
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
    const { teacherId, action = 'check', nextStatus } = body || {};

    if (!teacherId || typeof teacherId !== 'string') {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '未提供合法的教師識別碼 (teacherId)',
      });
    }

    const supabaseUrl = getValidSupabaseUrl();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!serviceRoleKey) {
      return sendJsonResponse(res, 500, {
        success: false,
        error: '伺服器未設定 Supabase 金鑰 (SUPABASE_SERVICE_ROLE_KEY)',
      });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const hasServiceRoleKey = Boolean(serviceRoleKey);

    // 1. Fetch teacher record
    const { data: teacher, error: teacherErr } = await adminSupabase
      .from('teachers')
      .select('*')
      .eq('id', teacherId)
      .maybeSingle();

    if (teacherErr || !teacher) {
      return sendJsonResponse(res, 404, {
        success: false,
        error: `找不到該教師資料 (ID: ${teacherId})`,
      });
    }

    // 2. Check relational dependencies (classes, class_sessions)
    const { data: assignedClasses, error: classErr } = await adminSupabase
      .from('classes')
      .select('id, name, class_code')
      .eq('teacher_id', teacherId);

    if (classErr) {
      console.warn('[Vercel API delete-teacher] Warning checking classes:', classErr);
    }

    const relatedClassNames = (assignedClasses || []).map(
      (c: any) => c.name || c.class_code || String(c.id)
    );
    const relatedClassIds = (assignedClasses || []).map((c: any) => c.id);

    let totalSessionsCount = 0;
    if (relatedClassIds.length > 0) {
      const { count } = await adminSupabase
        .from('class_sessions')
        .select('*', { count: 'exact', head: true })
        .in('class_id', relatedClassIds);
      totalSessionsCount = count || 0;
    }

    const hasRelations = relatedClassNames.length > 0 || totalSessionsCount > 0;

    // ACTION: Check deletability
    if (action === 'check') {
      if (hasRelations) {
        return sendJsonResponse(res, 200, {
          success: true,
          canDelete: false,
          hasRelations: true,
          teacherName: teacher.emp_name || teacher.tea_name || '該教師',
          teacherNo: teacher.acctno || '',
          relatedClasses: relatedClassNames,
          sessionsCount: totalSessionsCount,
          reason: '此教師已有歷史課堂或授課班級資料，無法直接刪除，請改用停用。',
        });
      }

      return sendJsonResponse(res, 200, {
        success: true,
        canDelete: true,
        hasRelations: false,
        teacherName: teacher.emp_name || teacher.tea_name || '該教師',
        teacherNo: teacher.acctno || '',
        relatedClasses: [],
        sessionsCount: 0,
        message: '此教師無任何授課班級或課堂紀錄，可安全執行物理刪除。',
      });
    }

    // ACTION: Toggle Status (Deactivate / Reactivate)
    // Synchronize public.teachers (employment_status) AND public.profiles (is_active)
    if (action === 'toggle_status') {
      const resolvedStatus = nextStatus === 'inactive' ? 'inactive' : 'active';
      const isActive = resolvedStatus === 'active';
      const prevEmploymentStatus = teacher.employment_status || (teacher.is_active === false ? 'INACTIVE' : 'ACTIVE');

      // 1. Update public.teachers
      let targetEmploymentStatus = isActive ? 'ACTIVE' : 'INACTIVE';
      let { error: updateTeacherErr } = await adminSupabase
        .from('teachers')
        .update({
          employment_status: targetEmploymentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', teacherId);

      // If check constraint rejects 'INACTIVE', fallback to 'RESIGNED'
      if (updateTeacherErr && !isActive && updateTeacherErr.code === '23514') {
        targetEmploymentStatus = 'RESIGNED';
        const retryRes = await adminSupabase
          .from('teachers')
          .update({
            employment_status: targetEmploymentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', teacherId);
        updateTeacherErr = retryRes.error;
      }

      if (updateTeacherErr) {
        console.error('[API delete-teacher] Failed to update teacher employment_status:', updateTeacherErr);
        return sendJsonResponse(res, 400, {
          success: false,
          error: `更新教師在職狀態失敗 (public.teachers): ${updateTeacherErr.message}`,
        });
      }

      // 2. Identify and update public.profiles (is_active)
      let targetProfileId = teacher.profile_id;

      if (!targetProfileId && (teacher.emp_email || teacher.email)) {
        const teacherEmail = (teacher.emp_email || teacher.email || '').trim();
        const { data: foundProfile } = await adminSupabase
          .from('profiles')
          .select('id')
          .eq('email', teacherEmail)
          .maybeSingle();

        if (foundProfile) {
          targetProfileId = foundProfile.id;
          // Backfill profile_id in public.teachers
          await adminSupabase
            .from('teachers')
            .update({ profile_id: foundProfile.id })
            .eq('id', teacherId);
        }
      }

      if (targetProfileId) {
        const { error: updateProfileErr } = await adminSupabase
          .from('profiles')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetProfileId);

        if (updateProfileErr) {
          console.error('[API delete-teacher] Failed to update profiles is_active:', updateProfileErr);
          // Rollback teachers table to ensure zero partial-failure / inconsistency!
          await adminSupabase
            .from('teachers')
            .update({
              employment_status: prevEmploymentStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', teacherId);

          return sendJsonResponse(res, 400, {
            success: false,
            error: `更新教師個人登入權限失敗 (public.profiles): ${updateProfileErr.message}`,
          });
        }
      } else {
        console.warn(`[API delete-teacher] Notice: Teacher ${teacherId} has no linked profile_id, updated teachers table only.`);
      }

      return sendJsonResponse(res, 200, {
        success: true,
        status: resolvedStatus,
        message: `已成功將教師【${teacher.emp_name || '教師'}】狀態更新為【${
          isActive ? '啟用 (在職中)' : '停用 (保留歷史資料)'
        }】。`,
      });
    }

    // ACTION: Safe Delete (Must have NO relations)
    if (action === 'delete') {
      if (hasRelations) {
        return sendJsonResponse(res, 400, {
          success: false,
          canDelete: false,
          error: `此教師已有授課班級 (${relatedClassNames.join('、')}) 或歷史課堂紀錄，無法直接刪除，請改用停用教師。`,
        });
      }

      // 1. Clean up avatar files in Supabase Storage ('teacher-avatars')
      try {
        const { data: existingFiles } = await adminSupabase.storage
          .from('teacher-avatars')
          .list(teacherId);

        if (existingFiles && existingFiles.length > 0) {
          const filesToRemove = existingFiles.map((f: any) => `${teacherId}/${f.name}`);
          await adminSupabase.storage.from('teacher-avatars').remove(filesToRemove);
          console.log(`[delete-teacher] Cleaned up ${filesToRemove.length} avatar files for teacher ${teacherId}`);
        }
      } catch (storageErr) {
        console.warn('[delete-teacher] Notice cleaning avatar storage:', storageErr);
      }

      // 2. Delete from public.teachers
      const { error: delTeacherErr } = await adminSupabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);

      if (delTeacherErr) {
        console.error('[delete-teacher] Error deleting from teachers:', delTeacherErr);
        return sendJsonResponse(res, 400, {
          success: false,
          error: `自 public.teachers 資料表刪除失敗: ${delTeacherErr.message}`,
        });
      }

      // 3. Delete from public.profiles and Supabase Auth User
      const profileId = teacher.profile_id;
      if (profileId) {
        try {
          await adminSupabase.from('profiles').delete().eq('id', profileId);
        } catch (profErr) {
          console.warn('[delete-teacher] Notice deleting profile:', profErr);
        }

        if (hasServiceRoleKey) {
          try {
            const { error: authDelErr } = await adminSupabase.auth.admin.deleteUser(profileId);
            if (authDelErr) {
              console.warn('[delete-teacher] Notice deleting auth user:', authDelErr);
            } else {
              console.log(`[delete-teacher] Successfully deleted Supabase Auth User: ${profileId}`);
            }
          } catch (authErr) {
            console.warn('[delete-teacher] Exception deleting auth user:', authErr);
          }
        }
      }

      return sendJsonResponse(res, 200, {
        success: true,
        message: `已成功安全刪除教師【${teacher.emp_name || teacher.name || '教師'}】檔案，並同步清除關聯的登入帳號與照片！`,
      });
    }

    return sendJsonResponse(res, 400, {
      success: false,
      error: `未知的操作類型: ${action}`,
    });
  } catch (err: any) {
    console.error('[Vercel API delete-teacher] Unexpected exception:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: `處理教師刪除/停用操作時發生伺服器錯誤: ${err?.message || String(err)}`,
    });
  }
}
