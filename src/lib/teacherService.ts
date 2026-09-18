import { supabase } from './supabase';
import { Teacher } from '../types';
import { batchResolveTeacherAvatars } from './storageService';
import { safeApiPost } from './apiHelper';

/**
 * Calculates the next teacher_no (e.g. T001, T002, T008... T999, T1000...) based on existing database records.
 * Finds the maximum numerical value after 'T' and adds 1.
 */
export function calculateNextTeacherNo(teachers: any[]): string {
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

/**
 * Converts a database record in public.teachers to the frontend Teacher interface.
 */
export function mapDbToTeacher(row: any): Teacher {
  const isInactive = row.status === 'inactive' || row.is_active === false;
  return {
    id: String(row.id),
    teacherNo: row.acctno || row.emp_id || '',
    acctno: row.acctno || row.emp_id || '',
    profileId: row.profile_id || '',
    name: row.emp_name || row.tea_name || '未命名教師',
    empName: row.emp_name || row.tea_name || '未命名教師',
    englishName: row.emp_ename || '',
    empEname: row.emp_ename || '',
    title: '專任華語講師',
    department: '靜宜大學華語中心 教學組',
    avatarUrl: undefined,
    term: '2026 夏季班',
    email: row.emp_email || '',
    empEmail: row.emp_email || '',
    phone: row.emp_office_ext || '',
    empOfficeExt: row.emp_office_ext || '',
    specialty: row.emp_skill || '',
    empSkill: row.emp_skill || '',
    office: '華語中心教師室',
    status: isInactive ? 'inactive' : 'active',
    empIdno: row.emp_idno || '',
    empId: row.emp_id || '',
    teaName: row.tea_name || '',
    empUntid: row.emp_untid || '',
    empWuntid: row.emp_wuntid || '',
    empTitid: row.emp_titid || '',
    empPosid: row.emp_posid || '',
    empSex: row.emp_sex || '',
    empStudyExt: row.emp_study_ext || '',
    empTitid2: row.emp_titid2 || '',
    empUnify: row.emp_unify || '',
    assignedClasses: [],
  };
}

/**
 * Fetch all teachers directly from Supabase public.teachers and join assigned classes from public.classes.
 */
export async function fetchTeachersFromSupabase(): Promise<{ data: Teacher[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data: rawTeachers, error } = await supabase
      .from('teachers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TeacherService] Error fetching teachers:', error);
      return { data: [], error };
    }

    // Fetch classes to map teacher_id -> class names
    let teacherToClassNamesMap = new Map<string, string[]>();
    try {
      const { data: classesData } = await supabase.from('classes').select('id, name, teacher_id');
      if (classesData) {
        classesData.forEach((c: any) => {
          if (c.teacher_id) {
            const existing = teacherToClassNamesMap.get(String(c.teacher_id)) || [];
            if (c.name && !existing.includes(c.name)) {
              existing.push(c.name);
            }
            teacherToClassNamesMap.set(String(c.teacher_id), existing);
          }
        });
      }
    } catch (e) {
      console.warn('[TeacherService] Notice fetching classes for teacher mapping:', e);
    }

    const teachers = (rawTeachers || []).map((row: any) => {
      const teacher = mapDbToTeacher(row);
      const assigned = teacherToClassNamesMap.get(teacher.id) || [];
      teacher.assignedClasses = assigned;
      return teacher;
    });

    const resolvedTeachers = await batchResolveTeacherAvatars(teachers);

    return { data: resolvedTeachers, error: null };
  } catch (err: any) {
    console.error('[TeacherService] Exception fetching teachers:', err);
    return { data: [], error: err };
  }
}

/**
 * Fetches a single teacher by profileId and loads assigned classes from public.classes.
 */
export async function fetchTeacherWithClassesByProfileId(profileId: string): Promise<Teacher | null> {
  if (!supabase) return null;
  try {
    const { data: tRow, error: tErr } = await supabase
      .from('teachers')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (tErr || !tRow) return null;

    const teacher = mapDbToTeacher(tRow);
    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, class_code')
      .eq('teacher_id', tRow.id);

    if (classesData && classesData.length > 0) {
      const assigned = classesData.map((c: any) => c.name || c.class_code).filter(Boolean);
      teacher.assignedClasses = assigned;
    } else {
      teacher.assignedClasses = [];
    }

    const [resolvedTeacher] = await batchResolveTeacherAvatars([teacher]);
    return resolvedTeacher || teacher;
  } catch (err) {
    console.error('[TeacherService] Error fetching teacher with classes:', err);
    return null;
  }
}

/**
 * Updates public.classes table in Supabase so that classes match teacher assignment.
 */
