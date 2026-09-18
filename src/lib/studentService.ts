import { supabase } from './supabase';
import { Student, ClassEntity, StudentGrade, TransferClassRecord } from '../types';
import { calculateTotalGrade, getLetterGrade } from '../utils/gradeUtils';
import { batchResolveStudentAvatars, extractStoragePath, deleteStudentStorageFiles } from './storageService';
import { mapDbToClass, fetchClassesFromSupabase } from './classService';
import { getTodayDateStr } from '../utils/quarterScheduler';

export { mapDbToClass, fetchClassesFromSupabase };

const NATIONALITY_TO_CODE: Record<string, string> = {
  '日本': 'JP',
  '韓國': 'KR',
  '美國': 'US',
  '越南': 'VN',
  '泰國': 'TH',
  '法國': 'FR',
  '德國': 'DE',
  '印尼': 'ID',
  '菲律賓': 'PH',
  '台灣': 'TW',
  '臺灣': 'TW',
  '英國': 'GB',
  '加拿大': 'CA',
  '澳洲': 'AU',
};

/**
 * Maps a Supabase public.students record (snake_case / PostgreSQL / School Spec) to the frontend Student interface.
 */
export function mapDbToStudent(row: any): Student {
  const admissionDate =
    row.enterdate ||
    row.admission_date ||
    (row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : getTodayDateStr());

  const rawStatus = String(row.rest_to_drop || row.status || '0').toLowerCase();
  const normalizedStatus: 'active' | 'withdrawn' | 'graduated' | 'suspended' =
    rawStatus === '1' || rawStatus === 'withdrawn' ? 'withdrawn' :
    rawStatus === '2' || rawStatus === 'graduated' ? 'graduated' :
    rawStatus === '3' || rawStatus === 'suspended' ? 'suspended' : 'active';

  const nationality = row.nation || '未設定';
  const nationalityCode = row.natcode || NATIONALITY_TO_CODE[nationality] || 'TW';
  const studentNum = row.stno || '';
  const passportNumber = row.idno || '';
  const fallbackPassport = passportNumber || `${nationalityCode}9${(studentNum || row.id || '888888').replace(/\D/g, '').slice(-6) || '123456'}`;

  return {
    id: String(row.id),
    studentNumber: studentNum,
    name: row.name || '',
    englishName: row.ename || '',
    passportNumber: fallbackPassport,
    avatarUrl:
      row.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    gender: (row.sex === 'F' ? 'F' : 'M') as 'M' | 'F',
    nationality: nationality,
    nationalityCode: nationalityCode,
    classId: row.class_id || row.classId,
    className: row.class_name || row.className || '',
    email: row.email || '',
    phone: row.mobile_phone || '',
    overallAttendanceRate: Number(
      row.overall_attendance_rate ?? 100
    ),
    totalAbsenceHours: Number(
      row.total_absence_hours ?? 0
    ),
    totalLeaveHours: Number(
      row.total_leave_hours ?? 0
    ),
    totalPresentHours: Number(
      row.total_present_hours ?? 0
    ),
    totalRequiredHours: Number(
      row.total_required_hours ?? 0
    ),
    visaStatus: (row.visa_status || 'safe') as 'safe' | 'warning' | 'danger',
    enrollmentStatus: normalizedStatus,
    admissionDate: admissionDate,
    // School DB Spec Fields
    stno: studentNum,
    ename: row.ename || '',
    idno: fallbackPassport,
    nation: nationality,
    natcode: nationalityCode,
    sex: row.sex || 'M',
    birthday: row.birthday || '',
    mobilePhone: row.mobile_phone || '',
    restToDrop: row.rest_to_drop || '0',
    enterdep: row.enterdep || '',
    enterdate: row.enterdate || '',
    entersem: row.entersem || '',
    enterno: row.enterno || '',
    transin: row.transin || '',
    lastgrad: row.lastgrad || '',
    lastdegre: row.lastdegre || '',
    lastclas: row.lastclas || '',
    lastscol: row.lastscol || '',
    lastgroup: row.lastgroup || '',
    lastdate: row.lastdate || '',
    lastlevel: row.lastlevel || '',
    grsem: row.grsem || '',
    grdate: row.grdate || '',
    grno: row.grno || '',
    diploma: row.diploma || '',
    dropreason: row.dropreason || '',
    dropdate: row.dropdate || '',
    dropsem: row.dropsem || '',
    dropno: row.dropno || '',
    users: row.users || '',
    ckdate: row.ckdate || '',
    grdep: row.grdep || '',
    changeSem: row.change_sem || '',
    preMstSem: row.pre_mst_sem || '',
    graduateDate: row.graduate_date || '',
    insertDate: row.insert_date || '',
    enrollmentHistory: Array.isArray(row.enrollment_history)
      ? row.enrollment_history
      : [
          {
            id: `enr-${row.id || 'init'}`,
            action: 'admitted',
            actionName: '新生入學建檔',
            date: admissionDate,
            note: '新生入學建檔',
            operator: '行政管理員',
          },
        ],
    grades: row.grades,
  };
}

function cleanDateValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return null;
  }
  return str;
}

function convertStatusToRestToDrop(restToDropVal?: any, enrollmentStatusVal?: any): string {
  const str = String(restToDropVal ?? enrollmentStatusVal ?? '').trim().toLowerCase();
  if (str === '1' || str === 'withdrawn' || str === '休學') return '1';
  if (str === '2' || str === 'graduated' || str === '畢業' || str === '結業') return '2';
  if (str === '3' || str === 'suspended' || str === '停學' || str === '退學') return '3';
  if (str === '0' || str === 'active' || str === '在學') return '0';
  return '0';
}

/**
 * Converts a frontend Student object to database payload (snake_case columns / School DB spec).
 * Strictly matches the PostgreSQL public.students table schema with school column names.
 */
export function mapStudentToDb(student: Partial<Student>): Record<string, any> {
  const payload: Record<string, any> = {};

  if (student.studentNumber !== undefined || student.stno !== undefined) {
    payload.stno = student.studentNumber ?? student.stno;
  }
  if (student.name !== undefined) {
    payload.name = student.name;
  }
  if (student.englishName !== undefined || student.ename !== undefined) {
    payload.ename = student.englishName ?? student.ename;
  }
  if (student.passportNumber !== undefined || student.idno !== undefined) {
    payload.idno = student.passportNumber ?? student.idno;
  }
  if (student.avatarUrl !== undefined) {
    payload.avatar_url = extractStoragePath(student.avatarUrl) || student.avatarUrl;
  }
  if (student.gender !== undefined || student.sex !== undefined) {
    const rawSex = String(student.gender ?? student.sex ?? 'M').toUpperCase();
    payload.sex = rawSex.startsWith('F') || rawSex === '女' ? 'F' : 'M';
  }
  if (student.nationality !== undefined || student.nation !== undefined) {
    payload.nation = student.nationality ?? student.nation;
  }
  if (student.nationalityCode !== undefined || student.natcode !== undefined) {
    payload.natcode = student.nationalityCode ?? student.natcode;
  }
  if (student.email !== undefined) {
    payload.email = student.email;
  }
  if (student.phone !== undefined || student.mobilePhone !== undefined) {
    payload.mobile_phone = student.phone ?? student.mobilePhone;
  }
  if (student.enrollmentStatus !== undefined || student.restToDrop !== undefined || (student as any).status !== undefined) {
    payload.rest_to_drop = convertStatusToRestToDrop(student.restToDrop, student.enrollmentStatus || (student as any).status);
  }
  if (student.birthday !== undefined) {
    const d = cleanDateValue(student.birthday);
    if (d !== null) payload.birthday = d;
  }
  if (student.enterdep !== undefined) payload.enterdep = student.enterdep;
  if (student.enterdate !== undefined) {
    const d = cleanDateValue(student.enterdate);
    if (d !== null) payload.enterdate = d;
  }
  if (student.entersem !== undefined) payload.entersem = student.entersem;
  if (student.enterno !== undefined) payload.enterno = student.enterno;
  if (student.transin !== undefined) payload.transin = student.transin;
  if (student.lastgrad !== undefined) payload.lastgrad = student.lastgrad;
  if (student.lastdegre !== undefined) payload.lastdegre = student.lastdegre;
  if (student.lastclas !== undefined) payload.lastclas = student.lastclas;
  if (student.lastscol !== undefined) payload.lastscol = student.lastscol;
  if (student.lastgroup !== undefined) payload.lastgroup = student.lastgroup;
  if (student.lastdate !== undefined) {
    const d = cleanDateValue(student.lastdate);
    if (d !== null) payload.lastdate = d;
  }
  if (student.lastlevel !== undefined) payload.lastlevel = student.lastlevel;
  if (student.grsem !== undefined) payload.grsem = student.grsem;
  if (student.grdate !== undefined) {
    const d = cleanDateValue(student.grdate);
    if (d !== null) payload.grdate = d;
  }
  if (student.grno !== undefined) payload.grno = student.grno;
  if (student.diploma !== undefined) payload.diploma = student.diploma;
  if (student.dropreason !== undefined) payload.dropreason = student.dropreason;
  if (student.dropdate !== undefined) {
    const d = cleanDateValue(student.dropdate);
    if (d !== null) payload.dropdate = d;
  }
  if (student.dropsem !== undefined) payload.dropsem = student.dropsem;
  if (student.dropno !== undefined) payload.dropno = student.dropno;
  if (student.users !== undefined) payload.users = student.users;
  if (student.ckdate !== undefined) {
    const d = cleanDateValue(student.ckdate);
    if (d !== null) payload.ckdate = d;
  }
  if (student.grdep !== undefined) payload.grdep = student.grdep;
  if (student.changeSem !== undefined) payload.change_sem = student.changeSem;
  if (student.preMstSem !== undefined) payload.pre_mst_sem = student.preMstSem;
  if (student.graduateDate !== undefined) {
    const d = cleanDateValue(student.graduateDate);
    if (d !== null) payload.graduate_date = d;
  }
  if (student.insertDate !== undefined) {
    const d = cleanDateValue(student.insertDate);
    if (d !== null) payload.insert_date = d;
  }

  return payload;
}

