import { supabase } from './supabase';
import { ClassEntity } from '../types';
import { fetchClassMaterialsFromSupabase, saveClassMaterialsInSupabase } from './materialService';

/**
 * Converts a database record in public.classes to the frontend ClassEntity interface.
 */
export function mapDbToClass(row: any): ClassEntity {
  const termDef = row.terms;
  const termName = termDef?.name || row.term_name || row.term || '未指定學期';
  const termId = row.term_id || termDef?.id || row.termId || '';
  const cap = Number(row.capacity || row.max_capacity || row.maxCapacity || 40);

  const teacherDef = row.teachers;
  const teacherId = row.teacher_id || row.teacherId || '';
  let teacherName = '';
  if (teacherDef && (teacherDef.emp_name || teacherDef.tea_name)) {
    teacherName = teacherDef.emp_name || teacherDef.tea_name;
  } else if (row.teacher_name || row.teacherName) {
    teacherName = row.teacher_name || row.teacherName;
  } else if (!teacherId) {
    teacherName = '未指定教師';
  }

  return {
    id: String(row.id),
    classCode: row.class_code || row.classCode || `CLS-${row.id}`,
    name: row.name || row.class_name || '未命名班級',
    courseId: '',
    courseName: row.name || '班級',
    teacherId: teacherId,
    teacherName: teacherName || (teacherId ? '' : '未指定教師'),
    classroom: row.classroom || '伯鐸402',
    termId: termId,
    term: termName,
    startDate: row.start_date || termDef?.start_date || row.startDate || '2026-07-01',
    endDate: row.end_date || termDef?.end_date || row.endDate || '2026-10-31',
    dailyHours: Number(row.daily_hours || row.dailyHours || 3),
    weeklyDays: Array.isArray(row.weekly_days) ? row.weekly_days : [1, 2, 3, 4, 5],
    timeSlot: row.schedule_description || row.time_slot || row.timeSlot || '09:10－12:00',
    totalTargetHours: Number(row.target_hours ?? row.total_target_hours ?? 0),
    maxCapacity: cap,
    capacity: cap,
    studentCount: Number(row.student_count || 0),
    studentIds: Array.isArray(row.student_ids) ? row.student_ids : [],
    materials: Array.isArray(row.materials) ? row.materials : [],
    remarks: row.remarks !== undefined && row.remarks !== null ? String(row.remarks) : '',
    status: (row.status || 'OPEN') as 'planning' | 'ongoing' | 'completed' | 'OPEN' | 'CLOSED' | string,
  };
}

/**
 * Fetch all classes from Supabase public.classes, enriched with accurate enrollment counts, terms, and materials.
 */
export async function fetchClassesFromSupabase(): Promise<{ data: ClassEntity[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data: rawClasses, error: classErr } = await supabase
      .from('classes')
      .select('*, terms(id, name, term_code, is_locked, is_active, start_date, end_date), teachers(id, emp_name, tea_name)')
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

    // Fetch class materials map
    let materialsMap: Record<string, any[]> = {};
    try {
      const { data: allClassMats } = await fetchClassMaterialsFromSupabase();
      if (allClassMats && allClassMats.length > 0) {
        allClassMats.forEach((cm) => {
          if (!materialsMap[cm.classId]) materialsMap[cm.classId] = [];
          materialsMap[cm.classId].push(cm);
        });
      }
    } catch (e) {
      console.warn('[ClassService] Notice fetching class materials:', e);
    }

    const mapped = rawClasses.map((row: any) => {
      const cls = mapDbToClass(row);
      const cId = String(row.id);
      const cmList = materialsMap[cId] || [];
      cls.studentCount = countMap[cId] || 0;
      cls.studentIds = studentIdsMap[cId] || [];
      cls.materials = cmList;
      cls.materialIds = cmList.map((cm: any) => cm.materialId);
      cls.materialNames = cmList.map((cm: any) => cm.materialName);
      return cls;
    });

    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('[ClassService] Unexpected error in fetchClassesFromSupabase:', err);
    return { data: [], error: err };
  }
}

/**
 * Executes a Supabase classes table operation with schema resilience (e.g. PGRST204 missing columns, 23505 unique class_code).
 */
