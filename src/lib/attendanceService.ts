import { supabase } from './supabase';
import {
  CourseSession,
  StudentPeriodAttendance,
  LeaveRecord,
  Student,
  ClassEntity,
  LeaveType,
  AttendanceMakeupRequest,
  AttendanceAuditLog,
  MakeupRequestType,
} from '../types';
import { getAttendanceEvidenceSignedUrl } from './storageService';
import { getAuthHeaders } from './apiHelper';
import { getTodayDateStr, getDaysDifference } from '../utils/quarterScheduler';

export interface SaveAttendanceParams {
  course: CourseSession;
  attendanceData: { [studentId: string]: StudentPeriodAttendance };
  targetStatus: 'in_progress' | 'completed';
  operatedBy?: string;
  makeupRequestId?: string;
  isOverdueSession?: boolean;
  isAdmin?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val?: string | null): val is string {
  return Boolean(val && UUID_REGEX.test(val));
}

/**
 * Saves attendance to Supabase `course_sessions` and `attendance_records` tables.
 * Supports single-use atomic submission when makeupRequestId is supplied.
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

  const {
    course,
    attendanceData,
    targetStatus,
    operatedBy,
    makeupRequestId,
    isOverdueSession,
    isAdmin,
  } = params;

  try {
    // Hard guard: overdue sessions (>7 days) cannot be saved directly by teachers without an approved makeup request
    if (isOverdueSession && !isAdmin && !makeupRequestId) {
      return {
        success: false,
        error: new Error('此課堂已超過 7 天修改期限，必須先提出補點名申請並經管理員核准後始可送出。'),
      };
    }

    if (!isUuid(course.classId)) {
      return {
        success: false,
        error: new Error('找不到有效的班級識別資訊，無法儲存點名紀錄。'),
      };
    }

    const isSubmitted = targetStatus === 'completed';

    // Helper: ensure operated_by is a valid UUID or user ID
    let validOperatedBy: string | null = null;
    if (isUuid(operatedBy)) {
      validOperatedBy = operatedBy;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        validOperatedBy = userData.user.id;
      }
    }

    const mapStatusToDb = (st?: string, strictMode = false): string | null => {
      if (!st) return strictMode ? null : null;
      const lower = st.trim().toLowerCase();
      if (lower === 'present') return 'PRESENT';
      if (lower === 'absent') return 'ABSENT';
      if (lower === 'leave') return 'LEAVE';
      if (strictMode) {
        throw new Error(`不支援的點名狀態代碼：${st}（僅允許 present / leave / absent）`);
      }
      return 'PRESENT';
    };

    const normalizeSqlTime = (raw?: string): string | null => {
      const s = (raw || '').trim();
      if (!s) return null;
      const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
      if (hmMatch) {
        const hh = Number(hmMatch[1]);
        const mm = Number(hmMatch[2]);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
        }
        return null;
      }
      const hmsMatch = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
      if (hmsMatch) {
        const hh = Number(hmsMatch[1]);
        const mm = Number(hmsMatch[2]);
        const ss = Number(hmsMatch[3]);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }
        return null;
      }
      return null;
    };

    const st = normalizeSqlTime(course.startTime);
    const et = normalizeSqlTime(course.endTime);
    const rawHours = Number(course.periodsCount);
    const sessionHours = rawHours === 2 || rawHours === 3 || rawHours === 4 ? rawHours : null;

    if (!st || !et || sessionHours === null) {
      return {
        success: false,
        error: new Error('無法確認此課堂之實際上課起訖時間或節數（僅支援 2/3/4 小時制），禁止使用預設值儲存點名。'),
      };
    }

    const safeAttData = attendanceData || {};
    const studentIds = Object.keys(safeAttData);

    // For atomic makeup RPC, omit earned_hours (computed authoritatively on DB backend)
    const buildMakeupRpcPayloads = () =>
      studentIds.map((studentId) => {
        const record = safeAttData[studentId] || ({} as StudentPeriodAttendance);
        const p1 = mapStatusToDb(record.period1 || 'present', true) || 'PRESENT';
        const p2 = sessionHours >= 2 ? mapStatusToDb(record.period2 || 'present', true) || 'PRESENT' : null;
        const p3 = sessionHours >= 3 ? mapStatusToDb(record.period3 || 'present', true) || 'PRESENT' : null;
        const p4 = sessionHours >= 4 ? mapStatusToDb(record.period4 || 'present', true) || 'PRESENT' : null;

        return {
          student_id: studentId,
          period_1: p1,
          period_2: p2,
          period_3: p3,
          period_4: p4,
          note: record.remarks || null,
          remarks: record.remarks || null,
          evidence_image_path: record.evidenceImagePath || null,
        };
      });

    // Strictly atomic DB transaction when submitting with an approved makeup request (NO non-atomic fallback)
    if (makeupRequestId) {
      if (!isUuid(makeupRequestId)) {
        return {
          success: false,
          error: new Error('無效的補點名核准單識別碼，請重新整理後再試。'),
        };
      }

      if (!isSubmitted) {
        return {
          success: false,
          error: new Error('補點名核准單為單次有效，僅允許正式送出點名。'),
        };
      }

      const taiwanToday = getTodayDateStr();
      const daysSince = getDaysDifference(taiwanToday, course.date);
      if (!(course.date < taiwanToday && daysSince > 7)) {
        return {
          success: false,
          error: new Error('此課堂未超過 7 天補點名期限（台灣時間），請直接依一般點名流程操作。'),
        };
      }

      if (studentIds.length === 0) {
        return {
          success: false,
          error: new Error('此課堂查無應到學生點名資料，不可送出空白名單並核銷核准單。'),
        };
      }

      const invalidStudentId = studentIds.find((sid) => !isUuid(sid));
      if (invalidStudentId) {
        return {
          success: false,
          error: new Error('名單中包含無效的學生識別資訊，請重新整理頁面後再試。'),
        };
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_makeup_attendance_atomic', {
        p_request_id: makeupRequestId,
        p_class_id: course.classId,
        p_session_date: course.date,
        p_period_start: st,
        p_period_end: et,
        p_hours: sessionHours,
        p_is_submitted: isSubmitted,
        p_records: buildMakeupRpcPayloads(),
      });

      if (rpcErr) {
        const msg = rpcErr.message || '';
        const isMissingRpc =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          msg.includes('Could not find the function') ||
          msg.includes('does not exist');

        console.error('[AttendanceService] submit_makeup_attendance_atomic failed:', rpcErr);
        return {
          success: false,
          error: isMissingRpc
            ? new Error('系統尚未完成逾七天補點名功能設定，請聯繫管理員確認後端設定後再送出。')
            : rpcErr,
        };
      }

      if (rpcData && typeof rpcData === 'object' && rpcData.success === false) {
        return {
          success: false,
          error: new Error(rpcData.message || '補點名送出失敗，請確認課堂與核准單狀態。'),
        };
      }

      return { success: true, error: null };
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
      const { data: newCS, error: csInsertErr } = await supabase
        .from('course_sessions')
        .insert({
          class_id: course.classId,
          session_date: course.date,
          period_start: st,
          period_end: et,
          hours: sessionHours,
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

    if (studentIds.length > 0) {
      const upsertRows = studentIds.map((studentId) => {
        const record = safeAttData[studentId] || ({} as StudentPeriodAttendance);
        const p1 = mapStatusToDb(record.period1);
        const p2 = sessionHours >= 2 ? mapStatusToDb(record.period2) : null;
        const p3 = sessionHours >= 3 ? mapStatusToDb(record.period3) : null;
        const p4 = sessionHours >= 4 ? mapStatusToDb(record.period4) : null;

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

      const { error: attUpsertErr } = await supabase!
        .from('attendance_records')
        .upsert(upsertRows, { onConflict: 'session_id,student_id' });

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
    let courseSessions: any[] = [];
    const { data: directCS, error: csErr } = await supabase
      .from('course_sessions')
      .select('*');

    if (!csErr && directCS && directCS.length > 0) {
      courseSessions = directCS;
    } else {
      try {
        const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000';
        const headers = await getAuthHeaders();
        const apiRes = await fetch(`${origin}/api/course-sessions`, { headers });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json.success && Array.isArray(json.data)) {
            courseSessions = json.data;
          }
        }
      } catch (apiErr) {
        console.warn('[AttendanceService] Fallback to /api/course-sessions failed:', apiErr);
      }
    }

    if (courseSessions.length === 0) {
      return map;
    }

    const sessionIds = courseSessions.map((cs) => cs.id);
    const csMapById = new Map<string, any>();
    courseSessions.forEach((cs) => csMapById.set(cs.id, cs));

    let attendanceRows: any[] = [];
    const { data: directAtt, error: attErr } = await supabase
      .from('attendance_records')
      .select('*')
      .in('session_id', sessionIds);

    if (!attErr && directAtt && directAtt.length > 0) {
      attendanceRows = directAtt;
    } else {
      try {
        const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000';
        const headers = await getAuthHeaders();
        const apiRes = await fetch(`${origin}/api/attendance-records`, { headers });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json.success && Array.isArray(json.data)) {
            attendanceRows = json.data.filter((r: any) => sessionIds.includes(r.session_id));
          }
        }
      } catch (apiErr) {
        console.warn('[AttendanceService] Fallback to /api/attendance-records failed:', apiErr);
      }
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
        className: classObj?.name || student?.className || '',
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

/**
 * Fetch over-7-day makeup requests from public.attendance_makeup_requests.
 * Gracefully returns [] if migration has not yet been applied (PGRST205).
 */