const COLUMN_ALTERNATES: Record<string, string[]> = {
  stno: ['student_no', 'student_number', 'student_id', 'student_code'],
  student_no: ['stno', 'student_number', 'student_id', 'student_code'],
  student_number: ['stno', 'student_no', 'student_id', 'student_code'],
  ename: ['english_name', 'en_name'],
  english_name: ['ename', 'en_name'],
  idno: ['passport_no', 'passport_number'],
  passport_no: ['idno', 'passport_number'],
  passport_number: ['idno', 'passport_no'],
  sex: ['gender'],
  gender: ['sex'],
  nation: ['nationality'],
  nationality: ['nation'],
  mobile_phone: ['phone', 'phone_number', 'contact_phone', 'mobile'],
  phone: ['mobile_phone', 'phone_number', 'contact_phone', 'mobile'],
  birthday: ['birth_date'],
  birth_date: ['birthday'],
  rest_to_drop: ['current_status', 'status', 'enrollment_status'],
  current_status: ['rest_to_drop', 'status', 'enrollment_status'],
  status: ['rest_to_drop', 'enrollment_status', 'current_status'],
  enrollment_status: ['rest_to_drop', 'status', 'current_status'],
};

const STATUS_CODE_TO_STRING: Record<string, string> = {
  '0': 'active',
  '1': 'withdrawn',
  '2': 'graduated',
  '3': 'suspended',
};
const STATUS_STRING_TO_CODE: Record<string, string> = {
  active: '0',
  withdrawn: '1',
  graduated: '2',
  suspended: '3',
};

function getAlternateStatusValue(val: any): string | null {
  const str = String(val ?? '').trim().toLowerCase();
  if (str in STATUS_CODE_TO_STRING) return STATUS_CODE_TO_STRING[str];
  if (str in STATUS_STRING_TO_CODE) return STATUS_STRING_TO_CODE[str];
  return null;
}

/**
 * Executes a Supabase table operation with automatic PGRST204 (unknown column) and 23514 (check constraint) error recovery.
 * If the user's Supabase schema uses alternate column naming, missing columns, or specific check constraint values,
 * it automatically retries with compatible values/alternates, ensuring operations succeed reliably.
 */
async function executeWithSchemaResilience(
  operation: (payload: Record<string, any>) => Promise<{ data: any; error: any }>,
  initialPayload: Record<string, any>,
  maxRetries = 10
): Promise<{ data: any; error: any }> {
  const currentPayload = { ...initialPayload };
  const triedAlternates = new Set<string>();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await operation(currentPayload);

    if (!res.error) {
      return res;
    }

    // Check for 23514 check constraint violation (e.g. students_current_status_check)
    if (res.error.code === '23514' || (typeof res.error.message === 'string' && res.error.message.toLowerCase().includes('check constraint'))) {
      const statusKeys = ['rest_to_drop', 'current_status', 'status', 'enrollment_status'];
      const statusKey = statusKeys.find((k) => k in currentPayload);

      if (statusKey) {
        const currentVal = currentPayload[statusKey];
        const altVal = getAlternateStatusValue(currentVal);
        const toggleKey = `status_val_${statusKey}_${altVal}`;

        // 1. Try alternate status value (e.g. 'active' instead of '0', or '0' instead of 'active')
        if (altVal && !triedAlternates.has(toggleKey)) {
          triedAlternates.add(toggleKey);
          currentPayload[statusKey] = altVal;
          console.warn(`[Supabase Resilience] Check constraint 23514 on '${statusKey}' (current: '${currentVal}'). Retrying with '${altVal}'...`);
          continue;
        }

        // 2. Try alternate status column name
        const colAlternates = COLUMN_ALTERNATES[statusKey] || ['current_status', 'rest_to_drop', 'status'];
        const untriedCol = colAlternates.find((alt) => !triedAlternates.has(`col_swap_${alt}`));
        if (untriedCol) {
          triedAlternates.add(`col_swap_${untriedCol}`);
          delete currentPayload[statusKey];
          currentPayload[untriedCol] = altVal || currentVal || '0';
          console.warn(`[Supabase Resilience] Check constraint 23514 on '${statusKey}'. Retrying with column '${untriedCol}' = '${currentPayload[untriedCol]}'...`);
          continue;
        }

        // 3. Fallback: Strip status column from payload so the rest of student update succeeds
        if (!triedAlternates.has(`strip_status_${statusKey}`)) {
          triedAlternates.add(`strip_status_${statusKey}`);
          delete currentPayload[statusKey];
          console.warn(`[Supabase Resilience] Stripping status column '${statusKey}' due to check constraint 23514...`);
          continue;
        }
      }
    }

    // Check for PGRST204: Could not find the 'column_name' column of 'students' in the schema cache
    if (res.error.code === 'PGRST204' && typeof res.error.message === 'string') {
      const match = res.error.message.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        if (missingCol in currentPayload) {
          const val = currentPayload[missingCol];
          delete currentPayload[missingCol];

          // Check if there is an alternate column name that hasn't been tried
          const alternates = COLUMN_ALTERNATES[missingCol] || [];
          const untriedAlt = alternates.find((alt) => !triedAlternates.has(alt));

          if (untriedAlt) {
            triedAlternates.add(untriedAlt);
            currentPayload[untriedAlt] = val;
            console.warn(`[Supabase Resilience] Column '${missingCol}' not found in schema. Retrying with alternate '${untriedAlt}'...`);
          } else {
            console.warn(`[Supabase Resilience] Stripping unsupported column '${missingCol}' from payload and retrying...`);
          }
          continue;
        }
      }
    }

    return res;
  }

  return { data: null, error: new Error('Exceeded max retries for schema resilience') };
}