async function executeClassOperationWithResilience(
  operation: (payload: Record<string, any>) => Promise<{ data: any; error: any }>,
  initialPayload: Record<string, any>,
  maxRetries = 5
): Promise<{ data: any; error: any }> {
  const currentPayload = { ...initialPayload };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await operation(currentPayload);

    if (!res.error) {
      return res;
    }

    // 1. Handle duplicate key on class_code (code 23505)
    if (res.error.code === '23505' || (typeof res.error.message === 'string' && res.error.message.includes('classes_class_code_key'))) {
      const uniqueSuffix = Date.now().toString().slice(-4) + Math.floor(10 + Math.random() * 90);
      currentPayload.class_code = `${currentPayload.class_code || 'CLS'}-${uniqueSuffix}`;
      console.warn(`[ClassService Resilience] Duplicate key on class_code. Retrying with '${currentPayload.class_code}'...`);
      continue;
    }

    // 2. Handle PGRST204 missing column in schema cache (e.g. 'capacity')
    if (res.error.code === 'PGRST204' && typeof res.error.message === 'string') {
      const match = res.error.message.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        if (missingCol in currentPayload) {
          delete currentPayload[missingCol];
          console.warn(`[ClassService Resilience] Column '${missingCol}' not found in public.classes schema cache. Stripping and retrying...`);
          continue;
        }
      }
    }

    return res;
  }

  return { data: null, error: new Error('Exceeded max retries for class operation resilience') };
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

    const cap = Number(classData.capacity || classData.maxCapacity || 40);
    const payload: Record<string, any> = {
      name: classData.name,
      class_code: classData.classCode || `CLS-${Date.now().toString().slice(-6)}`,
      classroom: classData.classroom || '伯鐸402',
      schedule_description: classData.timeSlot || '09:10－12:00',
      target_hours: Number(classData.totalTargetHours) || 0,
      status: classData.status || 'OPEN',
      capacity: cap,
      max_capacity: cap,
    };

    if (classData.remarks !== undefined) {
      payload.remarks = classData.remarks;
    }

    if (classData.teacherId !== undefined) {
      payload.teacher_id = classData.teacherId && classData.teacherId.trim() ? classData.teacherId.trim() : null;
    }

    if (classData.termId && classData.termId.trim()) {
      payload.term_id = classData.termId.trim();
    } else if (termId) {
      payload.term_id = termId;
    }

    const { data, error } = await executeClassOperationWithResilience(async (p) => {
      return await supabase!
        .from('classes')
        .insert(p)
        .select('*, terms(id, name, term_code, is_locked, is_active, start_date, end_date), teachers(id, emp_name, tea_name)')
        .single();
    }, payload);

    if (error) {
      console.error('[ClassService] Error creating class in Supabase:', error);
      return { data: null, error };
    }

    if (data && Array.isArray(classData.materialIds)) {
      const { success, error: matErr } = await saveClassMaterialsInSupabase(data.id, classData.materialIds);
      if (!success || matErr) {
        console.error('[ClassService] Error saving class_materials on create:', matErr);
        return { data: null, error: matErr || new Error('儲存班級教材失敗') };
      }
    }

    // 從 Supabase 重新查詢該班級實際存在的 class_materials
    const { data: freshMats, error: matFetchErr } = await fetchClassMaterialsFromSupabase(data.id);
    if (matFetchErr) {
      console.error('[ClassService] Error re-fetching fresh class_materials:', matFetchErr);
      return { data: null, error: matFetchErr };
    }

    const cls = mapDbToClass(data);
    cls.materials = freshMats || [];
    cls.materialIds = (freshMats || []).map((m: any) => m.materialId);
    cls.materialNames = (freshMats || []).map((m: any) => m.materialName);
    return { data: cls, error: null };
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
    if (updateData.capacity !== undefined || updateData.maxCapacity !== undefined) {
      const cap = Number(updateData.capacity || updateData.maxCapacity || 40);
      payload.capacity = cap;
      payload.max_capacity = cap;
    }
    if (updateData.status !== undefined) payload.status = updateData.status;

    if (updateData.remarks !== undefined) {
      payload.remarks = updateData.remarks;
    }

    if (updateData.teacherId !== undefined) {
      payload.teacher_id = updateData.teacherId && updateData.teacherId.trim() ? updateData.teacherId.trim() : null;
    }

    if (updateData.termId !== undefined) {
      payload.term_id = updateData.termId && updateData.termId.trim() ? updateData.termId.trim() : null;
    }

    const { data, error } = await executeClassOperationWithResilience(async (p) => {
      return await supabase!
        .from('classes')
        .update(p)
        .eq('id', classId)
        .select('*, terms(id, name, term_code, is_locked, is_active, start_date, end_date), teachers(id, emp_name, tea_name)')
        .single();
    }, payload);

    if (error) {
      console.error('[ClassService] Error updating class in Supabase:', error);
      return { data: null, error };
    }

    if (data && Array.isArray(updateData.materialIds)) {
      const { success, error: matErr } = await saveClassMaterialsInSupabase(classId, updateData.materialIds);
      if (!success || matErr) {
        console.error('[ClassService] Error updating class_materials on update:', matErr);
        return { data: null, error: matErr || new Error('儲存班級教材失敗') };
      }
    }

    // 從 Supabase 重新查詢該班級實際存在的 class_materials
    const { data: freshMats, error: matFetchErr } = await fetchClassMaterialsFromSupabase(classId);
    if (matFetchErr) {
      console.error('[ClassService] Error re-fetching fresh class_materials:', matFetchErr);
      return { data: null, error: matFetchErr };
    }

    const cls = mapDbToClass(data);
    cls.materials = freshMats || [];
    cls.materialIds = (freshMats || []).map((m: any) => m.materialId);
    cls.materialNames = (freshMats || []).map((m: any) => m.materialName);
    return { data: cls, error: null };
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
