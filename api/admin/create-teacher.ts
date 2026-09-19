import { createClient } from '@supabase/supabase-js';

// Safe JSON response helper compatible with all Vercel/Node runtimes
function sendJsonResponse(res: any, statusCode: number, data: any) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
  } catch (e) {
    console.warn('[Vercel API create-teacher] Standard response method warning:', e);
  }
  try {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Vercel API create-teacher] Fallback response error:', err);
  }
}

// Safe asynchronous request body parser
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
  // If req is a stream and body hasn't been buffered yet
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

export default async function handler(req: any, res: any) {
  // Global try-catch surrounding the entire request lifecycle
  try {
    // 1. Allow POST method only
    if (req.method !== 'POST') {
      return sendJsonResponse(res, 405, {
        success: false,
        error: 'Method Not Allowed, please use POST',
      });
    }

    // 2. Parse request body safely
    const body = await readRequestBody(req);
    const { name, englishName, email, phone, specialty, password } = body || {};

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanEnglishName = typeof englishName === 'string' ? englishName.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const cleanSpecialty = typeof specialty === 'string' ? specialty.trim() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanName || !cleanEmail) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '教師姓名與 Email 為必填欄位',
      });
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: '密碼為必填欄位且長度至少需要 6 位數',
      });
    }

    // 3. Check Supabase credentials from process.env
    const supabaseUrl = getValidSupabaseUrl();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!serviceRoleKey) {
      return sendJsonResponse(res, 500, {
        success: false,
        error:
          '伺服器或 Vercel 環境變數未設定 SUPABASE_SERVICE_ROLE_KEY。管理員建立 Auth 帳號需要 Service Role Key 權限，請在 Vercel 專案 Settings -> Environment Variables 中確認已設定 SUPABASE_SERVICE_ROLE_KEY 並重新部署。',
      });
    }

    // 4. Initialize Supabase Admin Client
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 5. Fetch existing teachers to calculate next acctno
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

    // 6. Create Supabase Auth User via Admin API
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
          return sendJsonResponse(res, 400, {
            success: false,
            error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
          });
        }
      } else {
        console.error('[Vercel API create-teacher] auth.admin.createUser error:', authErr);
        return sendJsonResponse(res, 400, {
          success: false,
          error: `建立 Supabase 登入帳號失敗: ${errMsg}`,
        });
      }
    } else {
      authUserId = authData?.user?.id || null;
    }

    // 7. Insert/Upsert into public.profiles
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
        if (authUserId) {
          try {
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Vercel API create-teacher] Rollback Auth User failed:', rollbackErr);
          }
        }
        return sendJsonResponse(res, 400, {
          success: false,
          error: `寫入 public.profiles 資料表失敗 [${profileErr.code || 'ERR'}]: ${profileErr.message || String(profileErr)}`,
        });
      }
    }

    // 8. Insert into public.teachers (Strictly existing columns only: no 'status')
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
        console.error('[Vercel API create-teacher] public.teachers update error:', updateErr);
        return sendJsonResponse(res, 400, {
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
        console.error('[Vercel API create-teacher] public.teachers insert error:', insertErr);
        if (authUserId) {
          try {
            await adminSupabase.from('profiles').delete().eq('id', authUserId);
            await adminSupabase.auth.admin.deleteUser(authUserId);
          } catch (rollbackErr) {
            console.error('[Vercel API create-teacher] Rollback failed:', rollbackErr);
          }
        }
        return sendJsonResponse(res, 400, {
          success: false,
          error: `寫入 public.teachers 資料表失敗 [${insertErr.code || 'ERR'}]: ${insertErr.message || String(insertErr)}`,
        });
      }
      insertedTeacher = inserted;
    }

    // 9. Return success JSON
    return sendJsonResponse(res, 200, {
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
        status: insertedTeacher.employment_status === 'INACTIVE' ? 'inactive' : 'active',
      },
    });
  } catch (err: any) {
    console.error('[Vercel API create-teacher] Unexpected global exception:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: `建立教師時發生伺服器內部錯誤: ${err?.message || String(err)}`,
    });
  }
}
