import { CourseSession, Student, Teacher, StudentPeriodAttendance, HolidayInfo, QuarterScheduleSummary } from '../types';
import { 
  STUDENTS_LEVEL1, 
  STUDENTS_LEVEL2, 
  STUDENTS_LEVEL3,
  STUDENTS_CHEN_CONVERSATION,
  STUDENTS_CHEN_BUSINESS,
  STUDENTS_CHEN_CULTURE,
  TEACHER_LIN,
  TEACHER_CHEN
} from '../data/mockData';

export const TODAY_DATE = '2026-08-11'; // Current reference anchor date (Tuesday)
export const QUARTER_START_DATE = '2026-07-01'; // Wednesday
export const QUARTER_END_DATE = '2026-10-31'; // Saturday
export const QUARTER_NAME = '2026 夏季班 (Summer Quarter)';
export const TARGET_HOURS_PER_QUARTER = 165; // Standard 165 hours / quarter

// Taiwan National Holidays & CLC Center Breaks during Summer 2026
export const HOLIDAYS_CONFIG: Record<string, HolidayInfo> = {
  '2026-08-28': {
    date: '2026-08-28',
    name: '全中心教師教學研習會（停課）',
    type: 'center_break',
    isNoClass: true,
  },
  '2026-09-25': {
    date: '2026-09-25',
    name: '中秋節（國定假日停課）',
    type: 'national',
    isNoClass: true,
  },
  '2026-10-09': {
    date: '2026-10-09',
    name: '國慶連假彈性調整（停課）',
    type: 'national',
    isNoClass: true,
  },
  '2026-10-10': {
    date: '2026-10-10',
    name: '國慶日（國定假日）',
    type: 'national',
    isNoClass: true,
  },
};

// Check if a date is a weekend or holiday
export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

export function isHoliday(dateStr: string): HolidayInfo | null {
  return HOLIDAYS_CONFIG[dateStr] || null;
}

// Calculate days between two dates
export function getDaysDifference(dateA: string, dateB: string): number {
  const [y1, m1, d1] = dateA.split('-').map(Number);
  const [y2, m2, d2] = dateB.split('-').map(Number);
  const timeA = new Date(y1, m1 - 1, d1).getTime();
  const timeB = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((timeA - timeB) / (1000 * 60 * 60 * 24));
}

// Generate deterministic pseudo-random student attendance for completed past sessions
function generateRealisticAttendance(
  students: Student[],
  dateStr: string,
  classIdx: number,
  periodsCount: number
): { [studentId: string]: StudentPeriodAttendance } {
  const result: { [studentId: string]: StudentPeriodAttendance } = {};

  const [y, m, d] = dateStr.split('-').map(Number);
  const seed = y * 10000 + m * 100 + d + classIdx * 17;

  students.forEach((student, idx) => {
    // Generate realistic variance
    const pseudoRand = ((seed + idx * 31) % 100) / 100;

    // Student 3 tends to have more leaves
    if (idx === 2 && pseudoRand < 0.35) {
      result[student.id] = {
        period1: 'leave',
        period2: 'leave',
        period3: periodsCount === 3 ? 'leave' : undefined,
        remarks: '事假：居留簽證文件補件辦理',
      };
    } else if (idx === 7 && pseudoRand < 0.25) {
      // Student 8 tends to have absence
      result[student.id] = {
        period1: 'absent',
        period2: 'present',
        period3: periodsCount === 3 ? 'present' : undefined,
        remarks: '第1節無故缺席',
      };
    } else if (idx === 11 && pseudoRand < 0.2) {
      result[student.id] = {
        period1: 'present',
        period2: 'leave',
        period3: periodsCount === 3 ? 'leave' : undefined,
        remarks: '病假：身體不適提前離校',
      };
    } else if (pseudoRand < 0.04) {
      // Occasional random leave
      result[student.id] = {
        period1: 'leave',
        period2: 'leave',
        period3: periodsCount === 3 ? 'leave' : undefined,
        remarks: '病假：感冒就醫',
      };
    } else {
      // Normal present
      result[student.id] = {
        period1: 'present',
        period2: 'present',
        period3: periodsCount === 3 ? 'present' : undefined,
      };
    }
  });

  return result;
}

