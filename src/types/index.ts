export type UserRole = 'ADMIN' | 'TEACHER';

export interface UserProfile {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AttendanceStatus = 'present' | 'leave' | 'absent';

export type CourseSessionStatus = 
  | 'unmarked'        // 尚未點名 / 即將上課
  | 'in_progress'     // 點名進行中
  | 'completed'       // 已完成
  | 'rescheduled_out' // 已調課至其他日期（本日不上課）
  | 'rescheduled_in'  // 補課 / 調課（由其他日期移來）
  | 'locked'          // 已逾期或管理員鎖定
  | 'holiday';        // 國定假日 / 停課 / 休息日

export type LeaveType = 'personal' | 'sick' | 'official' | 'bereavement';

export type EnrollmentStatus = 'active' | 'graduated' | 'suspended' | 'withdrawn';

export interface HolidayInfo {
  date: string;
  name: string;
  type: 'national' | 'center_break' | 'typhoon' | 'other';
  isNoClass: boolean;
}

// SQL 5: 假日與校務停課日實體 (public.holidays)
export interface Holiday {
  id: string;
  termId?: string | null;
  date: string; // YYYY-MM-DD
  name: string;
  isSuspended: boolean;
  notes?: string | null;
  createdAt?: string;
}

// SQL 5: 班級每週固定排課規則 (public.class_schedule_rules)
export interface ClassScheduleRule {
  id: string;
  classId: string;
  dayOfWeek: number; // 1 (Mon) ~ 7 (Sun)
  startTime: string; // "09:00:00" or "09:00"
  endTime: string; // "12:00:00" or "12:00"
  periodsCount: number; // e.g. 3 or 2
  classroom?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// SQL 5: 班級實際課堂堂次 (public.class_sessions)
export type ClassSessionStatus = 'NORMAL' | 'RESCHEDULED' | 'MAKEUP' | 'CANCELLED';

export interface ClassSessionEntity {
  id: string;
  classId: string;
  sessionDate: string; // YYYY-MM-DD
  dayOfWeek: number; // 1 ~ 7
  startTime: string; // "09:00:00" or "09:00"
  endTime: string; // "12:00:00" or "12:00"
  periodsCount: number;
  classroom: string;
  status: ClassSessionStatus;
  rescheduledToDate?: string | null;
  rescheduledFromSessionId?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Joins (optional helper fields for UI)
  className?: string;
  courseName?: string;
  teacherName?: string;
}

export interface ScheduleProgress {
  targetHours: number;
  scheduledHours: number;
  remainingHours: number;
  progressPercentage: number;
  normalSessionsCount: number;
  makeupSessionsCount: number;
  rescheduledSessionsCount: number;
  cancelledSessionsCount: number;
}

// TERM: 學期期別定義（例如：2026 夏季密集班 (第3期)）
export interface Term {
  id: string;
  name: string; // e.g. "2026 夏季密集班 (第3期)"
  termCode: string; // e.g. "2026S"
  startDate: string; // "2026-07-01"
  endDate: string; // "2026-10-31"
  isLocked: boolean; // 是否已封存鎖定
  isActive: boolean; // 是否啟用中
  createdAt?: string;
  updatedAt?: string;
}

// CLASS: 實際開設的班級（例如：2026 夏季 初級華語一 A班）
export interface ClassEntity {
  id: string;
  classCode: string; // e.g. "2026S-LV1-A"
  name: string; // e.g. "2026 夏季 初級華語一 A班"
  courseId?: string;
  courseName?: string;
  teacherId: string; // 授課教師 ID
  teacherName: string; // 授課教師姓名
  classroom: string; // e.g. "華語中心 302 教室"
  termId?: string; // 關聯 Term.id
  term: string; // e.g. "2026 夏季密集班"
  startDate: string; // "2026-07-01"
  endDate: string; // "2026-10-31"
  dailyHours: number; // 3 或 2
  weeklyDays: number[]; // [1, 2, 3, 4, 5] (週一至週五)
  timeSlot: string; // "09:00 - 12:00"
  totalTargetHours: number; // 165
  maxCapacity: number; // e.g. 40
  capacity: number; // 班級容量 (預設 40，可由 ADMIN 修改)
  studentCount: number;
  studentIds: string[];
  materials?: any[]; // 已指派教材列表
  materialIds?: string[]; // 選取的最多 2 個教材 ID
  materialNames?: string[]; // 選取的最多 2 個教材名稱
  remarks?: string; // 備註 (進度備註)
  status: 'planning' | 'ongoing' | 'completed' | 'OPEN' | 'CLOSED' | string;
}

export interface Teacher {
  id: string;
  teacherNo?: string;
  acctno?: string; // 學校欄位：教職員編號/帳號
  profileId?: string;
  name: string;
  empName?: string; // 學校欄位：中文姓名
  title: string;
  department: string;
  avatarUrl: string;
  term: string;
  email: string;
  empEmail?: string; // 學校欄位：電子郵件
  assignedClasses: string[]; // 授課班級名稱或 ID
  assignedClassIds?: string[];
  phone?: string;
  empOfficeExt?: string; // 學校欄位：校內分機
  office?: string;
  specialty?: string;
  empSkill?: string; // 學校欄位：專長技能
  status?: 'active' | 'leave' | 'inactive';
  englishName?: string;
  empEname?: string; // 學校欄位：英文姓名
  empIdno?: string;  // 學校欄位：身分證字號
  empId?: string;    // 學校欄位：教師代號
  teaName?: string;  // 學校欄位：兼任教師姓名
  empUntid?: string; // 學校欄位：單位代碼
  empWuntid?: string;// 學校欄位：兼任單位
  empTitid?: string; // 學校欄位：職稱代碼
  empPosid?: string; // 學校欄位：職務代碼
  empSex?: string;   // 學校欄位：性別
  empStudyExt?: string; // 學校欄位：研究室分機
  empTitid2?: string; // 學校欄位：兼任職稱代碼
  empUnify?: string;  // 學校欄位：統一編號
}

export interface StudentEnrollmentHistory {
  id: string;
  date: string;
  action: 'admitted' | 'transferred' | 'withdrawn' | 're_enrolled' | 'graduated';
  actionName: string;
  fromClass?: string;
  toClass?: string;
  studentNumber?: string;
  note: string;
  operator: string;
}

export interface TransferClassRecord {
  id: string;
  studentId: string;
  studentName: string;
  fromClassId: string;
  fromClassName: string;
  toClassId: string;
  toClassName: string;
  transferDate: string;
  reason: string;
  operator: string;
  effectiveImmediately: boolean;
}

export interface LeaveRecord {
  id?: string;
  studentId: string;
  studentName: string;
  studentEnglishName: string;
  className: string;
  classId?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  periods: number[]; // [1, 2, 3] or [1, 2]
  type: LeaveType;
  typeName: string; // e.g. "事假", "病假"
  reason: string;
  approvedAt: string;
  status: 'approved' | 'pending' | 'rejected';
  appliedAt?: string;
  approver?: string;
}

export interface Student {
  id: string;
  studentNumber: string;
  stno?: string; // 學校欄位：學號
  name: string;
  englishName: string;
  ename?: string; // 學校欄位：英文姓名
  passportNumber?: string; // 護照號碼
  idno?: string; // 學校欄位：身份證號/護照號碼
  avatarUrl: string;
  gender: 'M' | 'F';
  sex?: 'M' | 'F' | string; // 學校欄位：性別
  nationality: string;
  nation?: string; // 學校欄位：國籍
  nationalityCode: string;
  natcode?: string; // 學校欄位：身分別代碼
  classId?: string; // 實際開班 ID
  className: string; // 班級名稱
  email: string;
  phone: string;
  mobilePhone?: string; // 學校欄位：手機
  overallAttendanceRate: number; // e.g. 94.5%
  totalAbsenceHours: number;
  totalLeaveHours: number;
  totalPresentHours?: number;
  totalRequiredHours?: number;
  visaStatus?: 'safe' | 'warning' | 'danger';
  enrollmentStatus?: EnrollmentStatus; // 'active' | 'graduated' | 'suspended' | 'withdrawn'
  restToDrop?: string; // 學校欄位：休轉退註記
  admissionDate?: string; // 入學日期
  birthday?: string; // 學校欄位：生日
  enterdep?: string; // 學校欄位：入學系所
  enterdate?: string; // 學校欄位：入學日期
  entersem?: string; // 學校欄位：入學學期別
  enterno?: string; // 學校欄位：入學文號
  transin?: string; // 學校欄位：入學方式
  lastgrad?: string;
  lastdegre?: string;
  lastclas?: string;
  lastscol?: string;
  lastgroup?: string;
  lastdate?: string;
  lastlevel?: string;
  grsem?: string;
  grdate?: string;
  grno?: string;
  diploma?: string;
  dropreason?: string;
  dropdate?: string;
  dropsem?: string;
  dropno?: string;
  users?: string;
  ckdate?: string;
  grdep?: string;
  changeSem?: string;
  preMstSem?: string;
  graduateDate?: string;
  insertDate?: string;
  enrollmentHistory?: StudentEnrollmentHistory[];
  grades?: {
    listeningSpeaking: number;
    readingWriting: number;
    dailyPerformance: number;
  };
}

export interface StudentGrade {
  studentId: string;
  studentName: string;
  className: string;
  classId?: string;
  attendanceScore: number; // 0-100, auto-calculated from attendance rate (20%)
  quizScore: number;       // 0-100 (15%) 平時考
  midtermScore: number;    // 0-100 (20%) 期中考
  finalScore: number;      // 0-100 (20%) 期末考
  homeworkScore: number;   // 0-100 (15%) 作業
  attitudeScore: number;   // 0-100 (10%) 學習態度
  totalScore: number;      // auto-calculated
  updatedAt?: string;
}

export interface StudentPeriodAttendance {
  period1: AttendanceStatus;
  period2: AttendanceStatus;
  period3?: AttendanceStatus; // For 3-hour and 4-hour classes
  period4?: AttendanceStatus; // For 4-hour intensive classes
  remarks?: string;
  evidenceImagePath?: string;
  evidenceImageUrl?: string;
}

export interface RescheduleInfo {
  isRescheduled: boolean;
  type: 'out' | 'in'; // 'out': 原日期已移走, 'in': 新日期補課
  originalDate: string; // YYYY-MM-DD
  originalTime: string;
  targetDate: string; // YYYY-MM-DD
  targetTime: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
}

export interface CourseSession {
  id: string;
  classId?: string;
  courseCode: string;
  courseName: string; // e.g. "初級華語一"
  level: string; // e.g. "初級"
  className: string; // e.g. "2026 夏季 初級華語一 A班"
  textbook: string; // e.g. "《當代中文課程》第一冊 第 4 課"
  classroom: string; // e.g. "華語中心 302 教室"
  teacherName: string;
  teacherId?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "09:00"
  endTime: string; // "12:00" or "11:00"
  timeSlot: string; // "09:00 - 12:00" or "09:00 - 11:00"
  periodsCount: number; // 3 or 2
  periodTimes: string[]; // ["09:00-09:50", "10:00-10:50", "11:00-11:50"]
  studentCount: number;
  studentIds: string[];
  status: CourseSessionStatus;
  rescheduleInfo?: RescheduleInfo;
  attendanceData?: {
    [studentId: string]: StudentPeriodAttendance;
  };
  lastUpdated?: string;
  isLocked?: boolean;
  lockReason?: string;
}

export interface DayScheduleSummary {
  date: string; // YYYY-MM-DD
  displayDate: string; // "07/30"
  weekday: string; // "四"
  fullDisplay: string; // "2026 / 07 / 30（四）"
  isToday?: boolean;
  isPast?: boolean;
  isFuture?: boolean;
  isWeekend?: boolean;
  isHoliday?: boolean;
  holidayName?: string;
  totalCourses: number;
  unmarkedCount: number;
  inProgressCount: number;
  completedCount: number;
  rescheduledCount: number;
  makeupCount: number;
  hasReschedule: boolean;
  hasMakeup: boolean;
  pendingMakeupCount: number; // Only for past sessions needing makeup attendance
}

export interface QuarterScheduleSummary {
  quarterName: string;
  startDate: string;
  endDate: string;
  targetHours: number; // 165
  weeklyHours: number; // 15
  dailyHours: number; // 3
  totalSessions: number;
  totalScheduledHours: number;
  completedHours: number;
  holidayShortageHours: number;
  makeupHours: number;
  effectiveTotalHours: number;
  holidaysList: { date: string; name: string; hours: number }[];
}

export type AdminNavigationTab =
  | 'admin_dashboard'     // 行政首頁儀表板
  | 'admin_students'      // 學生學籍管理
  | 'admin_enrollment'    // 學生分班與轉班
  | 'admin_assignments'   // 學生分班與轉班
  | 'admin_terms'         // 學期期別管理 (Terms)
  | 'admin_courses'       // 教材與班級進度管理
  | 'admin_materials'     // 教材主資料與班級教材管理 (Materials)
  | 'admin_classes'       // 開設班級管理 (Classes)
  | 'admin_teachers'      // 教師師資管理
  | 'admin_schedule'      // 全校排課與調課
  | 'admin_attendance'    // 全校點名監控
  | 'admin_grades'        // 全校成績總表
  | 'admin_reports';      // 行政報表中心
