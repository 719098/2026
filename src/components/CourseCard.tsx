import React from 'react';
import { 
  Clock, 
  Users, 
  BookOpen, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRightLeft, 
  ArrowRight,
  Edit3,
  Eye,
  Lock,
  Calendar,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { CourseSession, Student, StudentPeriodAttendance } from '../types';
import { calculateAttendanceStats } from '../utils/attendanceUtils';
import { TODAY_DATE, getDaysDifference } from '../utils/quarterScheduler';

interface CourseCardProps {
  course: CourseSession;
  students: Student[];
  onStartAttendance: (course: CourseSession) => void;
  onViewRecord: (course: CourseSession) => void;
  onJumpToTargetDate?: (targetDate: string) => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  students,
  onStartAttendance,
  onViewRecord,
  onJumpToTargetDate,
}) => {
  const periodsCount = course.periodsCount || 3;
  const isRescheduledOut = course.status === 'rescheduled_out';
  const isRescheduledIn = course.status === 'rescheduled_in' || course.rescheduleInfo?.type === 'in';
  const isCompleted = course.status === 'completed';
  const isInProgress = course.status === 'in_progress';
  
  const isPast = course.date < TODAY_DATE;
  const isToday = course.date === TODAY_DATE;
  const isFuture = course.date > TODAY_DATE;

  const daysSinceCourse = getDaysDifference(TODAY_DATE, course.date);
  const isOverdue = isPast && daysSinceCourse > 7;
  const isLocked = course.status === 'locked' || course.isLocked || isOverdue;

  // Calculate attendance rate if completed
  let statsDisplay = null;
  if (isCompleted && course.attendanceData) {
    const stats = calculateAttendanceStats(students, course.attendanceData, periodsCount);
    statsDisplay = {
      presentHours: stats.totalPresentHours,
      totalHours: stats.totalHours,
      rate: stats.attendanceRate,
    };
  }

  // Visual card styles based on status
  let cardBorderColor = 'border-slate-200';
  let cardBgColor = 'bg-white';

  if (isRescheduledOut) {
    cardBorderColor = 'border-amber-300 bg-amber-50/30';
  } else if (isRescheduledIn) {
    cardBorderColor = 'border-blue-300 ring-1 ring-blue-100 bg-white';
  } else if (isCompleted) {
    cardBorderColor = 'border-emerald-200 bg-white';
  } else if (isPast && !isCompleted) {
    cardBorderColor = isOverdue ? 'border-slate-300 bg-slate-50/80' : 'border-amber-400 bg-amber-50/20';
  }

  return (
    <div
      id={`course-card-${course.id}`}
      className={`rounded-2xl border ${cardBorderColor} ${cardBgColor} p-5 shadow-xs transition-all hover:shadow-md relative overflow-hidden`}
    >
      {/* Top Banner for Rescheduled/Makeup */}
      {isRescheduledOut && (
        <div className="mb-4 bg-amber-100/80 border border-amber-300 rounded-xl p-3.5 text-amber-900">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <span className="p-1 rounded-md bg-amber-200 text-amber-900">
                <AlertCircle className="w-4 h-4" />
              </span>
              <span className="font-bold text-sm text-amber-950">⚠️ 課程已調課（本日不上課）</span>
            </div>
            {course.rescheduleInfo && onJumpToTargetDate && (
              <button
                onClick={() => onJumpToTargetDate(course.rescheduleInfo!.targetDate)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-md text-xs font-bold transition-colors shadow-2xs"
              >
                <span>前往 {course.rescheduleInfo.targetDate.slice(5)} 補課堂次</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {course.rescheduleInfo && (
            <div className="mt-2.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/70 p-2.5 rounded-lg border border-amber-200/80">
              <div>
                <span className="text-slate-500 font-medium">原定時間：</span>
                <span className="line-through font-mono text-slate-600 font-semibold ml-1">
                  {course.rescheduleInfo.originalDate} {course.rescheduleInfo.originalTime}
                </span>
              </div>
              <div>
                <span className="text-amber-800 font-medium">調整至：</span>
                <span className="font-mono text-amber-950 font-bold ml-1 bg-amber-200/70 px-1.5 py-0.5 rounded">
                  {course.rescheduleInfo.targetDate} {course.rescheduleInfo.targetTime}
                </span>
              </div>
              <div className="sm:col-span-2 text-slate-700 mt-0.5">
                <span className="text-slate-500">調課原因：</span>
                <span className="font-medium text-slate-800 ml-1">{course.rescheduleInfo.reason}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {isRescheduledIn && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="p-1 rounded-md bg-blue-200 text-blue-900">
                <ArrowRightLeft className="w-4 h-4" />
              </span>
              <span className="font-bold text-sm text-blue-950">🔵 補課／調課堂次</span>
            </div>
            {course.rescheduleInfo && (
              <span className="text-xs font-mono font-bold bg-blue-200 text-blue-900 px-2 py-0.5 rounded">
                原定：{course.rescheduleInfo.originalDate} ({course.rescheduleInfo.originalTime})
              </span>
            )}
          </div>
          {course.rescheduleInfo?.reason && (
            <p className="text-xs text-blue-800 mt-1.5 pl-7">
              事由：{course.rescheduleInfo.reason}
            </p>
          )}
        </div>
      )}

      {/* Main Course Info Grid */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          {/* Time & Class Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white font-mono shadow-2xs">
              <Clock className="w-3.5 h-3.5 mr-1 text-teal-400" />
              {course.timeSlot} ({periodsCount}節課)
            </span>

            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              {course.className}
            </span>

            <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200">
              <MapPin className="w-3 h-3 mr-1 text-slate-400" />
              {course.classroom}
            </span>

            {/* Status Badges with Precise Date Semantics */}
            {isRescheduledOut ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                🟠 已調課
              </span>
            ) : isOverdue ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300">
                <Lock className="w-3 h-3 mr-1" />
                🔒 逾期未點名 (已鎖定)
              </span>
            ) : isCompleted ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                🟢 已完成點名
              </span>
            ) : isPast ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                ⚠️ 待補點名 (過去堂次)
              </span>
            ) : isToday ? (
              isInProgress ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 animate-pulse">
                  🟡 今日點名進行中
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                  🟠 今日待點名
                </span>
              )
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                🔵 即將授課 (未來課程)
              </span>
            )}
          </div>

          {/* Title & Level */}
          <div>
            <h3 className={`text-xl font-black text-slate-900 tracking-tight ${
              isRescheduledOut ? 'line-through text-slate-400' : ''
            }`}>
              {course.courseName}
            </h3>
            <div className="flex items-center space-x-2 text-xs text-slate-600 mt-1">
              <span className="font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                {course.level}
              </span>
              <span>•</span>
              <span className="flex items-center text-slate-700">
                <BookOpen className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {course.textbook}
              </span>
            </div>
          </div>

          {/* Student Count & Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
            <div className="flex items-center space-x-1.5">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-800">{course.studentCount} 位學生</span>
            </div>

            {statsDisplay && (
              <div className="flex items-center space-x-3 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-900 font-medium">
                <span>應到 {statsDisplay.totalHours} 小時</span>
                <span>•</span>
                <span>實到 {statsDisplay.presentHours} 小時</span>
                <span>•</span>
                <span className="font-bold text-emerald-700">出席率 {statsDisplay.rate}%</span>
              </div>
            )}

            {course.lastUpdated && (
              <span className="text-slate-400">
                最後更新: {course.lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Action Button Section */}
        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          {isRescheduledOut ? (
            <div className="text-right text-xs text-slate-500">
              <span className="inline-block bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-medium">
                此堂課已移至補課日點名
              </span>
            </div>
          ) : isOverdue ? (
            <button
              onClick={() => onViewRecord(course)}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>逾期已鎖定 (查看紀錄)</span>
            </button>
          ) : isCompleted ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onViewRecord(course)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-colors border border-slate-200"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>查看明細</span>
              </button>
              <button
                onClick={() => onStartAttendance(course)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>修改點名</span>
              </button>
            </div>
          ) : isPast ? (
            <button
              id={`btn-makeup-attendance-${course.id}`}
              onClick={() => onStartAttendance(course)}
              className="px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center space-x-2 transition-all shadow-md bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/20 active:scale-95"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>補做點名</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </button>
          ) : isToday ? (
            <button
              id={`btn-start-attendance-${course.id}`}
              onClick={() => onStartAttendance(course)}
              className="px-5 py-2.5 rounded-xl font-extrabold text-sm flex items-center space-x-2 transition-all shadow-md bg-teal-600 hover:bg-teal-700 text-white shadow-teal-900/20 active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isInProgress ? '繼續點名' : '開始點名'}</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </button>
          ) : (
            <button
              onClick={() => onStartAttendance(course)}
              className="px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>預覽/預先點名</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