export async function fetchMakeupRequestsFromSupabase(): Promise<AttendanceMakeupRequest[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('attendance_makeup_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('attendance_makeup_requests')) {
        console.warn('[AttendanceService] attendance_makeup_requests table not found yet (migration pending).');
        return [];
      }
      console.error('[AttendanceService] Error fetching attendance_makeup_requests:', error);
      return [];
    }

    const rows = data || [];
    if (rows.length === 0) return [];

    // Resolve teacher names & reviewer/requester names cleanly from normalized tables when permitted by RLS
    const teacherIds = Array.from(new Set(rows.map((r: any) => r.teacher_id).filter(Boolean)));
    const profileIds = Array.from(
      new Set(
        rows
          .flatMap((r: any) => [r.requester_profile_id, r.reviewed_by])
          .filter(Boolean)
      )
    );

    const teacherNameMap = new Map<string, string>();
    const profileNameMap = new Map<string, string>();

    if (teacherIds.length > 0) {
      const { data: teacherRows } = await supabase
        .from('teachers')
        .select('id, emp_name, tea_name')
        .in('id', teacherIds);
      (teacherRows || []).forEach((t: any) => {
        const name = t.emp_name || t.tea_name;
        if (t.id && name) teacherNameMap.set(String(t.id), String(name));
      });
    }

    if (profileIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);
      (profileRows || []).forEach((p: any) => {
        if (p.id && p.full_name) profileNameMap.set(String(p.id), String(p.full_name));
      });
    }

    return rows.map((r: any): AttendanceMakeupRequest => {
      const resolvedTeacherName =
        (r.teacher_id ? teacherNameMap.get(String(r.teacher_id)) : undefined) ||
        (r.requester_profile_id ? profileNameMap.get(String(r.requester_profile_id)) : undefined);
      const resolvedReviewerName = r.reviewed_by
        ? profileNameMap.get(String(r.reviewed_by))
        : undefined;

      return {
        id: String(r.id),
        sessionId: r.class_session_id
          ? String(r.class_session_id)
          : r.course_session_id
          ? String(r.course_session_id)
          : undefined,
        classSessionId: r.class_session_id ? String(r.class_session_id) : undefined,
        courseSessionId: r.course_session_id ? String(r.course_session_id) : undefined,
        classId: String(r.class_id),
        sessionDate: String(r.session_date),
        teacherId: r.teacher_id ? String(r.teacher_id) : undefined,
        teacherName: resolvedTeacherName || undefined,
        requesterProfileId: r.requester_profile_id ? String(r.requester_profile_id) : undefined,
        requestType: (r.request_type === 'EDIT' ? 'EDIT' : 'MAKEUP') as MakeupRequestType,
        reason: r.reason || '',
        status: r.status || 'PENDING',
        reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined,
        reviewerName: resolvedReviewerName || undefined,
        reviewedAt: r.reviewed_at || undefined,
        reviewNotes: r.review_notes || undefined,
        usedAt: r.used_at || undefined,
        createdAt: r.created_at || '',
        updatedAt: r.updated_at || undefined,
      };
    });
  } catch (err) {
    console.warn('[AttendanceService] Exception fetching makeup requests:', err);
    return [];
  }
}

