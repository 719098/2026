import { 
  ClassScheduleRule, 
  ClassSessionEntity, 
  Holiday, 
  ScheduleProgress,
  DayScheduleSummary,
  CourseSession,
  QuarterScheduleSummary,
  ClassEntity,
  Student,
  Teacher
} from '../types';

/**
 * ============================================================================
 * QUARTER SCHEDULER UTILITIES (純計算與格式化工具)
 * 注意：正式排課資料來源全部經由 Supabase scheduleService.ts (SQL 5 表架構)
 * 本檔案提供無副作用之純計算函式及過渡期相容格式轉換。
 * ============================================================================
 */

/**
 * 取得系統/瀏覽器當前實際日期 (格式: YYYY-MM-DD)
 * 嚴格使用 new Date() 動態生成，不再寫死任何固定日期。
 */
export function getTodayDateStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const taipeiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return taipeiNow.toISOString().slice(0, 10);
  }
}

// 導出動態計算的 TODAY_DATE，相容於既有模組參照，每次呼叫時返回真實當天
export const TODAY_DATE = getTodayDateStr();
export const QUARTER_START_DATE = '2026-07-01';
export const QUARTER_END_DATE = '2026-10-31';
export const TARGET_HOURS_PER_QUARTER = 165;
export const QUARTER_NAME = '2026 夏季密集班 (第3期)';

export const HOLIDAYS_CONFIG: Record<string, { name: string; isNoClass: boolean; date: string }> = {
  '2026-08-08': { name: '父親節', isNoClass: false, date: '2026-08-08' },
  '2026-08-10': { name: '中元節 / 中心研習日', isNoClass: true, date: '2026-08-10' },
  '2026-09-25': { name: '中秋節連續假期', isNoClass: true, date: '2026-09-25' },
  '2026-10-10': { name: '國慶日放假', isNoClass: true, date: '2026-10-10' },
};

// 判斷是否為國定假日
export function isHoliday(dateStr: string): { name: string; isNoClass: boolean; date: string } | null {
  return HOLIDAYS_CONFIG[dateStr] || null;
}

// 判斷某日期字串 (YYYY-MM-DD) 是否為週末
export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6; // 0=Sunday, 6=Saturday
}

// 取得兩日期相差天數
export function getDaysDifference(dateA: string, dateB: string): number {
  const [y1, m1, d1] = dateA.split('-').map(Number);
  const [y2, m2, d2] = dateB.split('-').map(Number);
  const timeA = Date.UTC(y1, m1 - 1, d1);
  const timeB = Date.UTC(y2, m2 - 1, d2);
  return Math.round((timeA - timeB) / (1000 * 60 * 60 * 24));
}

// 取得 ISO 星期中文名稱 (1=週一 ... 7=週日)
export function getIsoWeekdayName(isoDay: number): string {
  const map: Record<number, string> = {
    1: '週一',
    2: '週二',
    3: '週三',
    4: '週四',
    5: '週五',
    6: '週六',
    7: '週日',
  };
  return map[isoDay] || `週${isoDay}`;
}

// 依排課規則動態計算每週時數 (例如 5天*3節 = 15H，2天*2節 = 4H)
export function calculateWeeklyHoursFromRules(rules: ClassScheduleRule[]): number {
  if (!rules || rules.length === 0) return 0;
  return rules.reduce((acc, r) => acc + (Number(r.periodsCount) || 3), 0);
}

// 依實際堂次計算有效已排總時數 (僅計入 NORMAL 與 MAKEUP)
export function calculateScheduledHoursFromSessions(sessions: ClassSessionEntity[]): number {
  if (!sessions || sessions.length === 0) return 0;
  return sessions
    .filter((s) => s.status === 'NORMAL' || s.status === 'MAKEUP')
    .reduce((acc, s) => acc + (Number(s.periodsCount) || 3), 0);
}

// 計算 165 小時進度指標 (純運算)
export function calculateScheduleProgressMetrics(
  targetHours: number,
  sessions: ClassSessionEntity[]
): ScheduleProgress {
  const target = typeof targetHours === 'number' ? targetHours : 0;
  let scheduledHours = 0;
  let normalCount = 0;
  let makeupCount = 0;
  let rescheduledCount = 0;
  let cancelledCount = 0;

  (sessions || []).forEach((s) => {
    const p = Number(s.periodsCount) || 3;
    if (s.status === 'NORMAL') {
      normalCount++;
      scheduledHours += p;
    } else if (s.status === 'MAKEUP') {
      makeupCount++;
      scheduledHours += p;
    } else if (s.status === 'RESCHEDULED') {
      rescheduledCount++;
    } else if (s.status === 'CANCELLED') {
      cancelledCount++;
    }
  });

  const remainingHours = Math.max(0, target - scheduledHours);
  const progressPercentage = target > 0 ? Math.min(100, Math.round((scheduledHours / target) * 100)) : 0;

  return {
    targetHours: target,
    scheduledHours,
    remainingHours,
    progressPercentage,
    normalSessionsCount: normalCount,
    makeupSessionsCount: makeupCount,
    rescheduledSessionsCount: rescheduledCount,
    cancelledSessionsCount: cancelledCount,
  };
}

// 格式化上課時段 (如 09:00:00 -> 09:00 - 12:00)
export function formatTimeRange(start: string, end: string): string {
  const s = start?.length >= 5 ? start.slice(0, 5) : start || '';
  const e = end?.length >= 5 ? end.slice(0, 5) : end || '';
  return `${s} - ${e}`;
}

// 計算全季排課統計 (相容舊版介面)
export function calculateQuarterStats(courses: CourseSession[], className: string): QuarterScheduleSummary {
  const classCourses = courses.filter((c) => c.className === className);
  const isCancelledSession = (c: CourseSession) =>
    c.isCancelled || c.isSuspended || c.status === 'holiday' || c.status === 'rescheduled_out' || (c.status as string) === 'CANCELLED';

  const totalSessions = classCourses.filter((c) => !isCancelledSession(c)).length;
  
  let totalScheduledHours = 0;
  let completedHours = 0;
  let makeupHours = 0;

  classCourses.forEach((c) => {
    if (isCancelledSession(c)) return;
    const hours = c.periodsCount;
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