/**
 * Fetch all students from Supabase public.students, joined with class relationships from public.class_students & public.classes.
 */
export async function fetchStudentsFromSupabase(
  fallbackClasses: ClassEntity[] = []
): Promise<{ data: Student[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  // 1. Fetch raw students from public.students
  const { data: rawStudents, error: studentsError } = await supabase
    .from('students')
    .select('*');

  if (studentsError) {
    return { data: [], error: studentsError };
  }

  // 2. Fetch classes to build ID -> Name map
  const classMap = new Map<string, { id: string; name: string }>();

  // Pre-seed with fallback classes
  fallbackClasses.forEach((c) => {
    classMap.set(String(c.id), { id: String(c.id), name: c.name });
    if (c.name) classMap.set(String(c.name), { id: String(c.id), name: c.name });
  });

  try {
    const { data: rawClasses } = await supabase.from('classes').select('*');
    if (rawClasses) {
      rawClasses.forEach((c: any) => {
        const id = String(c.id);
        const name = c.name || c.class_name || '';
        classMap.set(id, { id, name });
        if (name) classMap.set(name, { id, name });
      });
    }
  } catch (e) {
    console.warn('[StudentService] Notice: could not fetch classes table:', e);
  }

  // 3. Fetch student <-> class relations from public.class_students
  const studentToClassIdMap = new Map<string, string>();
  try {
    const { data: rawClassStudents } = await supabase.from('class_students').select('*');
    if (rawClassStudents) {
      rawClassStudents.forEach((cs: any) => {
        const sId = cs.student_id ? String(cs.student_id) : '';
        const cId = cs.class_id ? String(cs.class_id) : '';
        if (sId && cId) {
          studentToClassIdMap.set(sId, cId);
        }
      });
    }
  } catch (e) {
    console.warn('[StudentService] Notice: could not fetch class_students table:', e);
  }

  // 4. Map each student row and populate class relation strictly from class_students
  const students: Student[] = (rawStudents || []).map((row: any) => {
    const student = mapDbToStudent(row);
    const assignedClassId = studentToClassIdMap.get(student.id);

    if (assignedClassId) {
      student.classId = assignedClassId;
      const classInfo = classMap.get(assignedClassId);
      student.className = classInfo ? classInfo.name : assignedClassId;
    } else {
      // Not in class_students -> 尚未分班
      student.classId = undefined;
      student.className = '';
    }

    return student;
  });

  // 4.5 Compute real attendance rates from attendance_records (Present=100%, Leave=50%, Absent=0%)
  try {
    const { data: attRecs } = await supabase
      .from('attendance_records')
      .select('student_id, period_1, period_2, period_3, period_4');
    if (attRecs && attRecs.length > 0) {
      const studentAttStats: Record<string, { present: number; leave: number; absent: number }> = {};
      attRecs.forEach((r: any) => {
        const sId = String(r.student_id);
        if (!studentAttStats[sId]) {
          studentAttStats[sId] = { present: 0, leave: 0, absent: 0 };
        }
        [r.period_1, r.period_2, r.period_3, r.period_4].forEach((p: any) => {
          if (!p) return;
          const pl = String(p).toUpperCase();
          if (pl === 'PRESENT') studentAttStats[sId].present += 1;
          else if (pl === 'LEAVE') studentAttStats[sId].leave += 1;
          else if (pl === 'ABSENT') studentAttStats[sId].absent += 1;
        });
      });

      students.forEach((s) => {
        const stat = studentAttStats[s.id];
        if (stat) {
          const totalPeriods = stat.present + stat.leave + stat.absent;
          if (totalPeriods > 0) {
            const earned = stat.present * 1.0 + stat.leave * 0.5 + stat.absent * 0.0;
            s.overallAttendanceRate = Math.round((earned / totalPeriods) * 1000) / 10;
            s.totalPresentHours = stat.present;
            s.totalLeaveHours = stat.leave;
            s.totalAbsenceHours = stat.absent;
          } else {
            s.overallAttendanceRate = 0;
            s.totalPresentHours = 0;
            s.totalLeaveHours = 0;
            s.totalAbsenceHours = 0;
          }
        } else {
          // No attendance records at all -> NOT 100%!
          s.overallAttendanceRate = 0;
          s.totalPresentHours = 0;
          s.totalLeaveHours = 0;
          s.totalAbsenceHours = 0;
        }
      });
    } else {
      students.forEach((s) => {
        s.overallAttendanceRate = 0;
        s.totalPresentHours = 0;
        s.totalLeaveHours = 0;
        s.totalAbsenceHours = 0;
      });
    }
  } catch (e) {
    console.warn('[StudentService] Notice: could not aggregate attendance_records:', e);
  }

  // 5. Batch resolve private avatar signed URLs from Supabase Storage
  const resolvedStudents = await batchResolveStudentAvatars(students);

  return { data: resolvedStudents, error: null };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * Assigns or updates a student's class association via public.class_students table.
 * Correctly avoids duplicate entries by cleaning previous records for the student before inserting,
 * and ensures class_id is always resolved to a valid Supabase UUID to avoid PostgreSQL 22P02 errors.
 */
export async function assignOrUpdateStudentClassInSupabase(
  studentId: string,
  classIdOrName: string | null | undefined,
  availableClasses: ClassEntity[] = []
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  // If unassigned or empty string: remove relationship from class_students
  if (!classIdOrName || classIdOrName === '尚未分班' || classIdOrName === 'unassigned' || classIdOrName.trim() === '') {
    try {
      const { error: delErr } = await supabase
        .from('class_students')
        .delete()
        .eq('student_id', studentId);

      if (delErr) {
        console.warn('[StudentService] Warning removing student from class_students:', delErr);
      }
    } catch (e) {
      console.warn('[StudentService] Notice on clearing class_students:', e);
    }
    return { success: true, error: null };
  }

  // Resolve target class info
  const matchedClass = availableClasses.find(
    (c) => c.id === classIdOrName || c.name === classIdOrName || c.classCode === classIdOrName
  );
  const targetClassName = matchedClass?.name || classIdOrName;
  const targetClassCode = matchedClass?.classCode || (classIdOrName.startsWith('CLS-') ? classIdOrName : undefined);

  let realClassUuid: string | null = null;

  // 1. If already a valid UUID
  if (isValidUuid(classIdOrName)) {
    realClassUuid = classIdOrName;
  } else if (matchedClass && isValidUuid(matchedClass.id)) {
    realClassUuid = matchedClass.id;
  } else {
    // 2. Lookup existing class in Supabase public.classes table by name or class_code
    try {
      if (targetClassName) {
        const { data: foundByName } = await supabase
          .from('classes')
          .select('id')
          .eq('name', targetClassName)
          .maybeSingle();

        if (foundByName?.id && isValidUuid(String(foundByName.id))) {
          realClassUuid = String(foundByName.id);
        }
      }

      if (!realClassUuid && targetClassCode) {
        const { data: foundByCode } = await supabase
          .from('classes')
          .select('id')
          .eq('class_code', targetClassCode)
          .maybeSingle();

        if (foundByCode?.id && isValidUuid(String(foundByCode.id))) {
          realClassUuid = String(foundByCode.id);
        }
      }

      // 3. If class doesn't exist in Supabase classes table yet, insert it to obtain a UUID
      if (!realClassUuid) {
        const newClassRecord: any = {
          name: targetClassName,
          class_code: targetClassCode || `CLS-${Date.now().toString().slice(-6)}`,
          status: 'ongoing',
        };
        if (matchedClass?.courseName) newClassRecord.course_name = matchedClass.courseName;
        if (matchedClass?.teacherName) newClassRecord.teacher_name = matchedClass.teacherName;
        if (matchedClass?.classroom) newClassRecord.classroom = matchedClass.classroom;

        let { data: insertedClass, error: insertClassErr } = await supabase
          .from('classes')
          .insert(newClassRecord)
          .select('id')
          .maybeSingle();

        if (insertClassErr && (insertClassErr.code === '23505' || insertClassErr.message?.includes('classes_class_code_key'))) {
          newClassRecord.class_code = `${newClassRecord.class_code}-${Date.now().toString().slice(-4)}`;
          const retryRes = await supabase
            .from('classes')
            .insert(newClassRecord)
            .select('id')
            .maybeSingle();
          insertedClass = retryRes.data;
          insertClassErr = retryRes.error;
        }

        if (insertedClass?.id && isValidUuid(String(insertedClass.id))) {
          realClassUuid = String(insertedClass.id);
        } else if (insertClassErr) {
          console.warn('[StudentService] Could not auto-create class in public.classes:', insertClassErr);
        }
      }
    } catch (lookupErr) {
      console.warn('[StudentService] Error resolving class UUID:', lookupErr);
    }
  }

  // If class identifier cannot be resolved to a valid UUID, gracefully log warning rather than throwing 22P02
  if (!realClassUuid || !isValidUuid(realClassUuid)) {
    console.warn(
      `[StudentService] Cannot assign to class_students: class identifier "${classIdOrName}" is not a valid UUID.`
    );
    return { success: false, error: new Error(`無效的班級 UUID (${classIdOrName})`) };
  }

  // Check existing class_students records for this student
  const { data: existing, error: fetchErr } = await supabase
    .from('class_students')
    .select('*')
    .eq('student_id', studentId);

  if (fetchErr) {
    console.warn('[StudentService] Warning checking existing class_students:', fetchErr);
  }

  const currentClassIds = (existing || []).map((r: any) => String(r.class_id));

  // If student is already assigned to this exact class, no modification needed
  if (currentClassIds.length === 1 && currentClassIds[0] === realClassUuid) {
    return { success: true, error: null };
  }

  // Dynamic capacity check
  if (matchedClass) {
    const classCap = Number(matchedClass.capacity || matchedClass.maxCapacity || 40);
    const currentCount = Number(matchedClass.studentCount || 0);
    if (currentCount >= classCap) {
      const capErr = new Error(`班級「${matchedClass.name}」已達人數上限 (${classCap} 人)，無法加入新學員。`);
      console.warn('[StudentService] Capacity limit reached:', capErr.message);
      return { success: false, error: capErr };
    }
  }

  // Delete all existing class_students relations for this student to prevent duplicates and handle transfers cleanly
  if (existing && existing.length > 0) {
    try {
      const { error: delErr } = await supabase
        .from('class_students')
        .delete()
        .eq('student_id', studentId);

      if (delErr) {
        console.warn('[StudentService] Warning deleting previous class_students:', delErr);
      }
    } catch (delCatch) {
      console.warn('[StudentService] Notice on deleting previous class_students:', delCatch);
    }
  }

  // Insert the new relation into class_students
  const { error: insertErr } = await supabase
    .from('class_students')
    .insert({
      student_id: studentId,
      class_id: realClassUuid,
    });

  if (insertErr) {
    console.error('[StudentService] Error inserting into class_students:', insertErr);
    return { success: false, error: insertErr };
  }

  return { success: true, error: null };
}

/**
 * Insert a new student into Supabase public.students, and creates class_students association if assigned.
 */
export async function createStudentInSupabase(
  newStudent: Omit<Student, 'id'> & { id?: string },
  availableClasses: ClassEntity[] = []
): Promise<{ data: Student | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  const payload = mapStudentToDb(newStudent);
  if (newStudent.id && isValidUuid(newStudent.id)) {
    payload.id = newStudent.id;
  } else {
    delete payload.id;
  }

  const { data, error } = await executeWithSchemaResilience(async (p) => {
    return await supabase!
      .from('students')
      .insert(p)
      .select()
      .single();
  }, payload);

  if (error) {
    console.error('[StudentService] Error inserting student into Supabase:', error);
    return { data: null, error };
  }

  if (!data) {
    return { data: null, error: new Error('新增學生失敗：Supabase 未能回傳新增後的學生記錄') };
  }

  const createdStudent = mapDbToStudent(data);

  // If a class was chosen for the new student, link them in class_students
  const classAssignment = newStudent.classId || newStudent.className;
  if (classAssignment && classAssignment !== '尚未分班' && classAssignment.trim() !== '') {
    await assignOrUpdateStudentClassInSupabase(
      createdStudent.id,
      classAssignment,
      availableClasses
    );
    createdStudent.className = newStudent.className || '';
    createdStudent.classId = newStudent.classId;
  } else {
    createdStudent.className = '';
    createdStudent.classId = undefined;
  }

  return { data: createdStudent, error: null };
}

/**
 * Update an existing student in Supabase public.students, and synchronizes class_students association.
 */
export async function updateStudentInSupabase(
  student: Student,
  availableClasses: ClassEntity[] = []
): Promise<{ data: Student | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  // 1. Update basic profile info in public.students
  const payload = mapStudentToDb(student);

  let dbRow: any = null;
  let updateErr: any = null;

  // Attempt update by UUID first
  if (student.id && isValidUuid(student.id)) {
    const res = await executeWithSchemaResilience(async (p) => {
      return await supabase!
        .from('students')
        .update(p)
        .eq('id', student.id)
        .select('*')
        .maybeSingle();
    }, payload);

    dbRow = res.data;
    updateErr = res.error;
  }

  // Fallback update by stno (student_no / stno) if ID matched 0 rows
  const stnoVal = student.stno || student.studentNumber;
  if (!dbRow && !updateErr && stnoVal) {
    const resStno = await executeWithSchemaResilience(async (p) => {
      return await supabase!
        .from('students')
        .update(p)
        .eq('stno', stnoVal)
        .select('*')
        .maybeSingle();
    }, payload);

    dbRow = resStno.data;
    updateErr = resStno.error;
  }

  if (updateErr) {
    console.error('[StudentService] Error updating student in Supabase:', updateErr);
    return { data: null, error: updateErr };
  }

  if (!dbRow) {
    const errorMsg = `更新學生失敗：在 Supabase 資料庫 public.students 中找不到相符紀錄 (ID: ${student.id || '無'}, 學號: ${stnoVal || '無'})`;
    console.error('[StudentService]', errorMsg);
    return { data: null, error: new Error(errorMsg) };
  }

  // 2. Synchronize class relationship in public.class_students
  const realStudentUuid = dbRow.id || student.id;
  const classAssignment = student.classId || student.className;
  if (realStudentUuid) {
    const { error: classErr } = await assignOrUpdateStudentClassInSupabase(
      realStudentUuid,
      classAssignment,
      availableClasses
    );

    if (classErr) {
      console.warn('[StudentService] Warning syncing class_students:', classErr);
    }
  }

  const updatedStudent = mapDbToStudent(dbRow);
  if (student.className && student.className !== '尚未分班') {
    updatedStudent.className = student.className;
    updatedStudent.classId = student.classId;
  } else {
    updatedStudent.className = '';
    updatedStudent.classId = undefined;
  }

  return { data: updatedStudent, error: null };
}

/**
 * Delete a student from Supabase public.students, cleaning up storage files, class_students, and associated relations.
 */
export async function deleteStudentInSupabase(
  studentId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  if (!studentId) {
    return { success: false, error: new Error('未提供學員識別碼') };
  }

  // 1. Clean up Storage files in student-avatars and student-documents (non-blocking if empty)
  try {
    await deleteStudentStorageFiles(studentId);
  } catch (storageErr) {
    console.warn('[StudentService] Notice cleaning student storage files:', storageErr);
  }

  // 2. Clean up class_students relations
  try {
    await supabase
      .from('class_students')
      .delete()
      .eq('student_id', studentId);
  } catch (csErr) {
    console.warn('[StudentService] Notice on cleaning class_students for delete:', csErr);
  }

  // 3. Clean up related historical tables if they exist
  try {
    await supabase
      .from('student_grades')
      .delete()
      .eq('student_id', studentId);
  } catch (gradeErr) {
    // Ignore if table/rows don't exist
  }

  try {
    await supabase
      .from('student_enrollment_history')
      .delete()
      .eq('student_id', studentId);
  } catch (histErr) {
    // Ignore if table/rows don't exist
  }

  // 4. Delete the student record from public.students
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId);

  if (error) {
    console.error('[StudentService] Error deleting student from database:', error);
    return { success: false, error };
  }

  return { success: true, error: null };
}

/**
 * Fetch all student grades from Supabase public.student_grades
 */
export async function fetchStudentGradesFromSupabase(
  students: Student[],
  classes: ClassEntity[]
): Promise<Record<string, StudentGrade>> {
  if (!supabase) return {};

  try {
    const { data: rows, error } = await supabase.from('student_grades').select('*');
    if (error) {
      console.error('[StudentService] Error fetching student_grades:', error);
      return {};
    }

    const studentMap = new Map(students.map((s) => [String(s.id), s]));
    const classMap = new Map(classes.map((c) => [String(c.id), c]));

    const gradeMap: Record<string, StudentGrade> = {};

    if (rows && rows.length > 0) {
      rows.forEach((r: any) => {
        const studentId = String(r.student_id);
        const student = studentMap.get(studentId);
        const classObj = r.class_id ? classMap.get(String(r.class_id)) : null;

        // Dynamic Attendance Score based on real attendance records
        const att = student ? student.overallAttendanceRate : Number(r.attendance_score ?? 0);
        const quiz = Number(r.quiz_score ?? 85);
        const mid = Number(r.midterm_score ?? 80);
        const fin = Number(r.final_score ?? 85);
        const hw = Number(r.homework_score ?? 90);
        const attid = Number(r.attitude_score ?? 90);

        const total = calculateTotalGrade(att, quiz, mid, fin, hw, attid);

        gradeMap[studentId] = {
          studentId: studentId,
          studentName: student?.name || '未知學生',
          className: classObj?.name || student?.className || '未設定班級',
          classId: r.class_id ? String(r.class_id) : student?.classId,
          attendanceScore: att,
          quizScore: quiz,
          midtermScore: mid,
          finalScore: fin,
          homeworkScore: hw,
          attitudeScore: attid,
          totalScore: total,
          updatedAt: r.updated_at ? r.updated_at.substring(0, 16).replace('T', ' ') : undefined,
        };

        // If stored attendance or total score in DB is out-of-sync with real attendance, silently update DB
        if (Number(r.attendance_score) !== att || Number(r.total_score) !== total) {
          supabase
            .from('student_grades')
            .update({ attendance_score: att, total_score: total })
            .eq('id', r.id)
            .then(() => {});
        }
      });
    }

    // Ensure all active students have grade entries initialized in database
    for (const s of students) {
      if (!gradeMap[s.id]) {
        const att = s.overallAttendanceRate;
        const quiz = 85;
        const mid = 80;
        const fin = 85;
        const hw = 90;
        const attid = 90;
        const total = calculateTotalGrade(att, quiz, mid, fin, hw, attid);

        const initialGrade: StudentGrade = {
          studentId: s.id,
          studentName: s.name,
          className: s.className || '未設定班級',
          classId: s.classId,
          attendanceScore: att,
          quizScore: quiz,
          midtermScore: mid,
          finalScore: fin,
          homeworkScore: hw,
          attitudeScore: attid,
          totalScore: total,
          updatedAt: new Date().toISOString().substring(0, 16).replace('T', ' '),
        };

        gradeMap[s.id] = initialGrade;
        saveStudentGradeToSupabase(initialGrade, s.classId);
      }
    }

    return gradeMap;
  } catch (err) {
    console.error('[StudentService] Exception in fetchStudentGradesFromSupabase:', err);
    return {};
  }
}

/**
 * Save single student grade to Supabase public.student_grades
 */
export async function saveStudentGradeToSupabase(
  grade: StudentGrade,
  classId?: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase client not initialized') };

  try {
    const { data: existingRow } = await supabase
      .from('student_grades')
      .select('id, class_id')
      .eq('student_id', grade.studentId)
      .maybeSingle();

    let targetClassId = classId || grade.classId || existingRow?.class_id || null;
    if (!targetClassId) {
      const { data: csRow } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', grade.studentId)
        .maybeSingle();
      if (csRow?.class_id) {
        targetClassId = csRow.class_id;
      }
    }

    const validClassId = targetClassId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetClassId)
      ? targetClassId
      : null;

    const payload: Record<string, any> = {
      student_id: grade.studentId,
      attendance_score: grade.attendanceScore,
      quiz_score: grade.quizScore,
      midterm_score: grade.midtermScore,
      final_score: grade.finalScore,
      homework_score: grade.homeworkScore,
      attitude_score: grade.attitudeScore,
      total_score: grade.totalScore,
      grade_letter: getLetterGrade(grade.totalScore).letter,
      updated_at: new Date().toISOString(),
    };

    if (validClassId) {
      payload.class_id = validClassId;
    }

    if (existingRow?.id) {
      payload.id = existingRow.id;
    }

    const { error } = await supabase.from('student_grades').upsert(payload);

    if (error) {
      console.error('[StudentService] Error saving student_grade:', error);
      const { error: updateErr } = await supabase
        .from('student_grades')
        .update(payload)
        .eq('student_id', grade.studentId);
      if (updateErr) {
        return { success: false, error: updateErr };
      }
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('[StudentService] Exception saving student_grade:', err);
    return { success: false, error: err };
  }
}

/**
 * Fetch transfer history records from Supabase public.student_enrollment_history
 */
export async function fetchTransferRecordsFromSupabase(
  students: Student[],
  classes: ClassEntity[]
): Promise<TransferClassRecord[]> {
  if (!supabase) return [];

  try {
    const { data: rows, error } = await supabase
      .from('student_enrollment_history')
      .select('*')
      .eq('change_type', 'TRANSFER')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[StudentService] Error fetching transfer history:', error);
      return [];
    }

    const studentMap = new Map(students.map((s) => [String(s.id), s]));
    const classMap = new Map(classes.map((c) => [String(c.id), c]));

    const records: TransferClassRecord[] = (rows || []).map((r: any) => {
      const student = studentMap.get(String(r.student_id));
      const fromClass = r.from_class_id ? classMap.get(String(r.from_class_id)) : null;
      const toClass = r.to_class_id ? classMap.get(String(r.to_class_id)) : null;

      return {
        id: String(r.id),
        studentId: String(r.student_id),
        studentName: student?.name || '轉班學員',
        fromClassId: r.from_class_id ? String(r.from_class_id) : '',
        fromClassName: fromClass?.name || '原班級',
        toClassId: r.to_class_id ? String(r.to_class_id) : '',
        toClassName: toClass?.name || '新班級',
        transferDate: r.effective_date || (r.created_at ? r.created_at.substring(0, 10) : getTodayDateStr()),
        reason: r.reason || '學生轉班異動',
        operator: '行政教務處',
        effectiveImmediately: true,
      };
    });

    return records;
  } catch (err) {
    console.error('[StudentService] Exception fetching transfer history:', err);
    return [];
  }
}