/**
 * Submit a new over-7-day makeup/edit attendance request.
 */
export async function submitMakeupRequestToSupabase(params: {
  sessionId?: string;
  classSessionId?: string;
  courseSessionId?: string;
  classId: string;
  sessionDate: string;
  teacherId?: string;
  teacherName?: string;
  requestType: MakeupRequestType;
  reason: string;
}): Promise<{ success: boolean; data?: AttendanceMakeupRequest; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase 客戶端尚未初始化' };
  }

  const cleanReason = (params.reason || '').trim();
  if (!cleanReason) {
    return { success: false, error: '請填寫補點名或修改原因' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.sessionDate || '')) {
    return { success: false, error: '無效的課堂日期格式' };
  }

  const taiwanToday = getTodayDateStr();
  const daysSince = getDaysDifference(taiwanToday, params.sessionDate);
  if (!(params.sessionDate < taiwanToday && daysSince > 7)) {
    return {
      success: false,
      error: '僅允許對超過 7 天的歷史課堂申請補點名或修改，7 天內堂次請直接依一般點名權限操作。',
    };
  }

  if (!isUuid(params.classId)) {
    return { success: false, error: '找不到有效的班級資料，無法建立補點名申請' };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const requesterUid = userData?.user?.id;
    if (!requesterUid) {
      return { success: false, error: '請先登入系統後再送出補點名申請' };
    }

    // Fail-fast check: verify class's term is not locked
    const { data: classRow } = await supabase
      .from('classes')
      .select('id, term_id, terms(is_locked)')
      .eq('id', params.classId)
      .maybeSingle();

    const termInfo: any = classRow ? (Array.isArray((classRow as any).terms) ? (classRow as any).terms[0] : (classRow as any).terms) : null;
    if (termInfo?.is_locked) {
      return { success: false, error: '此學期已封存鎖定，禁止申請補點名或修改點名。' };
    }

    // Prevent duplicate PENDING or unused APPROVED request for the same (classId, sessionDate)
    const { data: existingActive, error: checkErr } = await supabase
      .from('attendance_makeup_requests')
      .select('id, status')
      .eq('class_id', params.classId)
      .eq('session_date', params.sessionDate)
      .in('status', ['PENDING', 'APPROVED'])
      .limit(1);

    if (checkErr) {
      if (checkErr.code === 'PGRST205') {
        console.warn('[AttendanceService] attendance_makeup_requests missing:', checkErr);
        return {
          success: false,
          error: '系統尚未完成補點名申請功能設定，請聯繫管理員協助處理。',
        };
      }
      return { success: false, error: checkErr.message };
    }

    if (existingActive && existingActive.length > 0) {
      const st = existingActive[0].status;
      return {
        success: false,
        error:
          st === 'APPROVED'
            ? '此堂課已有已核准且尚未使用的補點名額度，請直接進入點名頁送出。'
            : '此堂課已有待審核的補點名申請，請勿重複送出。',
      };
    }

    const classSessionId = isUuid(params.classSessionId)
      ? params.classSessionId
      : isUuid(params.sessionId)
      ? params.sessionId
      : undefined;

    let courseSessionId = isUuid(params.courseSessionId) ? params.courseSessionId : undefined;
    if (!courseSessionId && isUuid(params.classId) && params.sessionDate) {
      const { data: existingCS } = await supabase
        .from('course_sessions')
        .select('id')
        .eq('class_id', params.classId)
        .eq('session_date', params.sessionDate)
        .maybeSingle();
      if (existingCS?.id && isUuid(String(existingCS.id))) {
        courseSessionId = String(existingCS.id);
      }
    }

    const payload: Record<string, any> = {
      class_id: params.classId,
      session_date: params.sessionDate,
      requester_profile_id: requesterUid,
      request_type: params.requestType,
      reason: cleanReason,
      status: 'PENDING',
    };
    if (classSessionId) payload.class_session_id = classSessionId;
    if (courseSessionId) payload.course_session_id = courseSessionId;
    if (isUuid(params.teacherId)) payload.teacher_id = params.teacherId;

    const { data, error } = await supabase
      .from('attendance_makeup_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: '此堂課已有進行中的補點名申請，請勿重複送出。' };
      }
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        id: String(data.id),
        sessionId: data.class_session_id
          ? String(data.class_session_id)
          : data.course_session_id
          ? String(data.course_session_id)
          : undefined,
        classSessionId: data.class_session_id ? String(data.class_session_id) : undefined,
        courseSessionId: data.course_session_id ? String(data.course_session_id) : undefined,
        classId: String(data.class_id),
        sessionDate: String(data.session_date),
        teacherId: data.teacher_id ? String(data.teacher_id) : undefined,
        teacherName: params.teacherName || undefined,
        requesterProfileId: data.requester_profile_id ? String(data.requester_profile_id) : undefined,
        requestType: (data.request_type === 'EDIT' ? 'EDIT' : 'MAKEUP') as MakeupRequestType,
        reason: data.reason || '',
        status: data.status || 'PENDING',
        createdAt: data.created_at || '',
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || '送出補點名申請失敗' };
  }
}

