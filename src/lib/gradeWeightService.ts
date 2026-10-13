import { supabase } from './supabase';
import { StudentGradeWeight, GradeWeightAuditLog } from '../types';

/**
 * Maps DB row in public.student_grade_weights to StudentGradeWeight
 */
export function mapDbToGradeWeight(row: any): StudentGradeWeight {
  return {
    id: row.id,
    studentId: String(row.student_id),
    termId: String(row.term_id),
    attendanceWeight: Number(row.attendance_weight),
    quizWeight: Number(row.quiz_weight),
    midtermWeight: Number(row.midterm_weight),
    finalWeight: Number(row.final_weight),
    homeworkWeight: Number(row.homework_weight),
    attitudeWeight: Number(row.attitude_weight),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all custom weights for a specific term from Supabase public.student_grade_weights.
 * Returns a map of studentId -> StudentGradeWeight
 */
export async function fetchGradeWeightsForTerm(
  termId: string
): Promise<{ data: Record<string, StudentGradeWeight>; error: any }> {
  if (!supabase || !termId) {
    return { data: {}, error: null };
  }

  try {
    const { data: rows, error } = await supabase
      .from('student_grade_weights')
      .select('*')
      .eq('term_id', termId);

    if (error) {
      console.warn('[GradeWeightService] Notice: fetching student_grade_weights:', error);
      return { data: {}, error };
    }

    const map: Record<string, StudentGradeWeight> = {};
    (rows || []).forEach((row: any) => {
      const mapped = mapDbToGradeWeight(row);
      map[mapped.studentId] = mapped;
    });

    return { data: map, error: null };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception fetching grade weights:', err);
    return { data: {}, error: err };
  }
}

/**
 * Set custom weights for a single student via RPC set_student_grade_weights
 */
export async function setSingleStudentWeight(params: {
  studentId: string;
  termId: string;
  attendanceWeight: number;
  quizWeight: number;
  midtermWeight: number;
  finalWeight: number;
  homeworkWeight: number;
  attitudeWeight: number;
  changeReason: string;
}): Promise<{ success: boolean; data?: any; error?: string; rawError?: any }> {
  if (!supabase) {
    return { success: false, error: '資料庫連線尚未初始化' };
  }

  const sId = String(params.studentId || '').trim();
  const tId = String(params.termId || '').trim();
  if (!sId || !tId) {
    return { success: false, error: '無效的學生或學期代碼' };
  }

  const reason = (params.changeReason && params.changeReason.trim()) || '教務處個別學生成績權重調整';

  try {
    const { data, error } = await supabase.rpc('set_student_grade_weights', {
      p_student_id: sId,
      p_term_id: tId,
      p_attendance_weight: Number(params.attendanceWeight),
      p_quiz_weight: Number(params.quizWeight),
      p_midterm_weight: Number(params.midtermWeight),
      p_final_weight: Number(params.finalWeight),
      p_homework_weight: Number(params.homeworkWeight),
      p_attitude_weight: Number(params.attitudeWeight),
      p_change_reason: reason,
    });

    if (error) {
      console.error('[GradeWeightService] Error calling set_student_grade_weights:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { 
        success: false, 
        error: error.message || '儲存權重失敗',
        rawError: error 
      };
    }

    // 儲存後立即重新讀取資料庫，確認實體資料表真正存在寫入結果
    try {
      const { data: verifiedRow, error: verifyErr } = await supabase
        .from('student_grade_weights')
        .select('*')
        .eq('student_id', sId)
        .eq('term_id', tId)
        .maybeSingle();

      if (verifyErr) {
        console.warn('[GradeWeightService] Post-save verification notice:', verifyErr);
      } else {
        console.log('[GradeWeightService] Verified saved weight record in DB:', verifiedRow);
      }
    } catch (vErr) {
      console.warn('[GradeWeightService] Verification read error:', vErr);
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception setting single student weight:', err);
    return { success: false, error: err.message || '設定權重時發生錯誤' };
  }
}

/**
 * Apply custom weights to a batch of students (up to 500) via RPC apply_batch_grade_weights
 */
export async function applyBatchStudentWeights(params: {
  studentIds: string[];
  termId: string;
  attendanceWeight: number;
  quizWeight: number;
  midtermWeight: number;
  finalWeight: number;
  homeworkWeight: number;
  attitudeWeight: number;
  changeReason: string;
}): Promise<{ success: boolean; data?: any; error?: string; rawError?: any }> {
  if (!supabase) {
    return { success: false, error: '資料庫連線尚未初始化' };
  }

  if (params.studentIds.length === 0) {
    return { success: false, error: '選取學生命單不能為空' };
  }

  if (params.studentIds.length > 500) {
    return { success: false, error: `批量設定單次最多 500 人 (目前選取: ${params.studentIds.length} 人)` };
  }

  const tId = String(params.termId || '').trim();
  if (!tId) {
    return { success: false, error: '無效的學期代碼' };
  }

  const sIds = params.studentIds.map((id) => String(id).trim()).filter(Boolean);
  const reason = (params.changeReason && params.changeReason.trim()) || '教務處批量學生成績權重調整';

  try {
    const { data, error } = await supabase.rpc('apply_batch_grade_weights', {
      p_student_ids: sIds,
      p_term_id: tId,
      p_attendance_weight: Number(params.attendanceWeight),
      p_quiz_weight: Number(params.quizWeight),
      p_midterm_weight: Number(params.midtermWeight),
      p_final_weight: Number(params.finalWeight),
      p_homework_weight: Number(params.homeworkWeight),
      p_attitude_weight: Number(params.attitudeWeight),
      p_change_reason: reason,
    });

    if (error) {
      console.error('[GradeWeightService] Error calling apply_batch_grade_weights:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { 
        success: false, 
        error: error.message || '批量設定權重失敗',
        rawError: error 
      };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception applying batch weights:', err);
    return { success: false, error: err.message || '批量設定權重時發生錯誤' };
  }
}

/**
 * Reset a single student's weights to default via RPC reset_student_grade_weights (with fallback to reset_batch_grade_weights)
 */
export async function resetSingleStudentWeight(params: {
  studentId: string;
  termId: string;
  changeReason: string;
}): Promise<{ success: boolean; data?: any; error?: string; rawError?: any }> {
  if (!supabase) {
    return { success: false, error: '資料庫連線尚未初始化' };
  }

  const sId = String(params.studentId || '').trim();
  const tId = String(params.termId || '').trim();
  if (!sId || !tId) {
    return { success: false, error: '無效的學生或學期代碼' };
  }

  const reason = (params.changeReason && params.changeReason.trim()) || '教務處恢復標準預設成績權重';

  try {
    // 優先呼叫 reset_student_grade_weights
    const { data, error } = await supabase.rpc('reset_student_grade_weights', {
      p_student_id: sId,
      p_term_id: tId,
      p_change_reason: reason,
    });

    if (error) {
      // 若 reset_student_grade_weights 不存在或報錯，Fallback 呼叫最新已部署的 reset_batch_grade_weights
      console.warn('[GradeWeightService] reset_student_grade_weights error, falling back to reset_batch_grade_weights:', error);
      const { data: bData, error: bError } = await supabase.rpc('reset_batch_grade_weights', {
        p_student_ids: [sId],
        p_term_id: tId,
        p_change_reason: reason,
      });

      if (bError) {
        console.error('[GradeWeightService] Fallback reset_batch_grade_weights failed:', {
          code: bError.code,
          message: bError.message,
          details: bError.details,
          hint: bError.hint,
        });
        return { 
          success: false, 
          error: bError.message || '重置權重失敗',
          rawError: bError 
        };
      }
      return { success: true, data: bData };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception resetting single student weight:', err);
    return { success: false, error: err.message || '重置權重時發生錯誤' };
  }
}

/**
 * Reset a batch of students' weights to default via RPC reset_batch_grade_weights
 */
export async function resetBatchStudentWeights(params: {
  studentIds: string[];
  termId: string;
  changeReason: string;
}): Promise<{ success: boolean; data?: any; error?: string; rawError?: any }> {
  if (!supabase) {
    return { success: false, error: '資料庫連線尚未初始化' };
  }

  if (params.studentIds.length === 0) {
    return { success: false, error: '選取學生命單不能為空' };
  }

  if (params.studentIds.length > 500) {
    return { success: false, error: `批量重置單次最多 500 人 (目前選取: ${params.studentIds.length} 人)` };
  }

  const tId = String(params.termId || '').trim();
  if (!tId) {
    return { success: false, error: '無效的學期代碼' };
  }

  const sIds = params.studentIds.map((id) => String(id).trim()).filter(Boolean);
  const reason = (params.changeReason && params.changeReason.trim()) || '教務處批量恢復標準預設成績權重';

  try {
    const { data, error } = await supabase.rpc('reset_batch_grade_weights', {
      p_student_ids: sIds,
      p_term_id: tId,
      p_change_reason: reason,
    });

    if (error) {
      console.error('[GradeWeightService] Error calling reset_batch_grade_weights:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { 
        success: false, 
        error: error.message || '批量重置權重失敗',
        rawError: error 
      };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception resetting batch weights:', err);
    return { success: false, error: err.message || '批量重置權重時發生錯誤' };
  }
}

/**
 * Fetch audit logs for student weight changes
 */
export async function fetchWeightAuditLogs(
  termId: string,
  studentId?: string
): Promise<{ data: GradeWeightAuditLog[]; error: any }> {
  if (!supabase) {
    return { data: [], error: null };
  }

  try {
    let query = supabase
      .from('student_grade_weight_audit_logs')
      .select('*')
      .eq('term_id', termId)
      .order('created_at', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.warn('[GradeWeightService] Error fetching audit logs:', error);
      return { data: [], error };
    }

    const logs: GradeWeightAuditLog[] = (rows || []).map((r: any) => ({
      id: r.id,
      weightId: r.weight_id,
      studentId: String(r.student_id),
      termId: String(r.term_id),
      changedBy: r.changed_by,
      operatorId: r.changed_by || r.operator_id,
      action: r.action_type || r.action,
      oldWeights: r.old_weights,
      newWeights: r.new_weights,
      changeReason: r.change_reason || '',
      createdAt: r.created_at,
    }));

    return { data: logs, error: null };
  } catch (err: any) {
    console.error('[GradeWeightService] Exception fetching audit logs:', err);
    return { data: [], error: err };
  }
}