// Generate the complete Full Quarter Schedule for all classes
export function generateFullQuarterCourses(): CourseSession[] {
  const allCourses: CourseSession[] = [];

  // Class definitions
  const classConfigs = [
    // Teacher Lin (林明學)
    {
      code: 'CLC-101-A',
      courseName: '初級華語一',
      level: '初級',
      className: '初級華語一',
      textbook: '《當代中文課程》第一冊',
      classroom: '博愛大樓 302 教室',
      teacher: TEACHER_LIN,
      startTime: '09:00',
      endTime: '12:00',
      timeSlot: '09:00 - 12:00',
      periodsCount: 3,
      periodTimes: ['09:00-09:50', '10:00-10:50', '11:00-11:50'],
      students: STUDENTS_LEVEL1,
      classIdx: 1,
    },
    {
      code: 'CLC-201-B',
      courseName: '中級華語二',
      level: '中級',
      className: '中級華語二',
      textbook: '《當代中文課程》第二冊',
      classroom: '博愛大樓 405 教室',
      teacher: TEACHER_LIN,
      startTime: '13:30',
      endTime: '16:30',
      timeSlot: '13:30 - 16:30',
      periodsCount: 3,
      periodTimes: ['13:30-14:20', '14:30-15:20', '15:30-16:20'],
      students: STUDENTS_LEVEL2,
      classIdx: 2,
    },
    {
      code: 'CLC-301-C',
      courseName: '高級華語三',
      level: '高級',
      className: '高級華語三',
      textbook: '《新版實用視聽華語》第三冊',
      classroom: '博愛大樓 201 教室',
      teacher: TEACHER_LIN,
      startTime: '18:30',
      endTime: '20:30',
      timeSlot: '18:30 - 20:30',
      periodsCount: 2, // 2-Hour Class!
      periodTimes: ['18:30-19:20', '19:30-20:20'],
      students: STUDENTS_LEVEL3,
      classIdx: 3,
    },
    // Teacher Chen (陳靜宜)
    {
      code: 'CLC-102-D',
      courseName: '生活會話一班',
      level: '初中級',
      className: '生活會話一班',
      textbook: '《實用生活華語會話》第一冊',
      classroom: '博愛大樓 308 教室',
      teacher: TEACHER_CHEN,
      startTime: '09:00',
      endTime: '12:00',
      timeSlot: '09:00 - 12:00',
      periodsCount: 3,
      periodTimes: ['09:00-09:50', '10:00-10:50', '11:00-11:50'],
      students: STUDENTS_CHEN_CONVERSATION,
      classIdx: 4,
    },
    {
      code: 'CLC-202-E',
      courseName: '商務華語實務',
      level: '中高級',
      className: '商務華語實務',
      textbook: '《實用商務華語》第二冊',
      classroom: '博愛大樓 502 教室',
      teacher: TEACHER_CHEN,
      startTime: '13:00',
      endTime: '16:00',
      timeSlot: '13:00 - 16:00',
      periodsCount: 3,
      periodTimes: ['13:00-13:50', '14:00-14:50', '15:00-15:50'],
      students: STUDENTS_CHEN_BUSINESS,
      classIdx: 5,
    },
    {
      code: 'CLC-302-F',
      courseName: '台灣文化與影視欣賞',
      level: '高級',
      className: '台灣文化與影視欣賞',
      textbook: '《台灣影視文化專題》',
      classroom: '博愛大樓 203 教室',
      teacher: TEACHER_CHEN,
      startTime: '18:30',
      endTime: '20:30',
      timeSlot: '18:30 - 20:30',
      periodsCount: 2, // 2-Hour Class!
      periodTimes: ['18:30-19:20', '19:30-20:20'],
      students: STUDENTS_CHEN_CULTURE,
      classIdx: 6,
    },
  ];

  let curr = QUARTER_START_DATE;
  let sessionIndexCounter: Record<string, number> = {};
  classConfigs.forEach((c) => {
    sessionIndexCounter[c.className] = 0;
  });

  while (curr <= QUARTER_END_DATE) {
    const isWknd = isWeekend(curr);
    const holidayInfo = isHoliday(curr);

    // Skip weekends entirely
    if (!isWknd) {
      classConfigs.forEach((config) => {
        sessionIndexCounter[config.className]++;
        const sessionNum = sessionIndexCounter[config.className];
        const sessionId = `C-${curr.replace(/-/g, '')}-${config.classIdx}`;

        // If holiday, create a special holiday/cancelled session or mark
        if (holidayInfo && holidayInfo.isNoClass) {
          allCourses.push({
            id: sessionId,
            courseCode: config.code,
            courseName: config.courseName,
            level: config.level,
            className: config.className,
            textbook: config.textbook,
            classroom: config.classroom,
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: curr,
            startTime: config.startTime,
            endTime: config.endTime,
            timeSlot: config.timeSlot,
            periodsCount: config.periodsCount,
            periodTimes: config.periodTimes,
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'holiday',
            isLocked: true,
            lockReason: `${holidayInfo.name}，本日全校停課`,
          });
          return;
        }

        // Check specific Demo Reschedule on 2026-08-04 (Teacher Lin - 初級華語一)
        if (curr === '2026-08-04' && config.className === '初級華語一') {
          allCourses.push({
            id: sessionId,
            courseCode: config.code,
            courseName: config.courseName,
            level: config.level,
            className: config.className,
            textbook: `${config.textbook} 第 6 課（調課日）`,
            classroom: config.classroom,
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: curr,
            startTime: config.startTime,
            endTime: config.endTime,
            timeSlot: config.timeSlot,
            periodsCount: config.periodsCount,
            periodTimes: config.periodTimes,
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'rescheduled_out',
            rescheduleInfo: {
              isRescheduled: true,
              type: 'out',
              originalDate: '2026-08-04',
              originalTime: '09:00 - 12:00',
              targetDate: '2026-08-05',
              targetTime: '14:00 - 17:00',
              reason: '博愛大樓 302 教室進行電力空調安全檢修',
              requestedBy: '國語教學中心教務組',
              requestedAt: '2026-07-28 14:30',
            },
          });
          return;
        }

        // Makeup session on 2026-08-05 (Teacher Lin - 初級華語一)
        if (curr === '2026-08-05' && config.className === '初級華語一') {
          // Regular morning class
          allCourses.push({
            id: sessionId,
            courseCode: config.code,
            courseName: config.courseName,
            level: config.level,
            className: config.className,
            textbook: `${config.textbook} 第 7 課`,
            classroom: config.classroom,
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: curr,
            startTime: config.startTime,
            endTime: config.endTime,
            timeSlot: config.timeSlot,
            periodsCount: config.periodsCount,
            periodTimes: config.periodTimes,
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'completed',
            attendanceData: generateRealisticAttendance(config.students, curr, config.classIdx, config.periodsCount),
            lastUpdated: '2026-08-05 12:05',
          });

          // Additional afternoon makeup class from 08-04
          allCourses.push({
            id: `C-20260805-01-MAKEUP`,
            courseCode: config.code,
            courseName: `${config.courseName}（補課堂次）`,
            level: config.level,
            className: config.className,
            textbook: `${config.textbook} 第 6 課（補課）`,
            classroom: '博愛大樓 305 視聽教室',
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: '2026-08-05',
            startTime: '14:00',
            endTime: '17:00',
            timeSlot: '14:00 - 17:00',
            periodsCount: 3,
            periodTimes: ['14:00-14:50', '15:00-15:50', '16:00-16:50'],
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'completed',
            rescheduleInfo: {
              isRescheduled: true,
              type: 'in',
              originalDate: '2026-08-04',
              originalTime: '09:00 - 12:00',
              targetDate: '2026-08-05',
              targetTime: '14:00 - 17:00',
              reason: '博愛大樓 302 教室電力空調檢修，移至本日下午補課',
              requestedBy: '教務處',
              requestedAt: '2026-07-28 14:30',
            },
            attendanceData: generateRealisticAttendance(config.students, '2026-08-05-MK', config.classIdx + 10, config.periodsCount),
            lastUpdated: '2026-08-05 17:05',
          });
          return;
        }

        // Determine status based on Date vs Today (2026-08-11)
        const daysDiffFromToday = getDaysDifference(TODAY_DATE, curr); // positive if curr < TODAY_DATE

        if (curr < TODAY_DATE) {
          // Past dates:
          // In the past 7 days (e.g. 2026-08-07 or 2026-08-10): Leave 1-2 sessions as 'unmarked' to demo "待補點名"
          if (curr === '2026-08-07' && config.className === '中級華語二') {
            allCourses.push({
              id: sessionId,
              courseCode: config.code,
              courseName: config.courseName,
              level: config.level,
              className: config.className,
              textbook: `${config.textbook} 第 8 課`,
              classroom: config.classroom,
              teacherName: config.teacher.name,
              teacherId: config.teacher.id,
              date: curr,
              startTime: config.startTime,
              endTime: config.endTime,
              timeSlot: config.timeSlot,
              periodsCount: config.periodsCount,
              periodTimes: config.periodTimes,
              studentCount: config.students.length,
              studentIds: config.students.map((s) => s.id),
              status: 'unmarked', // Needs makeup roll call within 7 days!
            });
          } else if (curr === '2026-08-10' && config.className === '生活會話一班') {
            allCourses.push({
              id: sessionId,
              courseCode: config.code,
              courseName: config.courseName,
              level: config.level,
              className: config.className,
              textbook: `${config.textbook} 第 9 課`,
              classroom: config.classroom,
              teacherName: config.teacher.name,
              teacherId: config.teacher.id,
              date: curr,
              startTime: config.startTime,
              endTime: config.endTime,
              timeSlot: config.timeSlot,
              periodsCount: config.periodsCount,
              periodTimes: config.periodTimes,
              studentCount: config.students.length,
              studentIds: config.students.map((s) => s.id),
              status: 'unmarked', // Needs makeup roll call within 7 days!
            });
          } else {
            // Completed past course
            const lessonNum = Math.min(15, Math.ceil(sessionNum / 3));
            allCourses.push({
              id: sessionId,
              courseCode: config.code,
              courseName: config.courseName,
              level: config.level,
              className: config.className,
              textbook: `${config.textbook} 第 ${lessonNum} 課`,
              classroom: config.classroom,
              teacherName: config.teacher.name,
              teacherId: config.teacher.id,
              date: curr,
              startTime: config.startTime,
              endTime: config.endTime,
              timeSlot: config.timeSlot,
              periodsCount: config.periodsCount,
              periodTimes: config.periodTimes,
              studentCount: config.students.length,
              studentIds: config.students.map((s) => s.id),
              status: 'completed',
              attendanceData: generateRealisticAttendance(config.students, curr, config.classIdx, config.periodsCount),
              lastUpdated: `${curr} ${config.endTime}`,
            });
          }
        } else if (curr === TODAY_DATE) {
          // Today's courses (2026-08-11):
          const lessonNum = 9;
          allCourses.push({
            id: sessionId,
            courseCode: config.code,
            courseName: config.courseName,
            level: config.level,
            className: config.className,
            textbook: `${config.textbook} 第 ${lessonNum} 課`,
            classroom: config.classroom,
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: curr,
            startTime: config.startTime,
            endTime: config.endTime,
            timeSlot: config.timeSlot,
            periodsCount: config.periodsCount,
            periodTimes: config.periodTimes,
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'unmarked', // Today pending roll call
          });
        } else {
          // Future dates (2026-08-12 to 2026-10-31):
          // ALWAYS status: 'unmarked' (Upcoming), NEVER show warnings
          const lessonNum = Math.min(15, 9 + Math.ceil((sessionNum - 30) / 3));
          allCourses.push({
            id: sessionId,
            courseCode: config.code,
            courseName: config.courseName,
            level: config.level,
            className: config.className,
            textbook: `${config.textbook} 第 ${lessonNum > 0 ? lessonNum : 1} 課`,
            classroom: config.classroom,
            teacherName: config.teacher.name,
            teacherId: config.teacher.id,
            date: curr,
            startTime: config.startTime,
            endTime: config.endTime,
            timeSlot: config.timeSlot,
            periodsCount: config.periodsCount,
            periodTimes: config.periodTimes,
            studentCount: config.students.length,
            studentIds: config.students.map((s) => s.id),
            status: 'unmarked', // Upcoming
          });
        }
      });
    }

    // Move to next day
    const [y, m, d] = curr.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextY = nextDate.getFullYear();
    const nextM = nextDate.getMonth() + 1;
    const nextD = nextDate.getDate();
    curr = `${nextY}-${nextM < 10 ? '0' + nextM : nextM}-${nextD < 10 ? '0' + nextD : nextD}`;
  }

  return allCourses;
}