/**
 * Admin review (APPROVED / REJECTED) of an attendance makeup request.
 */
export async function reviewMakeupRequestInSupabase(params: {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerProfileId?: string;
  reviewNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase 客戶端尚未初始化' };
  }

  if (!isUuid(params.requestId)) {
    return { success: false, error: '無效的申請單識別碼' };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const authUid = userData?.user?.id;
    const nowIso = new Date().toISOString();

    const resolvedReviewerId = authUid || (isUuid(params.reviewerProfileId) ? params.reviewerProfileId : null);

    const payload: Record<string, any> = {
      status: params.decision,
      reviewed_at: nowIso,
      updated_at: nowIso,
      review_notes: (params.reviewNotes || '').trim() || null,
    };
    if (resolvedReviewerId) {
      payload.reviewed_by = resolvedReviewerId;
    }

    const { data: updatedRows, error } = await supabase
      .from('attendance_makeup_requests')
      .update(payload)
      .eq('id', params.requestId)
      .eq('status', 'PENDING')
      .select('id, status');

    if (error) {
      return { success: false, error: error.message };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: '找不到待審核申請單，或該申請已完成審核／無審核權限' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || '審核作業失敗' };
  }
}

/**
 * Fetch attendance audit logs from public.attendance_audit_logs joined with course_sessions for context.
 */
