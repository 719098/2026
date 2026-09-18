import { supabase } from './supabase';
import { CourseSession, StudentPeriodAttendance, LeaveRecord, Student, ClassEntity, LeaveType } from '../types';
import { getAttendanceEvidenceSignedUrl } from './storageService';

export interface SaveAttendanceParams {
  course: CourseSession;
  attendanceData: { [studentId: string]: StudentPeriodAttendance };
  targetStatus: 'in_progress' | 'completed';
  operatedBy?: string;
}

/**
 * Saves attendance to Supabase `course_sessions` and `attendance_records` tables.
 * Returns { success: true } or { success: false, error }.
 */
export async function saveAttendanceToSupabase(
  params: SaveAttendanceParams
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return {
      success: false,
      error: new Error('Supabase client is not initialized'),
    };
  }

  const { course, attendanceData, targetStatus, operatedBy } = params;

  try {
    const isSubmitted = targetStatus === 'completed';

    // Helper: ensure operated_by is a valid UUID or user ID
    let validOperatedBy: string | null = null;
    if (operatedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operatedBy)) {
      validOperatedBy = operatedBy;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        validOperatedBy = userData.user.id;
      }
    }

    // 1. Find or create the course_sessions row
    let { data: existingCS, error: csSelectErr } = await supabase
      .from('course_sessions')
      .select('id')
      .eq('class_id', course.classId)
      .eq('session_date', course.date)
      .maybeSingle();

    if (csSelectErr) {
      console.error('[AttendanceService] Error checking course_sessions:', csSelectErr);
      return { success: false, error: csSelectErr };
    }

    let courseSessionId = existingCS?.id;

    if (!courseSessionId) {
      const st = course.startTime ? `${course.startTime}:00` : '09:00:00';
      const et = course.endTime ? `${course.endTime}:00` : '12:00:00';

      const { data: newCS, error: csInsertErr } = await supabase
        .from('course_sessions')
        .insert({
          class_id: course.classId,
          session_date: course.date,
          period_start: st,
          period_end: et,
          hours: course.periodsCount || 3,
          is_attendance_submitted: isSubmitted,
          operated_by: validOperatedBy,
        })
        .select('id')
        .single();

      if (csInsertErr) {
        console.error('[AttendanceService] Error inserting course_sessions:', csInsertErr);
        return { success: false, error: csInsertErr };
      }

      courseSessionId = newCS.id;
    } else {
      const { error: csUpdateErr } = await supabase
        .from('course_sessions')
        .update({
          is_attendance_submitted: isSubmitted,
          operated_by: validOperatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', courseSessionId);

      if (csUpdateErr) {
        console.error('[AttendanceService] Error updating course_sessions:', csUpdateErr);
        return { success: false, error: csUpdateErr };
      }
    }

    // 2. Map frontend attendance statuses to DB values ('PRESENT', 'ABSENT', 'LEAVE')
    const mapStatusToDb = (st?: string): string | null => {
      if (!st) return null;
      const lower = st.toLowerCase();
      if (lower === 'present') return 'PRESENT';
      if (lower === 'absent') return 'ABSENT';
      if (lower === 'leave') return 'LEAVE';
      return 'PRESENT';
    };

    const safeAttData = attendanceData || {};
    const studentIds = Object.keys(safeAttData);
    if (studentIds.length > 0) {
      const upsertRows = studentIds.map((studentId) => {
        const record = safeAttData[studentId] || ({} as StudentPeriodAttendance);
        const p1 = mapStatusToDb(record.period1);
        const p2 = mapStatusToDb(record.period2);
        const p3 = mapStatusToDb(record.period3);
        const p4 = mapStatusToDb(record.period4);

        let earnedHours = 0;
        [p1, p2, p3, p4].forEach((p) => {
          if (p === 'PRESENT') earnedHours += 1;
          else if (p === 'LEAVE') earnedHours += 0.5;
        });

        return {
          session_id: courseSessionId,
          student_id: studentId,
          period_1: p1,
          period_2: p2,
          period_3: p3,
          period_4: p4,
          earned_hours: earnedHours,
          operated_by: validOperatedBy,
          note: record.remarks || null,
          remarks: record.remarks || null,
          evidence_image_path: record.evidenceImagePath || null,
          updated_at: new Date().toISOString(),
        };
      });

      // Execute upsert with resilience against schema differences (note vs remarks, etc.)
      const tryUpsert = async (rows: any[]) => {
        return await supabase!
          .from('attendance_records')
          .upsert(rows, { onConflict: 'session_id,student_id' });
      };

      let { error: attUpsertErr } = await tryUpsert(upsertRows);

      // If remarks or evidence_image_path column is not found yet, fall back gracefully
      if (attUpsertErr && attUpsertErr.code === 'PGRST204') {
        console.warn('[AttendanceService] Retrying upsert with fallback columns:', attUpsertErr.message);
        const fallbackRows = upsertRows.map(({ remarks, evidence_image_path, ...rest }) => rest);
        const retryResult = await tryUpsert(fallbackRows);
        attUpsertErr = retryResult.error;
      }

      if (attUpsertErr) {
        console.error('[AttendanceService] Error upserting attendance_records:', attUpsertErr);
        return { success: false, error: attUpsertErr };
      }
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[AttendanceService] Exception in saveAttendanceToSupabase:', err);
    return { success: false, error: err };
  }
}

/**
 * Fetches saved attendance records from Supabase for all sessions.
 * Returns a map of `course_session` key (classId_date) to { attendanceData, isSubmitted }.
 */
export async function fetchAttendanceRecordsFromSupabase(): Promise<
  Map<string, { attendanceData: { [studentId: string]: StudentPeriodAttendance }; isSubmitted: boolean }>
> {
  const map = new Map<
    string,
    { attendanceData: { [studentId: string]: StudentPeriodAttendance }; isSubmitted: boolean }
  >();

  if (!supabase) return map;

  try {
    const { data: courseSessions, error: csErr } = await supabase
      .from('course_sessions')
      .select('*');

    if (csErr || !courseSessions || courseSessions.length === 0) {
      return map;
    }

    const sessionIds = courseSessions.map((cs) => cs.id);
    const csMapById = new Map<string, any>();
    courseSessions.forEach((cs) => csMapById.set(cs.id, cs));

    const { data: attendanceRows, error: attErr } = await supabase
      .from('attendance_records')
      .select('*')
      .in('session_id', sessionIds);

    if (attErr) {
      console.error('[AttendanceService] Error fetching attendance_records:', attErr);
      return map;
    }

    const mapDbToStatus = (dbVal?: string): 'present' | 'absent' | 'leave' => {
      if (!dbVal) return 'present';
      const u = dbVal.toUpperCase();
      if (u === 'ABSENT') return 'absent';
      if (u === 'LEAVE') return 'leave';
      return 'present';
    };

    // Group attendance rows by session_id and resolve signed URLs for evidence images
    const attBySession = new Map<string, { [studentId: string]: StudentPeriodAttendance }>();

    for (const row of attendanceRows || []) {
      const sId = row.session_id;
      if (!attBySession.has(sId)) {
        attBySession.set(sId, {});
      }
      const dict = attBySession.get(sId)!;
      const rawRemarks = row.remarks || row.note || undefined;
      const evidencePath = row.evidence_image_path || undefined;
      let evidenceUrl = undefined;
      if (evidencePath) {
        try {
          evidenceUrl = (await getAttendanceEvidenceSignedUrl(evidencePath)) || undefined;
        } catch (e) {
          console.warn('[AttendanceService] Could not resolve evidence signed URL:', e);
        }
      }

      dict[row.student_id] = {
        period1: mapDbToStatus(row.period_1),
        period2: mapDbToStatus(row.period_2),
        period3: row.period_3 ? mapDbToStatus(row.period_3) : undefined,
        period4: row.period_4 ? mapDbToStatus(row.period_4) : undefined,
        remarks: rawRemarks,
        evidenceImagePath: evidencePath,
        evidenceImageUrl: evidenceUrl,
      };
    }

    courseSessions.forEach((cs) => {
      const key = `${cs.class_id}_${cs.session_date}`;
      const attData = attBySession.get(cs.id) || {};
      map.set(key, {
        attendanceData: attData,
        isSubmitted: Boolean(cs.is_attendance_submitted),
      });
    });

    return map;
  } catch (err) {
    console.error('[AttendanceService] Exception in fetchAttendanceRecordsFromSupabase:', err);
    return map;
  }
}

/**
 * Fetch leave records from Supabase public.leave_requests
 */
export async function fetchLeavesFromSupabase(
  students: Student[],
  classes: ClassEntity[]
): Promise<LeaveRecord[]> {
  if (!supabase) return [];

  try {
    const { data: rows, error } = await supabase
      .from('leave_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AttendanceService] Error fetching leave_requests:', error);
      return [];
    }

    const studentMap = new Map(students.map((s) => [String(s.id), s]));
    const classMap = new Map(classes.map((c) => [String(c.id), c]));

    const leaveTypeToFrontend: Record<string, LeaveType> = {
      PERSONAL: 'personal',
      SICK: 'sick',
      OFFICIAL: 'official',
      BEREAVEMENT: 'bereavement',
      personal: 'personal',
      sick: 'sick',
      official: 'official',
      bereavement: 'bereavement',
    };

    const typeNameMap: Record<string, string> = {
      personal: '事假',
      sick: '病假',
      official: '公假',
      bereavement: '喪假',
    };

    const records: LeaveRecord[] = (rows || []).map((r: any) => {
      const student = studentMap.get(String(r.student_id));
      const classObj = r.class_id ? classMap.get(String(r.class_id)) : null;
      const frontendType = leaveTypeToFrontend[r.leave_type] || 'personal';

      const rawStatus = String(r.status || 'PENDING').toLowerCase();
      const status: 'approved' | 'pending' | 'rejected' =
        rawStatus === 'approved' || rawStatus === 'rejected' ? rawStatus : 'pending';

      const hours = Number(r.total_hours || 3);
      const periods = hours === 2 ? [1, 2] : hours === 4 ? [1, 2, 3, 4] : [1, 2, 3];

      return {
        id: String(r.id),
        studentId: String(r.student_id),
        studentName: student?.name || '請假學員',
        studentEnglishName: student?.englishName || '',
        classId: r.class_id ? String(r.class_id) : student?.classId,
        className: classObj?.name || student?.className || '未設定班級',
        date: r.start_date || (r.created_at ? r.created_at.substring(0, 10) : '2026-08-04'),
        timeSlot: '09:00 - 12:00',
        periods,
        type: frontendType,
        typeName: typeNameMap[frontendType] || '事假',
        reason: r.reason || '學員請假',
        approvedAt: r.reviewed_at ? r.reviewed_at.substring(0, 16).replace('T', ' ') : '',
        status,
        appliedAt: r.created_at ? r.created_at.substring(0, 16).replace('T', ' ') : '',
        approver: r.reviewed_by ? '行政人員' : '行政教務處',
      };
    });

    return records;
  } catch (err) {
    console.error('[AttendanceService] Exception fetching leave_requests:', err);
    return [];
  }
}