// Calculate Quarter Schedule Statistics (165 Hours Rule)
export function calculateQuarterStats(courses: CourseSession[], className: string): QuarterScheduleSummary {
  const classCourses = courses.filter((c) => c.className === className);
  const totalSessions = classCourses.filter((c) => c.status !== 'holiday' && c.status !== 'rescheduled_out').length;
  
  // Calculate total scheduled hours
  let totalScheduledHours = 0;
  let completedHours = 0;
  let makeupHours = 0;

  classCourses.forEach((c) => {
    if (c.status === 'holiday' || c.status === 'rescheduled_out') return;
    const hours = c.periodsCount; // 3 or 2
    totalScheduledHours += hours;
    if (c.status === 'completed') {
      completedHours += hours;
    }
    if (c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in') {
      makeupHours += hours;
    }
  });

  const holidaysList = Object.values(HOLIDAYS_CONFIG).map((h) => ({
    date: h.date,
    name: h.name,
    hours: 3,
  }));

  const holidayShortageHours = Math.max(0, TARGET_HOURS_PER_QUARTER - totalScheduledHours);

  return {
    quarterName: QUARTER_NAME,
    startDate: QUARTER_START_DATE,
    endDate: QUARTER_END_DATE,
    targetHours: TARGET_HOURS_PER_QUARTER,
    weeklyHours: 15,
    dailyHours: 3,
    totalSessions,
    totalScheduledHours,
    completedHours,
    holidayShortageHours,
    makeupHours,
    effectiveTotalHours: totalScheduledHours,
    holidaysList,
  };
}
