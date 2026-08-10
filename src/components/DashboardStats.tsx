import React from 'react';
import { 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  UserMinus, 
  AlertCircle,
  CalendarCheck
} from 'lucide-react';
import { CourseSession, LeaveRecord } from '../types';

interface DashboardStatsProps {
  courses: CourseSession[];
  todayLeaves: LeaveRecord[];
  onFilterStatus?: (status: string) => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  courses,
  todayLeaves,
}) => {
  const activeCourses = courses.filter((c) => c.status !== 'rescheduled_out');
  const totalCoursesCount = activeCourses.length;
  const unmarkedCount = activeCourses.filter((c) => c.status === 'unmarked' || c.status === 'in_progress').length;
  const completedCount = activeCourses.filter((c) => c.status === 'completed').length;
  const rescheduledOutCount = courses.filter((c) => c.status === 'rescheduled_out').length;
  const leaveCount = todayLeaves.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* 1. 今日課程 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 tracking-wide">今日授課</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-extrabold text-slate-800">{totalCoursesCount}</span>
            <span className="text-xs font-medium text-slate-500">堂課</span>
          </div>
          {rescheduledOutCount > 0 && (
            <p className="text-[11px] text-amber-700 font-medium mt-1">
              另有 {rescheduledOutCount} 堂已調課
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
          <BookOpen className="w-5 h-5" />
        </div>
      </div>

      {/* 2. 待點名 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-amber-700 tracking-wide">待點名</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className={`text-2xl font-extrabold ${unmarkedCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {unmarkedCount}
            </span>
            <span className="text-xs font-medium text-slate-500">堂課</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {unmarkedCount > 0 ? '需教師點名完成' : '無待處理堂次'}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
          unmarkedCount > 0 
            ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse' 
            : 'bg-slate-50 text-slate-400 border-slate-200'
        }`}>
          <Clock className="w-5 h-5" />
        </div>
      </div>

      {/* 3. 已完成 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700 tracking-wide">已完成點名</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-extrabold text-emerald-600">{completedCount}</span>
            <span className="text-xs font-medium text-slate-500">堂課</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {totalCoursesCount > 0 
              ? `達成率 ${Math.round((completedCount / totalCoursesCount) * 100)}%` 
              : '本日無課'}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>

      {/* 4. 今日請假 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-700 tracking-wide">今日請假</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-extrabold text-blue-600">{leaveCount}</span>
            <span className="text-xs font-medium text-slate-500">位學生</span>
          </div>
          <p className="text-[11px] text-blue-600 font-medium mt-1">
            {leaveCount > 0 ? '行政已核准假單' : '無事前請假紀錄'}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
          <UserMinus className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
