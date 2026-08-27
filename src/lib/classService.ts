import { supabase } from './supabase';
import { ClassEntity } from '../types';

/**
 * Converts a database record in public.classes to the frontend ClassEntity interface.
 */
export function mapDbToClass(row: any): ClassEntity {
  const courseDef = row.course_definitions;
  const courseName = courseDef?.name || row.course_name || row.courseName || row.name || '';
  const termDef = row.terms;
  const termName = termDef?.name || row.term_name || row.term || '未指定學期';
  const termId = row.term_id || termDef?.id || row.termId || '';

  return {
    id: String(row.id),
    classCode: row.class_code || row.classCode || `CLS-${row.id}`,
    name: row.name || row.class_name || '未命名班級',
    courseId: row.course_definition_id || row.course_id || row.courseId || '',
    courseName: courseName,
    teacherId: row.teacher_id || row.teacherId || '',
    teacherName: row.teacher_name || row.teacherName || '未指定教師',
    classroom: row.classroom || '華語中心 301 教室',
    termId: termId,
    term: termName,
    startDate: row.start_date || termDef?.start_date || row.startDate || '2026-07-01',
    endDate: row.end_date || termDef?.end_date || row.endDate || '2026-10-31',
    dailyHours: Number(row.daily_hours || row.dailyHours || 3),
    weeklyDays: Array.isArray(row.weekly_days) ? row.weekly_days : [1, 2, 3, 4, 5],
    timeSlot: row.schedule_description || row.time_slot || row.timeSlot || '09:00 - 12:00',
    totalTargetHours: Number(row.target_hours ?? row.total_target_hours ?? 0),
    maxCapacity: Number(row.max_capacity || 15),
    studentCount: Number(row.student_count || 0),
    studentIds: Array.isArray(row.student_ids) ? row.student_ids : [],
    status: (row.status || 'OPEN') as 'planning' | 'ongoing' | 'completed' | 'OPEN' | 'CLOSED' | string,
  };
}

/**
 * Fetch all classes from Supabase public.classes, enriched with accurate enrollment counts, course definitions and terms.
 */
export async function fetchClassesFromSupabase(): Promise<{ data: ClassEntity[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data: rawClasses, error: classErr } = await supabase
      .from('classes')
      .select('*, course_definitions(id, name, code), terms(id, name, term_code, is_locked, is_active, start_date, end_date)')
      .order('name', { ascending: true });

    if (classErr) {
      console.error('[ClassService] Error fetching classes from Supabase:', classErr);
      return { data: [], error: classErr };
    }

    if (!rawClasses || rawClasses.length === 0) {
      return { data: [], error: null };
    }

    // Fetch enrollment counts from class_students
    let countMap: Record<string, number> = {};
    let studentIdsMap: Record<string, string[]> = {};
    try {
      const { data: rawEnrollments, error: enrollErr } = await supabase
        .from('class_students')
        .select('class_id, student_id');

      if (!enrollErr && rawEnrollments) {
        rawEnrollments.forEach((row: any) => {
          const cId = String(row.class_id);
          const sId = String(row.student_id);
          countMap[cId] = (countMap[cId] || 0) + 1;
          if (!studentIdsMap[cId]) studentIdsMap[cId] = [];
          studentIdsMap[cId].push(sId);
        });
      }
    } catch (e) {
      console.warn('[ClassService] Notice counting class enrollments:', e);
    }

    const mapped = rawClasses.map((row: any) => {
      const cls = mapDbToClass(row);
      const cId = String(row.id);
      cls.studentCount = countMap[cId] || 0;
      cls.studentIds = studentIdsMap[cId] || [];
      return cls;
    });

    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('[ClassService] Unexpected error in fetchClassesFromSupabase:', err);
    return { data: [], error: err };
  }
}

/**
 * Creates a new class directly in Supabase public.classes table.
 */
