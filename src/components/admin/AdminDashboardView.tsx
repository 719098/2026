import React from 'react';
import { 
  Users, 
  GraduationCap, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  FileText,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Award,
  ArrowRightLeft,
  CalendarDays,
  ShieldAlert,
  Building2
} from 'lucide-react';
import { Student, Teacher, CourseSession, LeaveRecord, ClassEntity, AdminNavigationTab } from '../../types';
import { getTodayDateStr } from '../../utils/quarterScheduler';
import { formatDateFull } from '../../utils/dateUtils';
import { StudentAvatar } from '../StudentAvatar';

interface AdminDashboardViewProps {
  students: Student[];
  teachers: Teacher[];
  classes: ClassEntity[];
  allCourses: CourseSession[];
  leaves: LeaveRecord[];
  onNavigateTab: (tab: AdminNavigationTab) => void;
  onSelectStudentDetail: (student: Student) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  students,
  teachers,
  classes,
  allCourses,
  leaves,
  onNavigateTab,
  onSelectStudentDetail,
}) => {
  const todayStr = getTodayDateStr();

  // Today's courses across all classes
  const todayCourses = allCourses.filter((c) => c.date === todayStr);
  const completedTodayCourses = todayCourses.filter((c) => c.status === 'completed');
  const pendingTodayCourses = todayCourses.filter(
    (c) => c.status === 'unmarked' || c.status === 'in_progress'
  );

  // Today's leaves
  const todayLeaves = leaves.filter((l) => l.date === todayStr);
  const pendingLeaves = leaves.filter((l) => l.status === 'pending');

  // Visa warning students (< 80% attendance rate)
  const warningStudents = students.filter(
    (s) => s.overallAttendanceRate < 85 && s.enrollmentStatus === 'active'
  ).sort((a, b) => a.overallAttendanceRate - b.overallAttendanceRate);

  // Total completed hours in quarter
  const totalQuarterRequired = classes.reduce((acc, c) => acc + (c.totalTargetHours || 0), 0) || 0;
  // Estimate completed hours from level 1 class
  const level1Completed = allCourses
    .filter((c) => c.className.includes('初級華語一') && c.status === 'completed')
    .reduce((acc, c) => acc + c.periodsCount, 0);
  const progressPercent = Math.min(100, Math.round((level1Completed / totalQuarterRequired) * 100));

  return (
    <div className="space-y-6">
      {/* Top Banner - Morning Greeting & Center Summary */}
      <div className="bg-gradient-to-r from-white via-[#F8FAFC] to-[#E8EEF2] rounded-xl p-6 text-slate-800 shadow-2xs border border-[#DCE2E6] relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <GraduationCap className="w-56 h-56 text-[#536B7A]" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-md bg-[#E8EEF2] text-[#536B7A] text-xs font-semibold border border-[#DCE2E6] mb-3">
            <Building2 className="w-3.5 h-3.5 text-[#536B7A]" />
            <span>靜宜大學華語中心 • 行政管理中樞</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#26313B] tracking-tight">
            早安，系統管理員
          </h1>
          <p className="text-[#66717C] text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
            以下是今天華語中心的營運概況。今日日期：<strong className="text-[#26313B] font-semibold">{formatDateFull(todayStr)}</strong>。全校共開設 <strong className="text-[#26313B] font-semibold">{classes.length} 個班級</strong>、在籍外籍學員 <strong className="text-[#26313B] font-semibold">{students.length} 位</strong>、專任授課教師 <strong className="text-[#26313B] font-semibold">{teachers.length} 位</strong>。
          </p>
        </div>
      </div>

      {/* 4 High-Level Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Classes & Students */}
        <div 
          onClick={() => onNavigateTab('admin_classes')}
          className="bg-white rounded-xl p-4.5 border border-[#DCE2E6] shadow-2xs hover:border-[#536B7A]/40 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CLASSES & STUDENTS</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8EEF2] text-[#536B7A] flex items-center justify-center border border-[#DCE2E6] group-hover:bg-[#536B7A] group-hover:text-white transition-colors">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#26313B]">{classes.length}</span>
            <span className="text-xs text-slate-500">班級</span>
            <span className="text-slate-300">/</span>
            <span className="text-lg font-semibold text-slate-700">{students.length}</span>
            <span className="text-xs text-slate-500">學員</span>
          </div>
          <div className="mt-3 pt-2 border-t border-[#F0F4F7] flex items-center justify-between text-[11px] text-slate-500 group-hover:text-[#536B7A] transition-colors">
            <span>管理開班與分派教師</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Card 2: Today Attendance Status */}
        <div 
          onClick={() => onNavigateTab('admin_attendance')}
          className="bg-white rounded-xl p-4.5 border border-[#DCE2E6] shadow-2xs hover:border-[#536B7A]/40 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">TODAY ATTENDANCE</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8EEF2] text-[#536B7A] flex items-center justify-center border border-[#DCE2E6] group-hover:bg-[#536B7A] group-hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#26313B]">{completedTodayCourses.length}</span>
            <span className="text-xs text-slate-500">已回報</span>
            <span className="text-slate-300">/</span>
            <span className={`text-lg font-semibold ${pendingTodayCourses.length > 0 ? 'text-[#536B7A] font-bold' : 'text-slate-400'}`}>
              {pendingTodayCourses.length}
            </span>
            <span className="text-xs text-slate-500">待點名</span>
          </div>
          <div className="mt-3 pt-2 border-t border-[#F0F4F7] flex items-center justify-between text-[11px] text-slate-500 group-hover:text-[#536B7A] transition-colors">
            <span>查看今日全校點名日誌</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Card 3: Active Classes Count */}
        <div 
          onClick={() => onNavigateTab('admin_classes')}
          className="bg-white rounded-xl p-4.5 border border-[#DCE2E6] shadow-2xs hover:border-[#536B7A]/40 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ACTIVE CLASSES</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8EEF2] text-[#536B7A] flex items-center justify-center border border-[#DCE2E6] group-hover:bg-[#536B7A] group-hover:text-white transition-colors">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#26313B]">{classes.length}</span>
            <span className="text-xs text-slate-500">班開設中</span>
          </div>
          <div className="mt-3 pt-2 border-t border-[#F0F4F7] flex items-center justify-between text-[11px] text-slate-500 group-hover:text-[#536B7A] transition-colors">
            <span>前往開設班級管理</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Card 4: 165-Hour Curriculum Progress */}
        <div 
          onClick={() => onNavigateTab('admin_schedule')}
          className="bg-white rounded-xl p-4.5 border border-[#DCE2E6] shadow-2xs hover:border-[#536B7A]/40 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">TARGET PROGRESS</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8EEF2] text-[#536B7A] flex items-center justify-center border border-[#DCE2E6] group-hover:bg-[#536B7A] group-hover:text-white transition-colors">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold text-[#26313B]">{progressPercent}%</span>
              <span className="text-xs text-slate-500">已授課 {level1Completed}H</span>
            </div>
            <span className="text-xs font-mono font-medium text-slate-400">/ {totalQuarterRequired}H</span>
          </div>
          <div className="w-full bg-[#E8EEF2] h-1.5 rounded-full mt-3 overflow-hidden border border-[#DCE2E6]">
            <div 
              className="bg-[#536B7A] h-full rounded-full transition-all duration-500" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2-Column Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Class Status Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Courses Live Table */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#F0F4F7]">
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-4 h-4 text-[#536B7A]" />
                <h2 className="text-sm font-bold text-[#26313B]">今日全校授課班級點名即時狀態</h2>
              </div>
              <button
                onClick={() => onNavigateTab('admin_attendance')}
                className="text-xs text-[#536B7A] hover:text-[#26313B] font-semibold inline-flex items-center space-x-1"
              >
                <span>全校點名總表</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {todayCourses.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                本日無全校排定課程或為國定假日／週末公休。
              </div>
            ) : (
              <div className="divide-y divide-[#F0F4F7] mt-2">
                {todayCourses.map((course) => {
                  const isDone = course.status === 'completed';
                  return (
                    <div key={course.id} className="py-3 flex items-center justify-between hover:bg-[#F8FAFC] px-2 rounded-lg transition-colors">
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-[#26313B] truncate">{course.className}</span>
                          <span className="text-[10px] font-mono text-slate-600 bg-[#E8EEF2] px-2 py-0.5 rounded border border-[#DCE2E6]">
                            {course.classroom}
                          </span>
                        </div>
                        <div className="text-xs text-[#66717C] mt-1 flex items-center space-x-3">
                          <span>授課教師：<strong className="text-slate-700">{course.teacherName}</strong></span>
                          <span>•</span>
                          <span>時段：{course.timeSlot} ({course.periodsCount}節/天)</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        {isDone ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            已點名
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#E8EEF2] text-[#26313B] border border-[#C9D1D7]">
                            <Clock className="w-3.5 h-3.5 mr-1 text-[#536B7A]" />
                            待點名
                          </span>
                        )}
                        <button
                          onClick={() => onNavigateTab('admin_attendance')}
                          className="px-2.5 py-1 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] rounded-md text-xs font-semibold border border-[#DCE2E6] transition-colors"
                        >
                          查看
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Action Matrix */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-[#536B7A]" />
              <span>行政常用核心快捷操作</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => onNavigateTab('admin_students')}
                className="p-3 bg-[#F8FAFC] hover:bg-[#E8EEF2]/60 border border-[#DCE2E6] hover:border-[#536B7A]/40 rounded-lg text-left transition-all group"
              >
                <Users className="w-4 h-4 text-[#536B7A] mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-xs font-bold text-[#26313B]">學生學籍管理</div>
                <div className="text-[10px] text-slate-500 mt-0.5">新生建立與異動</div>
              </button>

              <button
                onClick={() => onNavigateTab('admin_assignments')}
                className="p-3 bg-[#F8FAFC] hover:bg-[#E8EEF2]/60 border border-[#DCE2E6] hover:border-[#536B7A]/40 rounded-lg text-left transition-all group"
              >
                <ArrowRightLeft className="w-4 h-4 text-[#536B7A] mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-xs font-bold text-[#26313B]">學員分班與轉班</div>
                <div className="text-[10px] text-slate-500 mt-0.5">即時跨班調派</div>
              </button>

              <button
                onClick={() => onNavigateTab('admin_classes')}
                className="p-3 bg-[#F8FAFC] hover:bg-[#E8EEF2]/60 border border-[#DCE2E6] hover:border-[#536B7A]/40 rounded-lg text-left transition-all group"
              >
                <BookOpen className="w-4 h-4 text-[#536B7A] mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-xs font-bold text-[#26313B]">開設班級管理</div>
                <div className="text-[10px] text-slate-500 mt-0.5">開班/指派教師</div>
              </button>

              <button
                onClick={() => onNavigateTab('admin_grades')}
                className="p-3 bg-[#F8FAFC] hover:bg-[#E8EEF2]/60 border border-[#DCE2E6] hover:border-[#536B7A]/40 rounded-lg text-left transition-all group"
              >
                <Award className="w-4 h-4 text-[#536B7A] mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-xs font-bold text-[#26313B]">全校成績總表</div>
                <div className="text-[10px] text-slate-500 mt-0.5">出席20%加權核算</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Visa Warning Students & Important Alerts */}
        <div className="space-y-6">
          {/* Visa Attendance Warning Box */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F7]">
              <div className="flex items-center space-x-2 text-[#26313B] font-bold text-sm">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>簽證出席率預警名單 (&lt;85%)</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                {warningStudents.length} 人
              </span>
            </div>

            <p className="text-[11px] text-[#66717C] mt-2.5 leading-relaxed">
              依移民署規定，外籍學生出席率未達 80% 者可能面臨簽證撤銷。請行政組通知導師加強輔導。
            </p>

            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {warningStudents.slice(0, 6).map((student) => (
                <div
                  key={student.id}
                  onClick={() => onSelectStudentDetail(student)}
                  className="p-2.5 rounded-lg border border-[#DCE2E6] hover:border-[#536B7A]/40 hover:bg-[#F8FAFC] transition-all flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-8 h-8" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#26313B] truncate group-hover:text-[#536B7A]">
                        {student.name} ({student.englishName})
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {student.className} • 缺課 {student.totalAbsenceHours}H
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold font-mono text-amber-700">
                      {student.overallAttendanceRate}%
                    </span>
                    <div className="text-[10px] text-slate-400 font-medium">預警</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onNavigateTab('admin_reports')}
              className="w-full mt-3 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] rounded-lg text-xs font-semibold border border-[#DCE2E6] transition-colors text-center"
            >
              檢視完整出席預警報表
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
