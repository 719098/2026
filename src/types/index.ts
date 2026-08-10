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

export interface HolidayInfo {
  date: string;
  name: string;
  type: 'national' | 'center_break' | 'typhoon' | 'other';
  isNoClass: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string;
  term: string;
  email: string;
  assignedClasses: string[];
  phone?: string;
  office?: string;
  specialty?: string;
}

export interface LeaveRecord {
  studentId: string;
  studentName: string;
  studentEnglishName: string;
  className: string;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  periods: number[]; // [1, 2, 3] or [1, 2]
  type: LeaveType;
  typeName: string; // e.g. "事假", "病假"
  reason: string;
  approvedAt: string;
  status: 'approved' | 'pending';
}

export interface Student {
  id: string;
  studentNumber: string;
  name: string;
  englishName: string;
  avatarUrl: string;
  gender: 'M' | 'F';
  nationality: string;
  nationalityCode: string;
  className: string;
  email: string;
  phone: string;
  overallAttendanceRate: number; // e.g. 94.5%
  totalAbsenceHours: number;
  totalLeaveHours: number;
  totalPresentHours?: number;
  totalRequiredHours?: number;
  visaStatus?: 'safe' | 'warning' | 'danger';
}

export interface StudentGrade {
  studentId: string;
  studentName: string;
  className: string;
  attendanceScore: number; // 0-100, auto-calculated from attendance rate
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
  period3?: AttendanceStatus; // Optional for 2-hour classes
  remarks?: string;
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
  courseCode: string;
  courseName: string; // e.g. "初級華語一"
  level: string; // e.g. "初級"
  className: string; // e.g. "初級華語一"
  textbook: string; // e.g. "《當代中文課程》第一冊 第 4 課"
  classroom: string; // e.g. "國語中心 302 教室"
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