/**
 * Insert a leave request into Supabase public.leave_requests
 */
export async function createLeaveInSupabase(
  leave: LeaveRecord
): Promise<{ success: boolean; data?: any; error?: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase client not initialized') };

  try {
    const validStudentId = leave.studentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leave.studentId)
      ? leave.studentId
      : null;
    const validClassId = leave.classId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leave.classId)
      ? leave.classId
      : null;

    if (!validStudentId) {
      return { success: false, error: new Error('無效的學員 ID') };
    }

    const leaveTypeDb = (leave.type || 'personal').toUpperCase();
    const statusDb = (leave.status || 'pending').toUpperCase();
    const totalHours = leave.periods ? leave.periods.length : 3;

    const payload: Record<string, any> = {
      student_id: validStudentId,
      leave_type: leaveTypeDb,
      start_date: leave.date,
      end_date: leave.date,
      total_hours: totalHours,
      reason: leave.reason || '學員請假',
      status: statusDb,
    };

    if (validClassId) payload.class_id = validClassId;

    if (statusDb === 'APPROVED') {
      payload.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[AttendanceService] Error creating leave_request:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[AttendanceService] Exception creating leave_request:', err);
    return { success: false, error: err };
  }
}

/**
 * Update a leave request status in Supabase public.leave_requests
 */
export async function updateLeaveStatusInSupabase(
  leaveId: string,
  newStatus: 'approved' | 'rejected',
  reviewerProfileId?: string
): Promise<{ success: boolean; error?: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase client not initialized') };

  try {
    const validReviewerId = reviewerProfileId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewerProfileId)
      ? reviewerProfileId
      : null;

    const payload: Record<string, any> = {
      status: newStatus.toUpperCase(),
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (validReviewerId) {
      payload.reviewed_by = validReviewerId;
    }

    const { error } = await supabase
      .from('leave_requests')
      .update(payload)
      .eq('id', leaveId);

    if (error) {
      console.error('[AttendanceService] Error updating leave_request status:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('[AttendanceService] Exception updating leave_request status:', err);
    return { success: false, error: err };
  }
}

