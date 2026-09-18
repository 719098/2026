import { getAdminSupabaseClient, calculateNextTeacherNo, parseRequestBody } from '../_supabaseAdmin';

export default async function handler(req: any, res: any) {
  // Allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed, please use POST' });
  }

  const body = parseRequestBody(req);
  const { name, englishName, email, phone, specialty, password } = body || {};

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanEnglishName = typeof englishName === 'string' ? englishName.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanSpecialty = typeof specialty === 'string' ? specialty.trim() : '';
  const cleanPassword = typeof password === 'string' ? password : '';

  if (!cleanName || !cleanEmail) {
    return res.status(400).json({ error: '教師姓名與 Email 為必填欄位' });
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    return res.status(400).json({ error: '密碼為必填欄位且長度至少需要 6 位數' });
  }

  try {
    const { client: adminSupabase, serviceRoleKey, hasServiceRoleKey } = getAdminSupabaseClient();

    if (!hasServiceRoleKey) {
      return res.status(500).json({
        error:
          '伺服器或 Vercel 環境變數未設定 SUPABASE_SERVICE_ROLE_KEY。管理員建立 Auth 帳號需要 Service Role Key 權限，請在 Vercel Settings -> Environment Variables 中設定 SUPABASE_SERVICE_ROLE_KEY。',
      });
    }

    // 1. Fetch existing teachers to calculate next acctno
    const { data: existingTeachers, error: fetchErr } = await adminSupabase
      .from('teachers')
      .select('acctno');

    if (fetchErr) {
      console.warn('[Vercel API create-teacher] Warning fetching existing acctno:', fetchErr);
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
        break;
      }
      const match = nextTeacherNo.match(/^T(\d+)$/i);
      const currNum = match ? parseInt(match[1], 10) : 0;
      const nextNum = currNum + 1;
      nextTeacherNo = nextNum <= 999 ? `T${String(nextNum).padStart(3, '0')}` : `T${nextNum}`;
      attempts++;
    }

    // 2. Create Supabase Auth User via Admin API
    let authUserId: string | null = null;
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
      const errMsg = authErr.message || String(authErr);
      if (errMsg.toLowerCase().includes('already') || (authErr as any).status === 422) {
        console.log(`[Vercel API create-teacher] User ${cleanEmail} already exists in Auth, updating password...`);
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
            error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
          });
        }
      } else {
        console.error('[Vercel API create-teacher] auth.admin.createUser error:', authErr);
        return res.status(400).json({
          error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
        });
      }
    } else {
      authUserId = authData?.user?.id || null;
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
        console.error('[Vercel API create-teacher] public.profiles upsert error:', profileErr);
        if (authUserId && serviceRoleKey) {
          try {
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Vercel API create-teacher] Rollback Auth User failed:', rollbackErr);
          }
        }
        return res.status(400).json({
          error: `寫入 public.profiles 資料表失敗 [${profileErr.code || 'ERR'}]: ${profileErr.message || String(profileErr)}`,
        });
      }
    }

    // 4. Insert into public.teachers
    const teacherPayload: Record<string, any> = {
      acctno: nextTeacherNo,
      emp_name: cleanName,
      emp_email: cleanEmail,
      status: 'active',
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
        console.error('[Vercel API create-teacher] public.teachers update error:', updateErr);
        return res.status(400).json({
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
        console.error('[Vercel API create-teacher] public.teachers insert error:', insertErr);
        if (authUserId && serviceRoleKey) {
          try {
            await adminSupabase.from('profiles').delete().eq('id', authUserId);
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Vercel API create-teacher] Rollback failed:', rollbackErr);
          }
        }
        return res.status(400).json({
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
        status: 'active',
      },
    });
  } catch (err: any) {
    console.error('[Vercel API create-teacher] Unexpected exception:', err);
    return res.status(500).json({
      error: `建立教師時發生伺服器錯誤: ${err.message || String(err)}`,
    });
  }
}
