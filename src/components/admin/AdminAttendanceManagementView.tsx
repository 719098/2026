import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  Search, 
  BookOpen, 
  Clock, 
  AlertTriangle, 
  Eye, 
  X, 
  Sparkles,
  Users,
  Filter,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { CourseSession, Student, ClassEntity, StudentPeriodAttendance } from '../../types';
import { getTodayDateStr } from '../../utils/quarterScheduler';
import { formatDateFull } from '../../utils/dateUtils';
import { calculateAttendanceStats } from '../../utils/attendanceUtils';
import { StudentAvatar } from '../StudentAvatar';

interface AdminAttendanceManagementViewProps {
  allCourses: CourseSession[];
  students: Student[];
  classes: ClassEntity[];
  onSelectStudentDetail: (student: Student) => void;
}

export const AdminAttendanceManagementView: React.FC<AdminAttendanceManagementViewProps> = ({
  allCourses,
  students,
  classes,
  onSelectStudentDetail,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStr());
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  // Inspect Modal
  const [inspectSession, setInspectSession] = useState<CourseSession | null>(null);

  // Courses on selected date
  const dateCourses = useMemo(() => {
    return allCourses.filter((c) => {
      const matchDate = c.date === selectedDate;
      const matchClass = selectedClassId === 'ALL' || c.className.includes(selectedClassId);
      return matchDate && matchClass;
    });
  }, [allCourses, selectedDate, selectedClassId]);

  // School-wide statistics across all classes for selected date
  const dayStats = useMemo(() => {
    let totalPresentHours = 0;
    let totalLeaveHours = 0;
    let totalAbsentHours = 0;
    let totalExpectedHours = 0;
    let totalStudentsCount = 0;
    let period1Present = 0, period1Leave = 0, period1Absent = 0;
    let period2Present = 0, period2Leave = 0, period2Absent = 0;
    let period3Present = 0, period3Leave = 0, period3Absent = 0;
    let has3HClasses = false;

    dateCourses.forEach((session) => {
      const pCount = session.periodsCount || 3;
      if (pCount >= 3) has3HClasses = true;

      const enrolled = students.filter(
        (s) => (session.studentIds || []).includes(s.id) || (session.className && s.className === session.className)
      );
      totalStudentsCount += enrolled.length;

      if (session.status === 'completed' || session.attendanceData) {
        const sessionStats = calculateAttendanceStats(enrolled, session.attendanceData, pCount);
        totalPresentHours += sessionStats.totalPresentHours;
        totalLeaveHours += sessionStats.totalLeaveHours;
        totalAbsentHours += sessionStats.totalAbsentHours;
        totalExpectedHours += sessionStats.totalHours;

        period1Present += sessionStats.period1.present;
        period1Leave += sessionStats.period1.leave;
        period1Absent += sessionStats.period1.absent;

        period2Present += sessionStats.period2.present;
        period2Leave += sessionStats.period2.leave;
        period2Absent += sessionStats.period2.absent;

        if (sessionStats.period3) {
          period3Present += sessionStats.period3.present;
          period3Leave += sessionStats.period3.leave;
          period3Absent += sessionStats.period3.absent;
        }
      }
    });

    const attendanceRate = totalExpectedHours > 0
      ? Math.round((totalPresentHours / totalExpectedHours) * 100)
      : 100;

    return {
      totalCourses: dateCourses.length,
      completedCourses: dateCourses.filter((c) => c.status === 'completed').length,
      totalStudentsCount,
      totalPresentHours,
      totalLeaveHours,
      totalAbsentHours,
      totalExpectedHours,
      attendanceRate,
      has3HClasses,
      period1: { present: period1Present, leave: period1Leave, absent: period1Absent },
      period2: { present: period2Present, leave: period2Leave, absent: period2Absent },
      period3: { present: period3Present, leave: period3Leave, absent: period3Absent },
    };
  }, [dateCourses, students]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">全校班級點名即時監控與歷史存檔</h1>
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            行政端具備全校所有班級、所有日期的即時點名數據監控、事由備註稽核與佐證照片檢視權限。
          </p>
        </div>

        {/* Date & Class Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-[#F5F7F9] p-1.5 rounded-lg border border-[#DCE2E6]">
            <Calendar className="w-4 h-4 text-[#536B7A] ml-1.5" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1 text-xs border-0 bg-transparent font-mono font-bold text-[#26313B] focus:outline-none"
            />
          </div>

          <button
            onClick={() => setSelectedDate(getTodayDateStr())}
            className="px-3 py-2 bg-[#536B7A] hover:bg-[#455865] text-white font-semibold rounded-lg text-xs transition-colors shadow-2xs"
          >
            今日 ({getTodayDateStr().slice(5).replace('-', '/')})
          </button>
        </div>
      </div>

      {/* Real-time Attendance Statistics Dashboard (Integrated from Teacher view) */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                全校即時點名統計儀表板 • {selectedDate}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                排課 {dayStats.totalCourses} 班 • 已點名 {dayStats.completedCourses} 班
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              當日綜合出席率：
              <span className={`text-2xl font-black ml-2 font-mono ${
                dayStats.attendanceRate >= 90 ? 'text-emerald-400' : dayStats.attendanceRate >= 80 ? 'text-yellow-400' : 'text-rose-400'
              }`}>
                {dayStats.attendanceRate}%
              </span>
            </h2>
          </div>

          {/* Total Hours Breakdown */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300">實到總時數:</span>
              <span className="text-sm font-extrabold text-white font-mono">{dayStats.totalPresentHours} 小時</span>
            </div>

            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <span className="text-slate-300">請假總時數:</span>
              <span className="text-sm font-extrabold text-blue-300 font-mono">{dayStats.totalLeaveHours} 小時</span>
            </div>

            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-slate-300">缺席總時數:</span>
              <span className="text-sm font-extrabold text-rose-300 font-mono">{dayStats.totalAbsentHours} 小時</span>
            </div>
          </div>
        </div>

        {/* Periods Individual Counters */}
        <div className={`grid grid-cols-1 ${dayStats.has3HClasses ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3 pt-4`}>
          {/* Period 1 */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-teal-300">第 1 節 全校出缺</span>
              <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-400">🟢 出席 {dayStats.period1.present}</span>
              <span className="text-blue-300">🔵 請假 {dayStats.period1.leave}</span>
              <span className="text-rose-400">🔴 缺席 {dayStats.period1.absent}</span>
            </div>
          </div>

          {/* Period 2 */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-teal-300">第 2 節 全校出缺</span>
              <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-400">🟢 出席 {dayStats.period2.present}</span>
              <span className="text-blue-300">🔵 請假 {dayStats.period2.leave}</span>
              <span className="text-rose-400">🔴 缺席 {dayStats.period2.absent}</span>
            </div>
          </div>

          {/* Period 3 */}
          {dayStats.has3HClasses && (
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-teal-300">第 3 節 全校出缺</span>
                <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-emerald-400">🟢 出席 {dayStats.period3.present}</span>
                <span className="text-blue-300">🔵 請假 {dayStats.period3.leave}</span>
                <span className="text-rose-400">🔴 缺席 {dayStats.period3.absent}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Class Filter Badges */}
      <div className="bg-white p-3 rounded-xl border border-[#DCE2E6] shadow-2xs flex items-center space-x-2 overflow-x-auto">
        <span className="text-xs font-semibold text-[#66717C] shrink-0">班級篩選：</span>
        <button
          onClick={() => setSelectedClassId('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
            selectedClassId === 'ALL'
              ? 'bg-[#536B7A] text-white border-[#536B7A]'
              : 'bg-[#F0F4F7] text-[#26313B] border-[#DCE2E6] hover:bg-[#E8EEF2]'
          }`}
        >
          全校所有班級
        </button>
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedClassId(c.name)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
              selectedClassId === c.name
                ? 'bg-[#536B7A] text-white border-[#536B7A]'
                : 'bg-[#F0F4F7] text-[#26313B] border-[#DCE2E6] hover:bg-[#E8EEF2]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Courses List on Selected Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dateCourses.length === 0 ? (
          <div className="col-span-full py-16 bg-white rounded-xl border border-[#DCE2E6] text-center text-[#66717C] text-xs">
            {selectedDate} 本日無排定課程或尚未安排課堂明細
          </div>
        ) : (
          dateCourses.map((session) => {
            const isCompleted = session.status === 'completed';
            const enrolledStudents = students.filter(
              (s) => (session.studentIds || []).includes(s.id) || (session.className && s.className === session.className)
            );
            const sessionStats = session.attendanceData
              ? calculateAttendanceStats(enrolledStudents, session.attendanceData, session.periodsCount || 3)
              : null;

            return (
              <div
                key={session.id}
                className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs hover:border-[#536B7A]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-[#26313B]">{session.className}</span>
                        <span className="text-xs font-semibold text-[#536B7A] bg-[#E8EEF2] px-2 py-0.5 rounded border border-[#DCE2E6]">
                          {session.classroom}
                        </span>
                      </div>
                      <div className="text-xs text-[#66717C] mt-1">
                        授課教師：<strong>{session.teacherName} 老師</strong> • 時段：{session.timeSlot}
                      </div>
                    </div>

                    {isCompleted ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        已完成點名 {sessionStats ? `(${sessionStats.attendanceRate}%)` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8EEF2] text-slate-700 border border-[#DCE2E6]">
                        <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        待教師回報
                      </span>
                    )}
                  </div>

                  <div className="mt-3.5 p-3 bg-[#F8FAFC] rounded-lg text-xs space-y-1 border border-[#F0F4F7]">
                    <div className="text-[#26313B] font-semibold">
                      進度教材：<strong>{session.textbook}</strong>
                    </div>
                    <div className="text-[#66717C] text-[11px] flex items-center justify-between">
                      <span>在班學生：{enrolledStudents.length} 人 • 授課節數：{session.periodsCount || 3} 節</span>
                      {isCompleted && sessionStats && (
                        <span className="font-mono font-bold text-emerald-700">
                          實到 {sessionStats.totalPresentHours}H / 請假 {sessionStats.totalLeaveHours}H
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#F0F4F7] flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    點名資料與佐證文件即時同步中
                  </span>
                  <button
                    onClick={() => setInspectSession(session)}
                    className="px-3 py-1.5 bg-[#536B7A] hover:bg-[#455865] text-white rounded-md text-xs font-semibold transition-colors inline-flex items-center space-x-1 shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>查看點名表與佐證</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inspect Attendance Sheet Modal */}
      {inspectSession && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-[#DCE2E6] my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F7]">
              <div>
                <h2 className="text-base font-bold text-[#26313B] flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>{inspectSession.className} • 點名表與事由稽核</span>
                </h2>
                <div className="text-xs text-[#66717C] mt-0.5">
                  日期：{inspectSession.date} • 授課教師：{inspectSession.teacherName} 老師 ({inspectSession.classroom})
                </div>
              </div>
              <button
                onClick={() => setInspectSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">學員</th>
                    <th className="py-2.5 px-3 text-center">第 1 節</th>
                    <th className="py-2.5 px-3 text-center">第 2 節</th>
                    {(inspectSession.periodsCount || 3) >= 3 && (
                      <th className="py-2.5 px-3 text-center">第 3 節</th>
                    )}
                    <th className="py-2.5 px-3 text-left">點名備註事由</th>
                    <th className="py-2.5 px-3 text-center">佐證照片</th>
                    <th className="py-2.5 px-3 text-right">當日折算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {students
                    .filter((s) => (inspectSession.studentIds || []).includes(s.id) || (inspectSession.className && s.className === inspectSession.className))
                    .map((student) => {
                      const att = inspectSession.attendanceData?.[student.id] || {
                        period1: 'present',
                        period2: 'present',
                        period3: (inspectSession.periodsCount || 3) >= 3 ? 'present' : undefined,
                      };

                      const renderBadge = (status?: string) => {
                        if (status === 'present')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">出席</span>;
                        if (status === 'leave')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">請假</span>;
                        if (status === 'absent')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">缺席</span>;
                        return <span className="text-slate-300">-</span>;
                      };

                      return (
                        <tr key={student.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center space-x-2">
                              <StudentAvatar 
                                avatarUrl={student.avatarUrl} 
                                name={student.name} 
                                sizeClassName="w-7 h-7" 
                              />
                              <div>
                                <div className="font-bold text-[#26313B]">{student.name}</div>
                                <div className="text-[10px] text-[#66717C] font-mono">{student.studentNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period1)}</td>
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period2)}</td>
                          {(inspectSession.periodsCount || 3) >= 3 && (
                            <td className="py-2.5 px-3 text-center">{renderBadge(att.period3)}</td>
                          )}

                          {/* Remarks */}
                          <td className="py-2.5 px-3">
                            {att.remarks ? (
                              <span className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block max-w-[150px] truncate" title={att.remarks}>
                                {att.remarks}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Evidence Image */}
                          <td className="py-2.5 px-3 text-center">
                            {att.evidenceImageUrl ? (
                              <a
                                href={att.evidenceImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-[11px] font-medium"
                                title="點擊檢視佐證照片"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                                <span>佐證圖</span>
                                <ExternalLink className="w-3 h-3 text-teal-500" />
                              </a>
                            ) : (
                              <span className="text-slate-300 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Earned Hours / Ratio */}
                          <td className="py-2.5 px-3 text-right font-bold text-[#26313B] font-mono">
                            {(() => {
                              const periods = [att.period1, att.period2];
                              if ((inspectSession.periodsCount || 3) >= 3) periods.push(att.period3);
                              let sessionEarned = 0;
                              let sessionTotal = 0;
                              periods.forEach((p) => {
                                if (p) {
                                  sessionTotal += 1;
                                  if (p.toLowerCase() === 'present') sessionEarned += 1.0;
                                  else if (p.toLowerCase() === 'leave') sessionEarned += 0.5;
                                }
                              });
                              return sessionTotal > 0 ? `${Math.round((sessionEarned / sessionTotal) * 100)}%` : '—';
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-[#F0F4F7] flex items-center justify-between text-xs">
              <span className="text-[#66717C] text-[11px]">
                計分規則：每節出席 100% • 請假 50% • 缺席 0%
              </span>
              <button
                onClick={() => setInspectSession(null)}
                className="px-4 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] border border-[#DCE2E6] rounded-xl font-semibold transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