export async function createClassInSupabase(
  classData: Partial<ClassEntity>
): Promise<{ data: ClassEntity | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 1. Resolve term_id if available
    let termId: string | null = null;
    try {
      const { data: termRows } = await supabase
        .from('terms')
        .select('id')
        .eq('is_active', true)
        .limit(1);

      if (termRows && termRows.length > 0) {
        termId = termRows[0].id;
      } else {
        const { data: anyTerm } = await supabase
          .from('terms')
          .select('id')
          .limit(1);
        if (anyTerm && anyTerm.length > 0) {
          termId = anyTerm[0].id;
        }
      }
    } catch {
      // Ignore term resolution error
    }

    const payload: Record<string, any> = {
      name: classData.name,
      class_code: classData.classCode || `CLS-${Date.now().toString().slice(-6)}`,
      classroom: classData.classroom || '華語中心 301 教室',
      schedule_description: classData.timeSlot || '09:00 - 12:00',
      target_hours: Number(classData.totalTargetHours) || 0,
      status: classData.status || 'OPEN',
      max_capacity: Number(classData.maxCapacity) || 15,
    };

    if (classData.courseId && classData.courseId.trim()) {
      payload.course_definition_id = classData.courseId.trim();
    }

    if (classData.termId && classData.termId.trim()) {
      payload.term_id = classData.termId.trim();
    } else if (termId) {
      payload.term_id = termId;
    }

    let { data, error } = await supabase
      .from('classes')
      .insert(payload)
      .select('*, course_definitions(id, name, code), terms(id, name, term_code, is_locked, is_active, start_date, end_date)')
      .single();

    if (error && (error.code === '23505' || error.message?.includes('classes_class_code_key'))) {
      console.warn('[ClassService] Duplicate key on class_code insert (code 23505). Retrying with auto-suffix...');
      const uniqueSuffix = Date.now().toString().slice(-4) + Math.floor(10 + Math.random() * 90);
      payload.class_code = `${payload.class_code}-${uniqueSuffix}`;
      const retryResult = await supabase
        .from('classes')
        .insert(payload)
        .select('*, course_definitions(id, name, code), terms(id, name, term_code, is_locked, is_active, start_date, end_date)')
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error('[ClassService] Error creating class in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToClass(data), error: null };
  } catch (err: any) {
    console.error('[ClassService] Exception in createClassInSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Updates an existing class in Supabase public.classes table.
 */
export async function updateClassInSupabase(
  classId: string,
  updateData: Partial<ClassEntity>
): Promise<{ data: ClassEntity | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.name !== undefined) payload.name = updateData.name;
    if (updateData.classCode !== undefined) payload.class_code = updateData.classCode;
    if (updateData.classroom !== undefined) payload.classroom = updateData.classroom;
    if (updateData.timeSlot !== undefined) payload.schedule_description = updateData.timeSlot;
    if (updateData.totalTargetHours !== undefined) payload.target_hours = Number(updateData.totalTargetHours);
    if (updateData.maxCapacity !== undefined) payload.max_capacity = Number(updateData.maxCapacity);
    if (updateData.status !== undefined) payload.status = updateData.status;

    if (updateData.courseId !== undefined) {
      payload.course_definition_id = updateData.courseId && updateData.courseId.trim() ? updateData.courseId.trim() : null;
    }

    if (updateData.termId !== undefined) {
      payload.term_id = updateData.termId && updateData.termId.trim() ? updateData.termId.trim() : null;
    }

    let { data, error } = await supabase
      .from('classes')
      .update(payload)
      .eq('id', classId)
      .select('*, course_definitions(id, name, code), terms(id, name, term_code, is_locked, is_active, start_date, end_date)')
      .single();

    if (error && (error.code === '23505' || error.message?.includes('classes_class_code_key'))) {
      console.warn('[ClassService] Duplicate key on class_code update (code 23505). Retrying with auto-suffix...');
      const uniqueSuffix = Date.now().toString().slice(-4) + Math.floor(10 + Math.random() * 90);
      payload.class_code = `${payload.class_code || 'CLS'}-${uniqueSuffix}`;
      const retryResult = await supabase
        .from('classes')
        .update(payload)
        .eq('id', classId)
        .select('*, course_definitions(id, name, code), terms(id, name, term_code, is_locked, is_active, start_date, end_date)')
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error('[ClassService] Error updating class in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToClass(data), error: null };
  } catch (err: any) {
    console.error('[ClassService] Exception in updateClassInSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Toggles a class status between OPEN and CLOSED in Supabase public.classes table.
 */
export async function toggleClassStatusInSupabase(
  classId: string,
  newStatus: 'OPEN' | 'CLOSED' | string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    const { error } = await supabase
      .from('classes')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classId);

    if (error) {
      console.error('[ClassService] Error toggling class status in Supabase:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ClassService] Exception in toggleClassStatusInSupabase:', err);
    return { success: false, error: err };
  }
}

/**
 * Safely deletes a class from Supabase public.classes.
 * Strict safety check: If any student is currently assigned in class_students, deletion is BLOCKED.
 */
export async function deleteClassInSupabase(
  classId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 1. Check if there are any students currently enrolled in this class
    const { data: enrolledStudents, error: checkError } = await supabase
      .from('class_students')
      .select('id, student_id')
      .eq('class_id', classId);

    if (checkError) {
      console.error('[ClassService] Error checking enrolled students:', checkError);
      return { success: false, error: checkError };
    }

    if (enrolledStudents && enrolledStudents.length > 0) {
      const studentCount = enrolledStudents.length;
      return {
        success: false,
        error: new Error(`此班級尚有 ${studentCount} 名學生在班，請先將學生轉班或移出後再刪除。`),
      };
    }

    // 2. Safe to delete empty class
    const { error: deleteError } = await supabase
      .from('classes')
      .delete()
      .eq('id', classId);

    if (deleteError) {
      console.error('[ClassService] Error deleting empty class from Supabase:', deleteError);
      return { success: false, error: deleteError };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ClassService] Exception in deleteClassInSupabase:', err);
    return { success: false, error: err };
  }
}