export async function updateTeacherClassAssignmentsInSupabase(
  teacherId: string,
  assignedClassNames: string[],
  allClasses: any[] = []
): Promise<{ success: boolean; error: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase client not configured') };

  try {
    // 1. Unassign classes previously assigned to this teacher but no longer in assignedClassNames
    const { data: currentClasses } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', teacherId);

    if (currentClasses) {
      for (const cls of currentClasses) {
        if (!assignedClassNames.includes(cls.name)) {
          await supabase.from('classes').update({ teacher_id: null }).eq('id', cls.id);
        }
      }
    }

    // 2. Assign classes in assignedClassNames to this teacher
    for (const className of assignedClassNames) {
      await supabase
        .from('classes')
        .update({ teacher_id: teacherId })
        .eq('name', className);
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[TeacherService] Error updating teacher class assignments:', err);
    return { success: false, error: err };
  }
}

/**
 * Create a new teacher via Server-side / Vercel API (/api/admin/create-teacher).
 * Uses auth.admin.createUser with email_confirm: true on the server.
 */
export async function createTeacherInSupabase(teacherData: {
  name: string;
  englishName?: string;
  email: string;
  phone?: string;
  specialty?: string;
  password?: string;
}): Promise<{ data: Teacher | null; error: any }> {
  const cleanEmail = teacherData.email.trim();
  const cleanName = teacherData.name.trim();

  if (!cleanName || !cleanEmail) {
    return { data: null, error: new Error('教師姓名與 Email 為必填欄位') };
  }

  if (!teacherData.password || teacherData.password.length < 6) {
    return { data: null, error: new Error('密碼長度至少需要 6 位數') };
  }

  const payload = {
    name: cleanName,
    englishName: teacherData.englishName?.trim() || '',
    email: cleanEmail,
    phone: teacherData.phone?.trim() || '',
    specialty: teacherData.specialty?.trim() || '',
    password: teacherData.password,
  };

  const resp = await safeApiPost('/api/admin/create-teacher', payload, '建立教師 API');

  if (!resp.ok || !resp.data?.success) {
    const errorMsg = resp.error || resp.data?.error || '建立教師失敗';
    console.error('[TeacherService] Error creating teacher:', errorMsg);
    return {
      data: null,
      error: new Error(errorMsg),
    };
  }

  const t = resp.data.teacher;
  const mappedTeacher: Teacher = {
    id: t.id,
    teacherNo: t.teacherNo,
    acctno: t.acctno || t.teacherNo,
    profileId: t.profileId,
    name: t.name,
    empName: t.empName || t.name,
    englishName: t.englishName,
    empEname: t.empEname || t.englishName,
    title: '專任華語講師',
    department: '靜宜大學華語中心 教學組',
    avatarUrl: undefined,
    term: '2026 夏季班',
    email: t.email,
    empEmail: t.empEmail || t.email,
    phone: t.phone,
    empOfficeExt: t.empOfficeExt || t.phone,
    specialty: t.specialty,
    empSkill: t.empSkill || t.specialty,
    office: '華語中心教師室',
    status: t.status || 'active',
    assignedClasses: [],
  };

  return { data: mappedTeacher, error: null };
}

/**
 * Reset a teacher's Supabase Auth password as Admin via /api/admin/reset-teacher-password.
 */
export async function resetTeacherPasswordInSupabase(params: {
  teacherId?: string;
  profileId?: string;
  email?: string;
  newPassword: string;
}): Promise<{ success: boolean; message?: string; error: any }> {
  const resp = await safeApiPost('/api/admin/reset-teacher-password', params, '重設密碼 API');

  if (!resp.ok || !resp.data?.success) {
    const errorMsg = resp.error || resp.data?.error || '重設密碼失敗';
    console.error('[TeacherService] Error resetting password:', errorMsg);
    return {
      success: false,
      error: new Error(errorMsg),
    };
  }

  return { success: true, message: resp.data.message, error: null };
}

/**
 * Check if a teacher can be safely deleted or if they have relational dependencies (classes, sessions).
 */
export async function checkTeacherDeletableInSupabase(teacherId: string): Promise<{
  canDelete: boolean;
  hasRelations: boolean;
  teacherName?: string;
  teacherNo?: string;
  relatedClasses?: string[];
  sessionsCount?: number;
  reason?: string;
  message?: string;
  error?: string;
}> {
  const resp = await safeApiPost(
    '/api/admin/delete-teacher',
    { teacherId, action: 'check' },
    '檢查教師刪除關聯 API'
  );

  if (!resp.ok) {
    return {
      canDelete: false,
      hasRelations: true,
      error: resp.error || '無法連線伺服器檢查教師資料關聯',
    };
  }

  return resp.data;
}

/**
 * Toggle a teacher's active/inactive status in Supabase.
 * Preserves all historical class, attendance, and grading records.
 */
export async function toggleTeacherStatusInSupabase(
  teacherId: string,
  nextStatus: 'active' | 'inactive'
): Promise<{ success: boolean; status?: 'active' | 'inactive'; message?: string; error: any }> {
  const resp = await safeApiPost(
    '/api/admin/delete-teacher',
    { teacherId, action: 'toggle_status', nextStatus },
    '切換教師在職狀態 API'
  );

  if (!resp.ok || !resp.data?.success) {
    const errorMsg = resp.error || resp.data?.error || '更新教師狀態失敗';
    console.error('[TeacherService] Error toggling status:', errorMsg);
    return { success: false, error: new Error(errorMsg) };
  }

  return {
    success: true,
    status: resp.data.status,
    message: resp.data.message,
    error: null,
  };
}

/**
 * Safely delete a teacher from Supabase (only allowed when no relations exist).
 * Cleans up teacher avatar from Storage and removes Supabase Auth User + Profile.
 */
export async function deleteTeacherInSupabase(
  teacherId: string
): Promise<{ success: boolean; message?: string; error: any }> {
  const resp = await safeApiPost(
    '/api/admin/delete-teacher',
    { teacherId, action: 'delete' },
    '安全刪除教師 API'
  );

  if (!resp.ok || !resp.data?.success) {
    const errorMsg = resp.error || resp.data?.error || '刪除教師失敗';
    console.error('[TeacherService] Error deleting teacher:', errorMsg);
    return { success: false, error: new Error(errorMsg) };
  }

  return { success: true, message: resp.data.message, error: null };
}

/**
 * Updates an existing teacher record directly in Supabase public.teachers table.
 */
export async function updateTeacherInSupabase(
  teacher: Teacher
): Promise<{ data: Teacher | null; error: any }> {
  if (!supabase) return { data: null, error: new Error('Supabase client is not configured') };

  const payload: Record<string, any> = {};

  if (teacher.name !== undefined || teacher.empName !== undefined) {
    payload.emp_name = teacher.name || teacher.empName;
  }
  if (teacher.englishName !== undefined || teacher.empEname !== undefined) {
    payload.emp_ename = teacher.englishName || teacher.empEname;
  }
  if (teacher.email !== undefined || teacher.empEmail !== undefined) {
    payload.emp_email = teacher.email || teacher.empEmail;
  }
  if (teacher.phone !== undefined || teacher.empOfficeExt !== undefined) {
    payload.emp_office_ext = teacher.phone || teacher.empOfficeExt;
  }
  if (teacher.specialty !== undefined || teacher.empSkill !== undefined) {
    payload.emp_skill = teacher.specialty || teacher.empSkill;
  }
  if (teacher.acctno !== undefined || teacher.teacherNo !== undefined) {
    payload.acctno = teacher.acctno || teacher.teacherNo;
  }
  if (teacher.empIdno !== undefined) payload.emp_idno = teacher.empIdno;
  if (teacher.empId !== undefined) payload.emp_id = teacher.empId;
  if (teacher.teaName !== undefined) payload.tea_name = teacher.teaName;
  if (teacher.empUntid !== undefined) payload.emp_untid = teacher.empUntid;
  if (teacher.empWuntid !== undefined) payload.emp_wuntid = teacher.empWuntid;
  if (teacher.empTitid !== undefined) payload.emp_titid = teacher.empTitid;
  if (teacher.empPosid !== undefined) payload.emp_posid = teacher.empPosid;
  if (teacher.empSex !== undefined) payload.emp_sex = teacher.empSex;
  if (teacher.empStudyExt !== undefined) payload.emp_study_ext = teacher.empStudyExt;
  if (teacher.empTitid2 !== undefined) payload.emp_titid2 = teacher.empTitid2;
  if (teacher.empUnify !== undefined) payload.emp_unify = teacher.empUnify;

  payload.updated_at = new Date().toISOString();

  // Try updating by ID first
  let { data, error } = await supabase
    .from('teachers')
    .update(payload)
    .eq('id', teacher.id)
    .select('*')
    .maybeSingle();

  // If 0 rows updated by ID, try updating by acctno (teacherNo)
  if (!error && !data && (teacher.acctno || teacher.teacherNo)) {
    const acctnoVal = teacher.acctno || teacher.teacherNo;
    const retryRes = await supabase
      .from('teachers')
      .update(payload)
      .eq('acctno', acctnoVal)
      .select('*')
      .maybeSingle();
    data = retryRes.data;
    error = retryRes.error;
  }

  if (error) {
    console.error('[TeacherService] Error updating teacher in Supabase:', error);
    return { data: null, error };
  }

  if (!data) {
    const errorMsg = `更新教師失敗：在 public.teachers 資料表中找不到相符記錄 (ID: ${teacher.id})`;
    console.error('[TeacherService]', errorMsg);
    return { data: null, error: new Error(errorMsg) };
  }

  const updatedTeacher = mapDbToTeacher(data);
  return { data: updatedTeacher, error: null };
}

