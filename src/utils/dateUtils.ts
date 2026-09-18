import { DayScheduleSummary, CourseSession } from '../types';
import { HOLIDAYS_CONFIG, getTodayDateStr, isWeekend, isHoliday } from './quarterScheduler';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDateFull(dateStr: string): string {
  // dateStr: "2026-08-11"
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  return `${y} / ${m < 10 ? '0' + m : m} / ${d < 10 ? '0' + d : d}（${weekday}）`;
}

export function formatDateShort(dateStr: string): { displayDate: string; weekday: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = '週' + WEEKDAYS[date.getDay()];
  const displayDate = `${m < 10 ? '0' + m : m}/${d < 10 ? '0' + d : d}`;
  return { displayDate, weekday };
}

export function getAdjacentDate(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offsetDays);
  const nextY = date.getFullYear();
  const nextM = date.getMonth() + 1;
  const nextD = date.getDate();
  return `${nextY}-${nextM < 10 ? '0' + nextM : nextM}-${nextD < 10 ? '0' + nextD : nextD}`;
}

// Get the Monday of the week containing dateStr
export function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  date.setDate(diff);
  const nextY = date.getFullYear();
  const nextM = date.getMonth() + 1;
  const nextD = date.getDate();
  return `${nextY}-${nextM < 10 ? '0' + nextM : nextM}-${nextD < 10 ? '0' + nextD : nextD}`;
}

export function generateDateStrip(
  startDateStr: string,
  endDateStr: string,
  courses: CourseSession[],
  currentSelectedDate: string
): DayScheduleSummary[] {
  const summaries: DayScheduleSummary[] = [];
  let curr = startDateStr;

  while (curr <= endDateStr) {
    const [y, m, d] = curr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isWknd = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayInfo = isHoliday(curr);
    const isHol = !!holidayInfo;
    const holidayName = holidayInfo?.name;
    const { displayDate, weekday } = formatDateShort(curr);

    const today = getTodayDateStr();
    const isToday = curr === today;
    const isPast = curr < today;
    const isFuture = curr > today;

    const dayCourses = courses.filter((c) => c.date === curr);
    const totalCourses = dayCourses.length;

    const completedCount = dayCourses.filter((c) => c.status === 'completed').length;
    const rescheduledCount = dayCourses.filter((c) => c.status === 'rescheduled_out').length;
    const makeupCount = dayCourses.filter((c) => c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in').length;
    const inProgressCount = dayCourses.filter((c) => c.status === 'in_progress').length;

    // IMPORTANT: For future dates, unmarked count for warnings is 0!
    // For past dates, unmarked count is pending makeup attendance.
    // For today, unmarked count is today's pending attendance.
    const unmarkedCount = dayCourses.filter((c) => c.status === 'unmarked').length;
    const pendingMakeupCount = isPast ? dayCourses.filter((c) => (c.status === 'unmarked' || c.status === 'in_progress')).length : 0;

    const hasReschedule = rescheduledCount > 0;
    const hasMakeup = makeupCount > 0;

    summaries.push({
      date: curr,
      displayDate,
      weekday,
      fullDisplay: formatDateFull(curr),
      isToday,
      isPast,
      isFuture,
      isWeekend: isWknd,
      isHoliday: isHol,
      holidayName,
      totalCourses,
      unmarkedCount,
      inProgressCount,
      completedCount,
      rescheduledCount,
      makeupCount,
      hasReschedule,
      hasMakeup,
      pendingMakeupCount,
    });

    curr = getAdjacentDate(curr, 1);
  }

  return summaries;
}