/**
 * Insert a transfer record into Supabase public.student_enrollment_history
 */
export async function createTransferRecordInSupabase(
  record: TransferClassRecord,
  operatorProfileId?: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase client not initialized') };

  try {
    const validStudentId = record.studentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.studentId)
      ? record.studentId
      : null;
    const validFromClassId = record.fromClassId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.fromClassId)
      ? record.fromClassId
      : null;
    const validToClassId = record.toClassId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.toClassId)
      ? record.toClassId
      : null;
    const validOperatorId = operatorProfileId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operatorProfileId)
      ? operatorProfileId
      : null;

    if (!validStudentId) {
      return { success: false, error: new Error('無效的學員 ID') };
    }

    const payload: Record<string, any> = {
      student_id: validStudentId,
      change_type: 'TRANSFER',
      effective_date: record.transferDate || new Date().toISOString().substring(0, 10),
      reason: record.reason || '轉班異動',
    };

    if (validFromClassId) payload.from_class_id = validFromClassId;
    if (validToClassId) payload.to_class_id = validToClassId;
    if (validOperatorId) payload.operated_by = validOperatorId;

    const { data, error } = await supabase
      .from('student_enrollment_history')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[StudentService] Error inserting transfer history:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[StudentService] Exception inserting transfer history:', err);
    return { success: false, error: err };
  }
}