export async function fetchAttendanceAuditLogsFromSupabase(filters?: {
  studentId?: string;
  limit?: number;
}): Promise<AttendanceAuditLog[]> {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('attendance_audit_logs')
      .select('*, course_sessions(class_id, session_date)')
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 300);

    if (filters?.studentId) {
      query = query.eq('student_id', filters.studentId);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST205') return [];
      console.warn('[AttendanceService] Error fetching attendance_audit_logs:', error);
      return [];
    }

    return (data || []).map((row: any): AttendanceAuditLog => {
      const hasOldPeriods = Boolean(row.old_period_1 || row.old_period_2 || row.old_period_3 || row.old_period_4);
      const hasNewPeriods = Boolean(row.new_period_1 || row.new_period_2 || row.new_period_3 || row.new_period_4);
      const oldValue = hasOldPeriods
        ? {
            period_1: row.old_period_1,
            period_2: row.old_period_2,
            period_3: row.old_period_3,
            period_4: row.old_period_4,
          }
        : null;
      const newValue = hasNewPeriods
        ? {
            period_1: row.new_period_1,
            period_2: row.new_period_2,
            period_3: row.new_period_3,
            period_4: row.new_period_4,
          }
        : null;

      return {
        id: String(row.id),
        attendanceRecordId: row.attendance_record_id ? String(row.attendance_record_id) : null,
        sessionId: String(row.session_id),
        studentId: String(row.student_id),
        classId: row.course_sessions?.class_id ? String(row.course_sessions.class_id) : undefined,
        sessionDate: row.course_sessions?.session_date ? String(row.course_sessions.session_date) : undefined,
        changedBy: row.changed_by ? String(row.changed_by) : undefined,
        reason: row.reason || undefined,
        oldValue,
        newValue,
        oldPeriod1: row.old_period_1 || null,
        oldPeriod2: row.old_period_2 || null,
        oldPeriod3: row.old_period_3 || null,
        oldPeriod4: row.old_period_4 || null,
        newPeriod1: row.new_period_1 || null,
        newPeriod2: row.new_period_2 || null,
        newPeriod3: row.new_period_3 || null,
        newPeriod4: row.new_period_4 || null,
        oldEarnedHours: row.old_earned_hours ?? null,
        newEarnedHours: row.new_earned_hours ?? null,
        createdAt: row.created_at || '',
      };
    });
  } catch (err) {
    console.warn('[AttendanceService] Exception fetching attendance_audit_logs:', err);
    return [];
  }
}

