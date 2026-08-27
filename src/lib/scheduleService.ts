import { supabase } from './supabase';
import { 
  Holiday, 
  ClassScheduleRule, 
  ClassSessionEntity, 
  ClassSessionStatus, 
  ScheduleProgress 
} from '../types';
import { TODAY_DATE, getDaysDifference } from '../utils/quarterScheduler';

/**
 * ============================================================================
 * SCHEDULE SERVICE (排課管理服務層)
 * 對應 Supabase SQL 5 資料表：
 * 1. public.holidays
 * 2. public.class_schedule_rules
 * 3. public.class_sessions
 * ============================================================================
 */

// Helper: Map database row to Holiday entity
function mapDbToHoliday(row: any): Holiday {
  return {
    id: row.id,
    termId: row.term_id,
    date: row.date,
    name: row.name,
    isSuspended: row.is_suspended ?? true,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// Helper: Map database row to ClassScheduleRule entity
function mapDbToScheduleRule(row: any): ClassScheduleRule {
  return {
    id: row.id,
    classId: row.class_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '09:00',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '12:00',
    periodsCount: row.periods_count || 3,
    classroom: row.classroom,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper: Map database row to ClassSessionEntity
function mapDbToClassSession(row: any): ClassSessionEntity {
  return {
    id: row.id,
    classId: row.class_id,
    sessionDate: row.session_date,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '09:00',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '12:00',
    periodsCount: row.periods_count || 3,
    classroom: row.classroom || '',
    status: (row.status as ClassSessionStatus) || 'NORMAL',
    rescheduledToDate: row.rescheduled_to_date,
    rescheduledFromSessionId: row.rescheduled_from_session_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    className: row.classes?.name,
    courseName: row.classes?.course_definitions?.name,
  };
}

/**
 * 檢查學期是否已封存鎖定 (terms.is_locked = true)
 * 可傳入 termId, classId, sessionId, holidayId 或 ruleId 進行動態推導
 */
export async function isTermLocked(options: {
  termId?: string;
  classId?: string;
  sessionId?: string;
  holidayId?: string;
  ruleId?: string;
}): Promise<{ isLocked: boolean; termName?: string; error?: any }> {
  if (!supabase) return { isLocked: false };

  try {
    let resolvedTermId = options.termId;

    // 1. 若給定 classId，查詢 class 的 term_id
    if (!resolvedTermId && options.classId) {
      const { data: cls } = await supabase
        .from('classes')
        .select('term_id')
        .eq('id', options.classId)
        .maybeSingle();
      if (cls?.term_id) resolvedTermId = cls.term_id;
    }

    // 2. 若給定 sessionId，查詢 session -> class -> term_id
    if (!resolvedTermId && options.sessionId) {
      const { data: sess } = await supabase
        .from('class_sessions')
        .select('class_id, classes:class_id(term_id)')
        .eq('id', options.sessionId)
        .maybeSingle();
      if ((sess as any)?.classes?.term_id) {
        resolvedTermId = (sess as any).classes.term_id;
      } else if (sess?.class_id) {
        const { data: cls } = await supabase
          .from('classes')
          .select('term_id')
          .eq('id', sess.class_id)
          .maybeSingle();
        if (cls?.term_id) resolvedTermId = cls.term_id;
      }
    }

    // 3. 若給定 holidayId，查詢 holiday 的 term_id
    if (!resolvedTermId && options.holidayId) {
      const { data: h } = await supabase
        .from('holidays')
        .select('term_id')
        .eq('id', options.holidayId)
        .maybeSingle();
      if (h?.term_id) resolvedTermId = h.term_id;
    }

    // 4. 若給定 ruleId，查詢 rule -> class -> term_id
    if (!resolvedTermId && options.ruleId) {
      const { data: r } = await supabase
        .from('class_schedule_rules')
        .select('class_id')
        .eq('id', options.ruleId)
        .maybeSingle();
      if (r?.class_id) {
        const { data: cls } = await supabase
          .from('classes')
          .select('term_id')
          .eq('id', r.class_id)
          .maybeSingle();
        if (cls?.term_id) resolvedTermId = cls.term_id;
      }
    }

    if (!resolvedTermId) {
      return { isLocked: false };
    }

    const { data: term, error: termErr } = await supabase
      .from('terms')
      .select('id, name, is_locked')
      .eq('id', resolvedTermId)
      .maybeSingle();

    if (termErr) {
      return { isLocked: false, error: termErr };
    }

    return {
      isLocked: Boolean(term?.is_locked),
      termName: term?.name,
    };
  } catch (err: any) {
    console.error('[ScheduleService] Error checking term lock status:', err);
    return { isLocked: false, error: err };
  }
}

const TERM_LOCKED_ERROR_MESSAGE = '此學期已封存鎖定，無法修改排課（禁止新增/修改規則、產生課表、調課、補課或停課）';

// ============================================================================
// 1. HOLIDAYS (校務行事曆與國定假日) CRUD
// ============================================================================

/**
 * 取得指定學期或全校通用的國定假日與停課日
 */
export async function fetchHolidays(termId?: string): Promise<{ data: Holiday[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    let query = supabase.from('holidays').select('*').order('date', { ascending: true });

    if (termId) {
      // 讀取該學期專屬假日 + 全校通用假日 (term_id IS NULL)
      query = query.or(`term_id.eq.${termId},term_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ScheduleService] Error fetching holidays:', error);
      return { data: [], error };
    }

    return { data: (data || []).map(mapDbToHoliday), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception fetching holidays:', err);
    return { data: [], error: err };
  }
}

/**
 * 新增假日或停課日
 */
export async function createHoliday(holiday: Partial<Holiday>): Promise<{ data: Holiday | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    if (holiday.termId) {
      const lockCheck = await isTermLocked({ termId: holiday.termId });
      if (lockCheck.isLocked) {
        return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
      }
    }

    const payload = {
      term_id: holiday.termId || null,
      date: holiday.date,
      name: holiday.name?.trim(),
      is_suspended: holiday.isSuspended ?? true,
      notes: holiday.notes?.trim() || null,
    };

    const { data, error } = await supabase
      .from('holidays')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error creating holiday:', error);
      return { data: null, error };
    }

    return { data: mapDbToHoliday(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception creating holiday:', err);
    return { data: null, error: err };
  }
}

/**
 * 更新假日或停課日
 */
export async function updateHoliday(
  holidayId: string, 
  updateData: Partial<Holiday>
): Promise<{ data: Holiday | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ holidayId, termId: updateData.termId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    const payload: Record<string, any> = {};
    if (updateData.name !== undefined) payload.name = updateData.name.trim();
    if (updateData.date !== undefined) payload.date = updateData.date;
    if (updateData.isSuspended !== undefined) payload.is_suspended = updateData.isSuspended;
    if (updateData.notes !== undefined) payload.notes = updateData.notes ? updateData.notes.trim() : null;
    if (updateData.termId !== undefined) payload.term_id = updateData.termId || null;

    const { data, error } = await supabase
      .from('holidays')
      .update(payload)
      .eq('id', holidayId)
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error updating holiday:', error);
      return { data: null, error };
    }

    return { data: mapDbToHoliday(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception updating holiday:', err);
    return { data: null, error: err };
  }
}

/**
 * 刪除假日
 */
export async function deleteHoliday(holidayId: string): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ holidayId });
    if (lockCheck.isLocked) {
      return { success: false, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    const { error } = await supabase.from('holidays').delete().eq('id', holidayId);
    if (error) {
      console.error('[ScheduleService] Error deleting holiday:', error);
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception deleting holiday:', err);
    return { success: false, error: err };
  }
}

// ============================================================================
// 2. CLASS SCHEDULE RULES (班級每週排課規則) CRUD
// ============================================================================

/**
 * 取得指定班級的所有每週排課規則
 */
export async function fetchScheduleRules(classId: string): Promise<{ data: ClassScheduleRule[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data, error } = await supabase
      .from('class_schedule_rules')
      .select('*')
      .eq('class_id', classId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[ScheduleService] Error fetching schedule rules:', error);
      return { data: [], error };
    }

    return { data: (data || []).map(mapDbToScheduleRule), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception fetching schedule rules:', err);
    return { data: [], error: err };
  }
}

/**
 * 取得全校所有班級的每週排課規則
 */
export async function fetchAllScheduleRules(): Promise<{ data: ClassScheduleRule[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data, error } = await supabase
      .from('class_schedule_rules')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[ScheduleService] Error fetching all schedule rules:', error);
      return { data: [], error };
    }

    return { data: (data || []).map(mapDbToScheduleRule), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in fetchAllScheduleRules:', err);
    return { data: [], error: err };
  }
}

/**
 * 新增單條排課規則
 */
export async function createScheduleRule(
  rule: Partial<ClassScheduleRule>
): Promise<{ data: ClassScheduleRule | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    if (rule.classId) {
      const lockCheck = await isTermLocked({ classId: rule.classId });
      if (lockCheck.isLocked) {
        return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
      }
    }

    const payload = {
      class_id: rule.classId,
      day_of_week: rule.dayOfWeek,
      start_time: rule.startTime?.length === 5 ? `${rule.startTime}:00` : rule.startTime,
      end_time: rule.endTime?.length === 5 ? `${rule.endTime}:00` : rule.endTime,
      periods_count: rule.periodsCount || 3,
      classroom: rule.classroom?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('class_schedule_rules')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error creating schedule rule:', error);
      return { data: null, error };
    }

    // 自動實時同步未來 class_sessions
    await syncFutureSessionsForClass(rule.classId);

    return { data: mapDbToScheduleRule(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception creating schedule rule:', err);
    return { data: null, error: err };
  }
}

/**
 * 更新單條排課規則
 */
export async function updateScheduleRule(
  ruleId: string,
  updateData: Partial<ClassScheduleRule>
): Promise<{ data: ClassScheduleRule | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ ruleId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    // 先取得該規則對應的 class_id 供後續同步
    const { data: existingRule } = await supabase
      .from('class_schedule_rules')
      .select('class_id')
      .eq('id', ruleId)
      .maybeSingle();

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.dayOfWeek !== undefined) payload.day_of_week = updateData.dayOfWeek;
    if (updateData.startTime !== undefined) {
      payload.start_time = updateData.startTime.length === 5 ? `${updateData.startTime}:00` : updateData.startTime;
    }
    if (updateData.endTime !== undefined) {
      payload.end_time = updateData.endTime.length === 5 ? `${updateData.endTime}:00` : updateData.endTime;
    }
    if (updateData.periodsCount !== undefined) payload.periods_count = updateData.periodsCount;
    if (updateData.classroom !== undefined) payload.classroom = updateData.classroom ? updateData.classroom.trim() : null;

    const { data, error } = await supabase
      .from('class_schedule_rules')
      .update(payload)
      .eq('id', ruleId)
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error updating schedule rule:', error);
      return { data: null, error };
    }

    if (existingRule?.class_id || data?.class_id) {
      await syncFutureSessionsForClass(existingRule?.class_id || data?.class_id);
    }

    return { data: mapDbToScheduleRule(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception updating schedule rule:', err);
    return { data: null, error: err };
  }
}

/**
 * 刪除單條排課規則
 */
export async function deleteScheduleRule(ruleId: string): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ ruleId });
    if (lockCheck.isLocked) {
      return { success: false, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    // 先取得該規則對應的 class_id 供刪除後同步
    const { data: existingRule } = await supabase
      .from('class_schedule_rules')
      .select('class_id')
      .eq('id', ruleId)
      .maybeSingle();

    const { error } = await supabase.from('class_schedule_rules').delete().eq('id', ruleId);
    if (error) {
      console.error('[ScheduleService] Error deleting schedule rule:', error);
      return { success: false, error };
    }

    if (existingRule?.class_id) {
      await syncFutureSessionsForClass(existingRule.class_id);
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception deleting schedule rule:', err);
    return { success: false, error: err };
  }
}

/**
 * 批次儲存/覆寫班級排課規則
 */
export async function saveScheduleRules(
  classId: string, 
  rules: Array<Partial<ClassScheduleRule>>
): Promise<{ data: ClassScheduleRule[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ classId });
    if (lockCheck.isLocked) {
      return { data: [], error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    // 1. 刪除該班級既有規則
    const { error: delError } = await supabase
      .from('class_schedule_rules')
      .delete()
      .eq('class_id', classId);

    if (delError) {
      console.error('[ScheduleService] Error clearing old rules:', delError);
      return { data: [], error: delError };
    }

    if (!rules || rules.length === 0) {
      await syncFutureSessionsForClass(classId);
      return { data: [], error: null };
    }

    // 2. 批次寫入新規則
    const payload = rules.map((r) => ({
      class_id: classId,
      day_of_week: r.dayOfWeek,
      start_time: r.startTime && r.startTime.length === 5 ? `${r.startTime}:00` : r.startTime,
      end_time: r.endTime && r.endTime.length === 5 ? `${r.endTime}:00` : r.endTime,
      periods_count: r.periodsCount || 3,
      classroom: r.classroom ? r.classroom.trim() : null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error: insError } = await supabase
      .from('class_schedule_rules')
      .insert(payload)
      .select('*')
      .order('day_of_week', { ascending: true });

    if (insError) {
      console.error('[ScheduleService] Error inserting new rules:', insError);
      return { data: [], error: insError };
    }

    await syncFutureSessionsForClass(classId);

    return { data: (data || []).map(mapDbToScheduleRule), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in saveScheduleRules:', err);
    return { data: [], error: err };
  }
}

/**
 * 自動與 Supabase 同步特定班級未來的 class_sessions (從 TODAY_DATE 開始)
 * 保留歷史與有點名者，清理舊未來堂次並寫入新規則堂次
 */
export async function syncFutureSessionsForClass(
  classId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 查班級隸屬之學期
    const { data: clsData } = await supabase
      .from('classes')
      .select('term_id')
      .eq('id', classId)
      .maybeSingle();

    let termId = clsData?.term_id;
    if (!termId) {
      const { data: currentTerm } = await supabase
        .from('terms')
        .select('id')
        .eq('is_current', true)
        .maybeSingle();
      termId = currentTerm?.id;
    }

    if (!termId) {
      termId = 'f230e634-2051-4606-ac49-adcb42480103';
    }

    const genRes = await generateQuarterSessions(termId, classId);
    if (genRes.error) {
      console.error('[ScheduleService] syncFutureSessionsForClass error:', genRes.error);
      return { success: false, error: genRes.error };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in syncFutureSessionsForClass:', err);
    return { success: false, error: err };
  }
}

// ============================================================================
// 3. CLASS SESSIONS (實際日程課堂) CRUD & GENERATOR
// ============================================================================

/**
 * 查詢指定班級的課堂堂次 (可帶日期區間)
 */
export async function fetchClassSessions(
  classId?: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: ClassSessionEntity[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    let query = supabase
      .from('class_sessions')
      .select('*')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (classId) {
      query = query.eq('class_id', classId);
    }
    if (startDate) {
      query = query.gte('session_date', startDate);
    }
    if (endDate) {
      query = query.lte('session_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ScheduleService] Error fetching class sessions:', error);
      return { data: [], error };
    }

    return { data: (data || []).map(mapDbToClassSession), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception fetching class sessions:', err);
    return { data: [], error: err };
  }
}

/**
 * 查詢指定學期所有班級的課堂堂次
 */
export async function fetchTermSessions(
  termId: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: ClassSessionEntity[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    // 1. 先查出該學期所有 classes id (若 classes 表受 RLS 限制則直接查全 sessions 或依 class_id 查詢)
    const { data: termClasses, error: classErr } = await supabase
      .from('classes')
      .select('id')
      .eq('term_id', termId);

    let query = supabase
      .from('class_sessions')
      .select('*')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (!classErr && termClasses && termClasses.length > 0) {
      const classIds = termClasses.map((c: any) => c.id);
      query = query.in('class_id', classIds);
    }

    if (startDate) {
      query = query.gte('session_date', startDate);
    }
    if (endDate) {
      query = query.lte('session_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ScheduleService] Error fetching term sessions:', error);
      return { data: [], error };
    }

    return { data: (data || []).map(mapDbToClassSession), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in fetchTermSessions:', err);
    return { data: [], error: err };
  }
}

import { fetchAttendanceRecordsFromSupabase } from './attendanceService';

/**
 * Hydrates CourseSession[] directly from Supabase public.class_sessions, public.classes, public.teachers, and public.class_students.
 */
export async function fetchCourseSessionsFromSupabase(): Promise<{ data: any[]; error: any }> {
  if (!supabase) return { data: [], error: new Error('Supabase client not configured') };

  try {
    const { data: rawSessions, error: sessErr } = await supabase
      .from('class_sessions')
      .select('*')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (sessErr) {
      console.error('[ScheduleService] Error fetching class_sessions:', sessErr);
      return { data: [], error: sessErr };
    }

    const { data: rawClasses } = await supabase.from('classes').select('*');
    const { data: rawTeachers } = await supabase.from('teachers').select('*');
    const { data: rawClassStudents } = await supabase.from('class_students').select('*');

    // Fetch saved attendance records
    const attendanceMap = await fetchAttendanceRecordsFromSupabase();

    const classMap = new Map<string, any>();
    (rawClasses || []).forEach((c: any) => classMap.set(String(c.id), c));

    const teacherMap = new Map<string, any>();
    (rawTeachers || []).forEach((t: any) => teacherMap.set(String(t.id), t));

    const classStudentsMap = new Map<string, string[]>();
    (rawClassStudents || []).forEach((cs: any) => {
      const cId = String(cs.class_id || '');
      const sId = String(cs.student_id || '');
      if (cId && sId) {
        const existing = classStudentsMap.get(cId) || [];
        if (!existing.includes(sId)) existing.push(sId);
        classStudentsMap.set(cId, existing);
      }
    });

    const hydratedSessions = (rawSessions || []).map((s: any) => {
      const cls = classMap.get(String(s.class_id)) || {};
      const tch = teacherMap.get(String(cls.teacher_id)) || {};
      const stus = classStudentsMap.get(String(s.class_id)) || [];

      const st = s.start_time ? String(s.start_time).slice(0, 5) : '09:00';
      const et = s.end_time ? String(s.end_time).slice(0, 5) : '12:00';
      const pCount = Number(s.periods_count) || 3;

      let pTimes: string[] = [];
      if (st === '09:00') {
        pTimes = ['09:00-09:50', '10:00-10:50', '11:00-11:50'];
      } else if (st === '13:00') {
        pTimes = ['13:00-13:50', '14:00-14:50', '15:00-15:50'];
      } else {
        pTimes = [`${st}-${et}`];
      }

      // Check if there is a saved attendance record for this session
      const attKey = `${s.class_id}_${s.session_date}`;
      const savedAtt = attendanceMap.get(attKey);

      const daysSince = getDaysDifference(TODAY_DATE, s.session_date);
      const isPast7Days = s.session_date < TODAY_DATE && daysSince > 7;
      const isLocked = isPast7Days || s.status === 'SUSPENDED';

      let calculatedStatus = s.status === 'SUSPENDED' ? 'holiday' : 'unmarked';
      let attendanceData = undefined;

      if (savedAtt) {
        attendanceData = savedAtt.attendanceData;
        calculatedStatus = savedAtt.isSubmitted ? 'completed' : (isPast7Days ? 'completed' : 'in_progress');
      } else if (isPast7Days && s.status !== 'SUSPENDED') {
        // Over 7 days and no saved attendance record: treat as completed default (PRESENT) without nagging
        calculatedStatus = 'completed';
      }

      return {
        id: String(s.id),
        classId: String(s.class_id),
        courseCode: cls.class_code || 'LV1',
        courseName: cls.name || '華語課程',
        className: cls.name || '華語班級',
        level: '初級',
        textbook: '《當代中文課程》',
        classroom: s.classroom || cls.classroom || '華語中心 308 教室',
        teacherId: cls.teacher_id ? String(cls.teacher_id) : '',
        teacherName: tch.emp_name || tch.tea_name || cls.teacher_name || '專任教師',
        date: s.session_date,
        startTime: st,
        endTime: et,
        timeSlot: `${st} - ${et}`,
        periodsCount: pCount,
        periodTimes: pTimes,
        studentIds: stus,
        studentCount: stus.length,
        status: calculatedStatus,
        attendanceData: attendanceData,
        isLocked: isLocked,
      };
    });

    return { data: hydratedSessions, error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in fetchCourseSessionsFromSupabase:', err);
    return { data: [], error: err };
  }
}

/**
 * 依據排課規則、學期起訖日與校務假日，為指定班級自動產生全學期 class_sessions
 */
export async function generateQuarterSessions(
  termId: string,
  classId: string
): Promise<{ 
  data: { 
    generatedCount: number; 
    targetHours: number; 
    scheduledHours: number 
  } | null; 
  error: any 
}> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ termId, classId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    // 1. 取得學期資訊 (start_date, end_date)
    const { data: rawTermData } = await supabase
      .from('terms')
      .select('id, name, start_date, end_date')
      .eq('id', termId)
      .maybeSingle();

    const termData = rawTermData || {
      id: termId,
      name: '2026 夏季學期',
      start_date: '2026-07-01',
      end_date: '2026-10-31',
    };

    if (!termData.start_date || !termData.end_date) {
      return { data: null, error: new Error('該學期未設定開課與結課日期，無法自動產生課表') };
    }

    // 2. 取得班級資訊 (target_hours, classroom)
    const { data: rawClassData } = await supabase
      .from('classes')
      .select('id, name, target_hours, classroom')
      .eq('id', classId)
      .maybeSingle();

    const classData = rawClassData || {
      id: classId,
      name: '華語班級',
      target_hours: 108,
      classroom: '華語中心 308 教室',
    };

    const targetHours = Number(classData.target_hours ?? 0);
    const defaultClassroom = classData.classroom || '華語中心 301 教室';

    // 3. 取得班級排課規則
    const { data: rules, error: rulesError } = await supabase
      .from('class_schedule_rules')
      .select('*')
      .eq('class_id', classId)
      .order('day_of_week', { ascending: true });

    if (rulesError) {
      return { data: null, error: rulesError };
    }

    if (!rules || rules.length === 0) {
      return { 
        data: null, 
        error: new Error(`【${classData.name}】尚未設定每週排課規則！請先於「排課規則」中新增每週上課星期與時段。`) 
      };
    }

    // 4. 取得該學期停課假日 (is_suspended = true)
    const { data: holidayRows, error: holError } = await supabase
      .from('holidays')
      .select('date')
      .or(`term_id.eq.${termId},term_id.is.null`)
      .eq('is_suspended', true);

    if (holError) {
      console.warn('[ScheduleService] Warning reading holidays:', holError);
    }

    const suspendedDatesSet = new Set<string>((holidayRows || []).map((h: any) => h.date));

    // 5. 依日期區間逐日產生課堂（精確符合 target_hours 上限即停止）
    const [sYear, sMonth, sDay] = termData.start_date.split('-').map(Number);
    const [eYear, eMonth, eDay] = termData.end_date.split('-').map(Number);
    const startDate = new Date(sYear, sMonth - 1, sDay, 12, 0, 0);
    const endDate = new Date(eYear, eMonth - 1, eDay, 12, 0, 0);
    const sessionsToInsert: any[] = [];
    let currentHours = 0;

    const rulesMap = new Map<number, any[]>();
    rules.forEach((r: any) => {
      const dow = Number(r.day_of_week);
      if (!rulesMap.has(dow)) rulesMap.set(dow, []);
      rulesMap.get(dow)!.push(r);
    });

    const iterDate = new Date(startDate);
    while (iterDate <= endDate) {
      if (targetHours > 0 && currentHours >= targetHours) {
        break;
      }

      // YYYY-MM-DD format without UTC timezone shift
      const y = iterDate.getFullYear();
      const m = String(iterDate.getMonth() + 1).padStart(2, '0');
      const d = String(iterDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      
      // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat -> Convert to ISO 1=Mon, ..., 7=Sun
      const jsDay = iterDate.getDay();
      const isoDayOfWeek = jsDay === 0 ? 7 : jsDay;

      // 檢查是否為停課日
      const isSuspended = suspendedDatesSet.has(dateStr);

      if (!isSuspended && rulesMap.has(isoDayOfWeek)) {
        const dayRules = rulesMap.get(isoDayOfWeek)!;
        for (const rule of dayRules) {
          if (targetHours > 0 && currentHours >= targetHours) {
            break;
          }

          const periods = Number(rule.periods_count) || 3;
          sessionsToInsert.push({
            class_id: classId,
            session_date: dateStr,
            day_of_week: isoDayOfWeek,
            start_time: rule.start_time,
            end_time: rule.end_time,
            periods_count: periods,
            classroom: rule.classroom || defaultClassroom,
            status: 'NORMAL',
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          currentHours += periods;
        }
      }

      // 下一天
      iterDate.setDate(iterDate.getDate() + 1);
    }

    if (sessionsToInsert.length === 0) {
      return { 
        data: null, 
        error: new Error('在學期起訖期間內未能匹配到任何符合規則的上課日期') 
      };
    }

    // 6. 取得該班級已有的 class_sessions，保護歷史堂次與已點名紀錄
    const { data: existingSessions } = await supabase
      .from('class_sessions')
      .select('id, session_date, start_time, status')
      .eq('class_id', classId);

    const attendanceMap = await fetchAttendanceRecordsFromSupabase();

    // 建立保護與已有 Slot 清單：
    // 1) 過去的堂次 (session_date < TODAY_DATE)
    // 2) 已有點名紀錄者 (attendanceMap.has(attKey))
    // 3) 狀態不為 NORMAL 者 (如 RESCHEDULED, MAKEUP, SUSPENDED)
    const protectedIds = new Set<string>();
    const existingSlotKeys = new Set<string>();

    (existingSessions || []).forEach((s: any) => {
      const attKey = `${classId}_${s.session_date}`;
      const hasAtt = attendanceMap.has(attKey);
      const isPast = s.session_date < TODAY_DATE;
      const isNotNormal = s.status !== 'NORMAL';

      if (isPast || hasAtt || isNotNormal) {
        protectedIds.add(String(s.id));
      }
    });

    // 找出只屬於未來 (session_date >= TODAY_DATE)、尚未發生且無點名的 NORMAL 堂次進行清理重刷
    const deletableFutureIds = (existingSessions || [])
      .filter((s: any) => s.session_date >= TODAY_DATE && s.status === 'NORMAL' && !protectedIds.has(String(s.id)))
      .map((s: any) => String(s.id));

    if (deletableFutureIds.length > 0) {
      const { error: clearError } = await supabase
        .from('class_sessions')
        .delete()
        .in('id', deletableFutureIds);

      if (clearError) {
        console.error('[ScheduleService] Error clearing future unstarted sessions:', clearError);
        return { data: null, error: clearError };
      }
    }

    // 清理完畢後，紀錄資料庫中被保留保護下來的槽位 (session_date + start_time)
    const setOfDeletableIds = new Set(deletableFutureIds);
    (existingSessions || []).forEach((s: any) => {
      if (!setOfDeletableIds.has(String(s.id))) {
        const timeStr = s.start_time ? String(s.start_time).slice(0, 5) : '';
        existingSlotKeys.add(`${s.session_date}_${timeStr}`);
      }
    });

    // 只寫入未來日期 (session_date >= TODAY_DATE) 且未被已有堂次佔用的新堂次 (絕對不去防護區或重複撞期)
    const seenSlotsToInsert = new Set<string>();
    const finalToInsert = sessionsToInsert.filter((s) => {
      if (s.session_date < TODAY_DATE) return false;
      const startTimeStr = s.start_time ? String(s.start_time).slice(0, 5) : '';
      const slotKey = `${s.session_date}_${startTimeStr}`;
      
      if (existingSlotKeys.has(slotKey) || seenSlotsToInsert.has(slotKey)) {
        return false;
      }
      seenSlotsToInsert.add(slotKey);
      return true;
    });

    if (finalToInsert.length === 0) {
      return {
        data: {
          generatedCount: 0,
          targetHours,
          scheduledHours: currentHours,
        },
        error: null,
      };
    }

    // 7. 批次寫入新產生的未來 class_sessions
    const chunkSize = 100;
    for (let i = 0; i < finalToInsert.length; i += chunkSize) {
      const chunk = finalToInsert.slice(i, i + chunkSize);
      const { error: insError } = await supabase
        .from('class_sessions')
        .insert(chunk);

      if (insError) {
        console.error('[ScheduleService] Error inserting generated future sessions chunk:', insError);
        return { data: null, error: insError };
      }
    }

    return {
      data: {
        generatedCount: finalToInsert.length,
        targetHours,
        scheduledHours: currentHours,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in generateQuarterSessions:', err);
    return { data: null, error: err };
  }
}

/**
 * 更新堂次狀態 (NORMAL, RESCHEDULED, MAKEUP, CANCELLED)
 */
export async function updateSessionStatus(
  sessionId: string,
  status: ClassSessionStatus,
  notes?: string
): Promise<{ data: ClassSessionEntity | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ sessionId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    const payload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) {
      payload.notes = notes ? notes.trim() : null;
    }

    const { data, error } = await supabase
      .from('class_sessions')
      .update(payload)
      .eq('id', sessionId)
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error updating session status:', error);
      return { data: null, error };
    }

    return { data: mapDbToClassSession(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception updating session status:', err);
    return { data: null, error: err };
  }
}

/**
 * 線上調課作業：
 * 1. 原堂次標記為 RESCHEDULED，記錄 rescheduled_to_date 與原因
 * 2. 在新日期建立 MAKEUP 補課堂次，記錄 rescheduled_from_session_id
 */
export async function rescheduleSession(
  sessionId: string,
  targetDate: string,
  targetStartTime?: string,
  targetEndTime?: string,
  reason?: string
): Promise<{ data: { original: ClassSessionEntity; makeup: ClassSessionEntity } | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ sessionId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    // 1. 取得原堂次資料
    const { data: origData, error: fetchErr } = await supabase
      .from('class_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !origData) {
      return { data: null, error: new Error(`找不到原課堂資料: ${fetchErr?.message || ''}`) };
    }

    const targetDateObj = new Date(targetDate);
    const jsDay = targetDateObj.getDay();
    const targetDayOfWeek = jsDay === 0 ? 7 : jsDay;

    const startTime = targetStartTime || origData.start_time;
    const endTime = targetEndTime || origData.end_time;

    // 2. 更新原堂次為 RESCHEDULED
    const { data: updatedOrig, error: origUpdateErr } = await supabase
      .from('class_sessions')
      .update({
        status: 'RESCHEDULED',
        rescheduled_to_date: targetDate,
        notes: reason ? `已調課至 ${targetDate}。原因: ${reason}` : `已調課至 ${targetDate}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (origUpdateErr) {
      return { data: null, error: origUpdateErr };
    }

    // 3. 建立新 MAKEUP 補課堂次 (透過 rescheduled_from_session_id 關聯原堂次)
    const { data: createdMakeup, error: makeupErr } = await supabase
      .from('class_sessions')
      .insert([{
        class_id: origData.class_id,
        session_date: targetDate,
        day_of_week: targetDayOfWeek,
        start_time: startTime,
        end_time: endTime,
        periods_count: origData.periods_count,
        classroom: origData.classroom,
        status: 'MAKEUP',
        rescheduled_from_session_id: sessionId,
        notes: reason ? `由 ${origData.session_date} 調課補課: ${reason}` : `由 ${origData.session_date} 調課補課`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select('*')
      .single();

    if (makeupErr) {
      return { data: null, error: makeupErr };
    }

    return {
      data: {
        original: mapDbToClassSession(updatedOrig),
        makeup: mapDbToClassSession(createdMakeup),
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in rescheduleSession:', err);
    return { data: null, error: err };
  }
}

/**
 * 建立獨立補課堂次 (可關聯原堂次或獨立新增)
 */
export async function createMakeupSession(
  classId: string,
  sessionDate: string,
  startTime: string,
  endTime: string,
  periodsCount: number = 3,
  originalSessionId?: string,
  classroom?: string,
  notes?: string
): Promise<{ data: ClassSessionEntity | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ classId, sessionId: originalSessionId });
    if (lockCheck.isLocked) {
      return { data: null, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    const dateObj = new Date(sessionDate);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const payload = {
      class_id: classId,
      session_date: sessionDate,
      day_of_week: dayOfWeek,
      start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
      end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
      periods_count: periodsCount,
      classroom: classroom?.trim() || null,
      status: 'MAKEUP',
      rescheduled_from_session_id: originalSessionId || null,
      notes: notes?.trim() || '專屬補課堂次',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('class_sessions')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('[ScheduleService] Error creating makeup session:', error);
      return { data: null, error };
    }

    return { data: mapDbToClassSession(data), error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in createMakeupSession:', err);
    return { data: null, error: err };
  }
}

/**
 * 停課作業
 */
export async function cancelSession(
  sessionId: string,
  reason?: string
): Promise<{ data: ClassSessionEntity | null; error: any }> {
  return updateSessionStatus(sessionId, 'CANCELLED', reason ? `停課原因: ${reason}` : '因故停課');
}

/**
 * 恢復正常上課堂次 (將 CANCELLED 或 RESCHEDULED 恢復為 NORMAL)
 */
export async function restoreSession(
  sessionId: string
): Promise<{ data: ClassSessionEntity | null; error: any }> {
  return updateSessionStatus(sessionId, 'NORMAL', '已恢復正常上課');
}

/**
 * 刪除單堂課
 */
export async function deleteClassSession(sessionId: string): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 檢查學期鎖定狀態
    const lockCheck = await isTermLocked({ sessionId });
    if (lockCheck.isLocked) {
      return { success: false, error: new Error(TERM_LOCKED_ERROR_MESSAGE) };
    }

    const { error } = await supabase.from('class_sessions').delete().eq('id', sessionId);
    if (error) {
      console.error('[ScheduleService] Error deleting class session:', error);
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error('[ScheduleService] Exception deleting class session:', err);
    return { success: false, error: err };
  }
}

/**
 * 計算指定班級的目標時數與目前有效排課進度 (165 小時進度)
 * 有效時數 = NORMAL 堂數 * 節數 + MAKEUP 堂數 * 節數 (CANCELLED 與 RESCHEDULED 不重複計入)
 */
export async function getScheduleProgress(
  classId: string,
  knownTargetHours?: number
): Promise<{ data: ScheduleProgress | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    let targetHours = knownTargetHours;

    // 1. 取得班級 target_hours (若外部未提供已知 target_hours 則向資料庫查詢)
    if (targetHours === undefined || targetHours === null) {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id, target_hours')
        .eq('id', classId)
        .single();

      if (!clsErr && cls && cls.target_hours !== undefined && cls.target_hours !== null) {
        targetHours = Number(cls.target_hours);
      } else {
        targetHours = 0;
      }
    }

    // 2. 取得所有 sessions
    const { data: sessions, error: sessErr } = await supabase
      .from('class_sessions')
      .select('status, periods_count')
      .eq('class_id', classId);

    if (sessErr) {
      return { data: null, error: sessErr };
    }

    let scheduledHours = 0;
    let normalSessionsCount = 0;
    let makeupSessionsCount = 0;
    let rescheduledSessionsCount = 0;
    let cancelledSessionsCount = 0;

    (sessions || []).forEach((s: any) => {
      const p = Number(s.periods_count) || 3;
      if (s.status === 'NORMAL') {
        normalSessionsCount++;
        scheduledHours += p;
      } else if (s.status === 'MAKEUP') {
        makeupSessionsCount++;
        scheduledHours += p;
      } else if (s.status === 'RESCHEDULED') {
        rescheduledSessionsCount++;
      } else if (s.status === 'CANCELLED') {
        cancelledSessionsCount++;
      }
    });

    const remainingHours = Math.max(0, targetHours - scheduledHours);
    const progressPercentage = targetHours > 0 
      ? Math.min(100, Math.round((scheduledHours / targetHours) * 100))
      : 0;

    return {
      data: {
        targetHours,
        scheduledHours,
        remainingHours,
        progressPercentage,
        normalSessionsCount,
        makeupSessionsCount,
        rescheduledSessionsCount,
        cancelledSessionsCount,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[ScheduleService] Exception in getScheduleProgress:', err);
    return { data: null, error: err };
  }
}
