import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper function to calculate teacher_no safely
function getValidSupabaseUrl(): string {
  const candidates = [
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

function calculateNextTeacherNo(teachers: any[]): string {
  let maxNum = 0;
  for (const t of teachers) {
    const no = t.acctno || t.teacherNo;
    if (no && typeof no === 'string') {
      const match = no.trim().match(/^T(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  if (nextNum <= 999) {
    return `T${String(nextNum).padStart(3, '0')}`;
  }
  return `T${nextNum}`;
}

// Admin API: Create Teacher with Supabase Auth User + public.teachers entry
app.post("/api/admin/create-teacher", async (req, res) => {
  const { name, englishName, email, phone, specialty, password } = req.body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanEnglishName = typeof englishName === 'string' ? englishName.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanSpecialty = typeof specialty === 'string' ? specialty.trim() : '';
  const cleanPassword = typeof password === 'string' ? password : '';

  if (!cleanName || !cleanEmail) {
    return res.status(400).json({ success: false, error: '教師姓名與 Email 為必填欄位' });
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    return res.status(400).json({ success: false, error: '密碼為必填欄位且長度至少需要 6 位數' });
  }

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';

  const activeKey = serviceRoleKey || anonKey;

  if (!activeKey) {
    return res.status(500).json({ success: false, error: '伺服器未設定 Supabase 金鑰' });
  }

  const adminSupabase = createClient(supabaseUrl, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // 1. Fetch existing teachers to determine next teacher_no / acctno
    const { data: existingTeachers, error: fetchErr } = await adminSupabase
      .from('teachers')
      .select('acctno');

    if (fetchErr) {
      console.error('[Server API] Error fetching teacher numbers:', fetchErr);
    }

    let nextTeacherNo = calculateNextTeacherNo(existingTeachers || []);

    // Double-check uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const { data: duplicate } = await adminSupabase
        .from('teachers')
        .select('id')
        .eq('acctno', nextTeacherNo)
        .maybeSingle();

      if (!duplicate) {
        break; // Unique number confirmed
      }
      const match = nextTeacherNo.match(/^T(\d+)$/i);
      const currNum = match ? parseInt(match[1], 10) : 0;
      const nextNum = currNum + 1;
      nextTeacherNo = nextNum <= 999 ? `T${String(nextNum).padStart(3, '0')}` : `T${nextNum}`;
      attempts++;
    }

    // 2. Create Supabase Auth User via Admin API (email_confirm: true)
    let authUserId: string | null = null;
    
    if (serviceRoleKey) {
      const { data: authData, error: authErr } = await adminSupabase.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: {
          name: cleanName,
          role: 'teacher',
        },
      });

      if (authErr) {
        // If user already exists in Auth, try to find existing user and update password
        const errMsg = authErr.message || String(authErr);
        if (errMsg.toLowerCase().includes('already') || (authErr as any).status === 422) {
          console.log(`[Server API] User ${cleanEmail} already exists in Auth, updating user password...`);
          const { data: userList } = await adminSupabase.auth.admin.listUsers();
          const existingUser = userList?.users?.find(
            (u: any) => u.email?.toLowerCase() === cleanEmail.toLowerCase()
          );

          if (existingUser) {
            authUserId = existingUser.id;
            await adminSupabase.auth.admin.updateUserById(authUserId, {
              password: cleanPassword,
              email_confirm: true,
              user_metadata: { name: cleanName, role: 'teacher' },
            });
          } else {
            return res.status(400).json({
              success: false,
              error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
            });
          }
        } else {
          console.error('[Server API] auth.admin.createUser error:', authErr);
          return res.status(400).json({
            success: false,
            error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
          });
        }
      } else {
        authUserId = authData?.user?.id || null;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: '系統未設定 SUPABASE_SERVICE_ROLE_KEY 環境變數。管理員建立 Auth 帳號需要 Service Role Key 權限，請在 .env 中設定 SUPABASE_SERVICE_ROLE_KEY。',
      });
    }

    // 3. Insert/Upsert into public.profiles
    if (authUserId) {
      const profilePayload = {
        id: authUserId,
        email: cleanEmail,
        full_name: cleanName,
        role: 'TEACHER',
        is_active: true,
      };

      const { error: profileErr } = await adminSupabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileErr) {
        console.error('[Server API] public.profiles insert error:', profileErr);

        if (authUserId && serviceRoleKey) {
          try {
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Server API] Rollback Auth User failed:', rollbackErr);
          }
        }

        return res.status(400).json({
          success: false,
          error: `寫入 public.profiles 資料表失敗 [${profileErr.code || 'ERR'}]: ${profileErr.message || String(profileErr)}`,
        });
      }
    }

    // 4. Insert into public.teachers (NO password stored here)
    const teacherPayload: Record<string, any> = {
      acctno: nextTeacherNo,
      emp_name: cleanName,
      emp_email: cleanEmail,
    };

    if (authUserId) {
      teacherPayload.profile_id = authUserId;
    }
    if (cleanEnglishName) {
      teacherPayload.emp_ename = cleanEnglishName;
    }
    if (cleanPhone) {
      teacherPayload.emp_office_ext = cleanPhone;
    }
    if (cleanSpecialty) {
      teacherPayload.emp_skill = cleanSpecialty;
    }

    // Check if teacher already exists by emp_email
    const { data: existingTeacherRow } = await adminSupabase
      .from('teachers')
      .select('id')
      .eq('emp_email', cleanEmail)
      .maybeSingle();

    let insertedTeacher: any = null;

    if (existingTeacherRow) {
      const { data: updated, error: updateErr } = await adminSupabase
        .from('teachers')
        .update(teacherPayload)
        .eq('id', existingTeacherRow.id)
        .select('*')
        .single();
      if (updateErr) {
        console.error('[Server API] public.teachers update error:', updateErr);
        return res.status(400).json({
          success: false,
          error: `更新 public.teachers 資料表失敗: ${updateErr.message}`,
        });
      }
      insertedTeacher = updated;
    } else {
      const { data: inserted, error: insertErr } = await adminSupabase
        .from('teachers')
        .insert(teacherPayload)
        .select('*')
        .single();

      if (insertErr) {
        console.error('[Server API] public.teachers insert error:', insertErr);

        if (authUserId && serviceRoleKey) {
          try {
            await adminSupabase.from('profiles').delete().eq('id', authUserId);
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Server API] Rollback failed:', rollbackErr);
          }
        }

        return res.status(400).json({
          success: false,
          error: `寫入 public.teachers 資料表失敗 [${insertErr.code || 'ERR'}]: ${insertErr.message || String(insertErr)}`,
        });
      }
      insertedTeacher = inserted;
    }

    return res.json({
      success: true,
      teacher: {
        id: String(insertedTeacher.id),
        teacherNo: insertedTeacher.acctno,
        acctno: insertedTeacher.acctno,
        profileId: insertedTeacher.profile_id,
        name: insertedTeacher.emp_name,
        empName: insertedTeacher.emp_name,
        englishName: insertedTeacher.emp_ename || '',
        empEname: insertedTeacher.emp_ename || '',
        email: insertedTeacher.emp_email,
        empEmail: insertedTeacher.emp_email,
        phone: insertedTeacher.emp_office_ext || '',
        empOfficeExt: insertedTeacher.emp_office_ext || '',
        specialty: insertedTeacher.emp_skill || '',
        empSkill: insertedTeacher.emp_skill || '',
      },
    });
  } catch (err: any) {
    console.error('[Server API] Unexpected exception in /api/admin/create-teacher:', err);
    return res.status(500).json({
      success: false,
      error: `建立教師時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
});

// Admin API: Reset Teacher Password in Supabase Auth
app.post("/api/admin/reset-teacher-password", async (req, res) => {
  const { teacherId, profileId, email, newPassword } = req.body || {};

  const cleanPassword = typeof newPassword === 'string' ? newPassword : '';
  if (!cleanPassword || cleanPassword.length < 6) {
    return res.status(400).json({ error: '新密碼為必填欄位且長度至少需要 6 位數' });
  }

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    return res.status(500).json({ error: '系統未設定 SUPABASE_SERVICE_ROLE_KEY，無法於服務端重設密碼' });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
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
      console.error('[Server API] Reset teacher password error:', updateErr);
      return res.status(400).json({ error: `重設密碼失敗：${updateErr.message}` });
    }

    // Touch updated_at on public.teachers (without saving password!)
    if (teacherId) {
      await adminSupabase.from('teachers').update({ updated_at: new Date().toISOString() }).eq('id', teacherId);
    }

    return res.json({ success: true, message: '教師密碼已成功重設！' });
  } catch (err: any) {
    console.error('[Server API] Exception resetting teacher password:', err);
    return res.status(500).json({ error: `重設密碼時發生伺服器錯誤: ${err.message || String(err)}` });
  }
});

// Admin API: Upload Teacher Avatar to Supabase Storage ('teacher-avatars')
app.post("/api/admin/upload-teacher-avatar", async (req, res) => {
  const { teacherId, fileData, fileType } = req.body || {};

  if (!teacherId || typeof teacherId !== 'string') {
    return res.status(400).json({ error: '未提供有效的教師識別碼 (teacherId)' });
  }

  if (!fileData || typeof fileData !== 'string') {
    return res.status(400).json({ error: '未提供相片檔案資料' });
  }

  const cleanFileType = (fileType || '').toLowerCase();
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(cleanFileType)) {
    return res.status(400).json({ error: '照片格式不符：僅支援 JPEG (.jpg, .jpeg)、PNG (.png) 或 WebP (.webp) 格式' });
  }

  // Base64 to buffer conversion
  const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Max 5 MB check
  const MAX_BYTES = 5 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) {
    const sizeInMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return res.status(400).json({ error: `檔案過大 (${sizeInMb} MB)：照片檔案大小不得超過 5 MB` });
  }

  let ext = 'webp';
  if (cleanFileType === 'image/jpeg') ext = 'jpg';
  else if (cleanFileType === 'image/png') ext = 'png';
  else if (cleanFileType === 'image/webp') ext = 'webp';

  const targetFileName = `avatar.${ext}`;
  const targetFilePath = `${teacherId}/${targetFileName}`;

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  const activeKey = serviceRoleKey || anonKey;

  const adminSupabase = createClient(supabaseUrl, activeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Ensure bucket exists
    const { data: buckets } = await adminSupabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === 'teacher-avatars')) {
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
      const filesToRemove = existingFiles.map((f) => `${teacherId}/${f.name}`);
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
      console.error('[Server API] Error uploading teacher avatar:', uploadErr);
      return res.status(400).json({
        error: `上傳照片至 Supabase Storage 失敗: ${uploadErr?.message || '未知錯誤'}`,
      });
    }

    // 4. Create Signed URL (valid for 24 hours)
    const { data: signedData, error: signErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .createSignedUrl(targetFilePath, 60 * 60 * 24);

    if (signErr || !signedData?.signedUrl) {
      console.error('[Server API] Error creating signed URL for teacher avatar:', signErr);
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
    console.error('[Server API] Unexpected error in /api/admin/upload-teacher-avatar:', err);
    return res.status(500).json({
      error: `處理教師照片時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
});

// Admin API: Delete Teacher Avatar from Supabase Storage ('teacher-avatars')
app.post("/api/admin/delete-teacher-avatar", async (req, res) => {
  const { teacherId } = req.body || {};

  if (!teacherId || typeof teacherId !== 'string') {
    return res.status(400).json({ error: '未提供有效的教師識別碼 (teacherId)' });
  }

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  const activeKey = serviceRoleKey || anonKey;

  const adminSupabase = createClient(supabaseUrl, activeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: existingFiles, error: listErr } = await adminSupabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (listErr) {
      console.error('[Server API] Error listing files to delete:', listErr);
      return res.status(400).json({
        error: `無法查詢 Storage 照片目錄: ${listErr.message}`,
      });
    }

    if (existingFiles && existingFiles.length > 0) {
      const filesToRemove = existingFiles.map((f) => `${teacherId}/${f.name}`);
      const { error: removeErr } = await adminSupabase.storage
        .from('teacher-avatars')
        .remove(filesToRemove);

      if (removeErr) {
        console.error('[Server API] Error removing teacher avatar files:', removeErr);
        return res.status(400).json({
          error: `從 Supabase Storage 刪除照片失敗: ${removeErr.message}`,
        });
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Server API] Unexpected error in /api/admin/delete-teacher-avatar:', err);
    return res.status(500).json({
      error: `刪除教師照片時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
});

// Admin API: Delete or Deactivate Teacher
app.post("/api/admin/delete-teacher", async (req, res) => {
  const { teacherId, action = 'check', nextStatus } = req.body || {};

  if (!teacherId || typeof teacherId !== 'string') {
    return res.status(400).json({ error: '未提供合法的教師識別碼 (teacherId)' });
  }

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  const activeKey = serviceRoleKey || anonKey;

  const adminSupabase = createClient(supabaseUrl, activeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Fetch teacher record
    const { data: teacher, error: teacherErr } = await adminSupabase
      .from('teachers')
      .select('*')
      .eq('id', teacherId)
      .maybeSingle();

    if (teacherErr || !teacher) {
      return res.status(404).json({ error: `找不到該教師資料 (ID: ${teacherId})` });
    }

    // 2. Check relational dependencies (classes, class_sessions)
    const { data: assignedClasses } = await adminSupabase
      .from('classes')
      .select('id, name, class_code')
      .eq('teacher_id', teacherId);

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

    // Check deletability
    if (action === 'check') {
      if (hasRelations) {
        return res.json({
          canDelete: false,
          hasRelations: true,
          teacherName: teacher.emp_name || teacher.tea_name || '該教師',
          teacherNo: teacher.acctno || '',
          relatedClasses: relatedClassNames,
          sessionsCount: totalSessionsCount,
          reason: '此教師已有歷史課堂或授課班級資料，無法直接刪除，請改用停用。',
        });
      }
      return res.json({
        canDelete: true,
        hasRelations: false,
        teacherName: teacher.emp_name || teacher.tea_name || '該教師',
        teacherNo: teacher.acctno || '',
        relatedClasses: [],
        sessionsCount: 0,
        message: '此教師無任何授課班級或課堂紀錄，可安全執行物理刪除。',
      });
    }

    // Toggle status (Active / Inactive)
    if (action === 'toggle_status') {
      const resolvedStatus = nextStatus === 'inactive' ? 'inactive' : 'active';
      const isActive = resolvedStatus === 'active';

      const { error: updateTeacherErr } = await adminSupabase
        .from('teachers')
        .update({
          status: resolvedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', teacherId);

      if (updateTeacherErr) {
        return res.status(400).json({ error: `更新教師狀態失敗: ${updateTeacherErr.message}` });
      }

      if (teacher.profile_id) {
        await adminSupabase
          .from('profiles')
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq('id', teacher.profile_id);
      }

      return res.json({
        success: true,
        status: resolvedStatus,
        message: `已成功將教師【${teacher.emp_name || '教師'}】狀態更新為【${
          isActive ? '啟用 (在職中)' : '停用 (保留歷史資料)'
        }】。`,
      });
    }

    // Safe Delete
    if (action === 'delete') {
      if (hasRelations) {
        return res.status(400).json({
          canDelete: false,
          error: `此教師已有授課班級 (${relatedClassNames.join('、')}) 或歷史課堂紀錄，無法直接刪除，請改用停用教師。`,
        });
      }

      // 1. Clean up avatar in storage
      try {
        const { data: existingFiles } = await adminSupabase.storage
          .from('teacher-avatars')
          .list(teacherId);

        if (existingFiles && existingFiles.length > 0) {
          const filesToRemove = existingFiles.map((f: any) => `${teacherId}/${f.name}`);
          await adminSupabase.storage.from('teacher-avatars').remove(filesToRemove);
        }
      } catch (storageErr) {
        console.warn('[server delete-teacher] Notice cleaning avatar storage:', storageErr);
      }

      // 2. Delete from public.teachers
      const { error: delTeacherErr } = await adminSupabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);

      if (delTeacherErr) {
        return res.status(400).json({
          error: `自 public.teachers 資料表刪除失敗: ${delTeacherErr.message}`,
        });
      }

      // 3. Delete from public.profiles and auth.users
      const profileId = teacher.profile_id;
      if (profileId) {
        try {
          await adminSupabase.from('profiles').delete().eq('id', profileId);
        } catch (profErr) {
          console.warn('[server delete-teacher] Notice deleting profile:', profErr);
        }

        if (serviceRoleKey) {
          try {
            await adminSupabase.auth.admin.deleteUser(profileId);
          } catch (authErr) {
            console.warn('[server delete-teacher] Notice deleting auth user:', authErr);
          }
        }
      }

      return res.json({
        success: true,
        message: `已成功安全刪除教師【${teacher.emp_name || teacher.name || '教師'}】檔案，並同步清除關聯登入帳號與照片！`,
      });
    }

    return res.status(400).json({ error: `未知的操作類型: ${action}` });
  } catch (err: any) {
    console.error('[Server API] Unexpected error in /api/admin/delete-teacher:', err);
    return res.status(500).json({
      error: `處理教師刪除/停用操作時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
});

// Admin API: Batch Get Teacher Avatar Signed URLs
app.post("/api/admin/get-teacher-avatar-urls", async (req, res) => {
  const { teacherIds } = req.body || {};

  if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
    return res.json({ urls: {} });
  }

  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  const activeKey = serviceRoleKey || anonKey;

  const adminSupabase = createClient(supabaseUrl, activeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const urls: Record<string, string> = {};

    await Promise.all(
      teacherIds.map(async (tid: string) => {
        if (!tid || typeof tid !== 'string') return;
        const { data: files } = await adminSupabase.storage
          .from('teacher-avatars')
          .list(tid);

        if (files && files.length > 0) {
          // Pick the first avatar file
          const avatarFile = files.find((f) => f.name.startsWith('avatar.')) || files[0];
          if (avatarFile) {
            const path = `${tid}/${avatarFile.name}`;
            const { data: signedData } = await adminSupabase.storage
              .from('teacher-avatars')
              .createSignedUrl(path, 60 * 60 * 24);

            if (signedData?.signedUrl) {
              urls[tid] = signedData.signedUrl;
            }
          }
        }
      })
    );

    return res.json({ urls });
  } catch (err: any) {
    console.error('[Server API] Unexpected error in /api/admin/get-teacher-avatar-urls:', err);
    return res.json({ urls: {} });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
