import React, { useState } from 'react';
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
  CheckCircle
} from 'lucide-react';
import { CourseSession, Student, ClassEntity, StudentPeriodAttendance } from '../../types';
import { TODAY_DATE } from '../../utils/quarterScheduler';
import { formatDateFull } from '../../utils/dateUtils';

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
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_DATE);
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  // Inspect Modal
  const [inspectSession, setInspectSession] = useState<CourseSession | null>(null);

  // Courses on selected date
  const dateCourses = allCourses.filter((c) => {
    const matchDate = c.date === selectedDate;
    const matchClass = selectedClassId === 'ALL' || c.className.includes(selectedClassId);
    return matchDate && matchClass;
  });

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
            行政端具備全校所有班級、所有日期的點名檢視與稽核權限（教師端僅可操作個人班級）。
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
            onClick={() => setSelectedDate(TODAY_DATE)}
            className="px-3 py-2 bg-[#536B7A] hover:bg-[#455865] text-white font-semibold rounded-lg text-xs transition-colors shadow-2xs"
          >
            今日 ({TODAY_DATE.slice(5)})
          </button>
        </div>
      </div>

      {/* Class Filter Badges */}
      <div className="bg-white p-3 rounded-xl border border-[#DCE2E6] shadow-2xs flex items-center space-x-2 overflow-x-auto">
        <span className="text-xs font-semibold text-[#66717C] shrink-0">班級：</span>
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
            {selectedDate} 本日全校無排定課程或為國定假日／公休日
          </div>
        ) : (
          dateCourses.map((session) => {
            const isCompleted = session.status === 'completed';
            const enrolledStudents = students.filter(
              (s) => session.studentIds.includes(s.id) || s.className === session.className
            );

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
                        已完成點名
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
                    <div className="text-[#66717C] text-[11px]">
                      在班應到學生：{enrolledStudents.length} 人 • 當日授課節數：{session.periodsCount} 節 (
                      {session.periodsCount} 小時)
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#F0F4F7] flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    點名紀錄即時維護於系統中
                  </span>
                  <button
                    onClick={() => setInspectSession(session)}
                    className="px-3 py-1.5 bg-[#536B7A] hover:bg-[#455865] text-white rounded-md text-xs font-semibold transition-colors inline-flex items-center space-x-1 shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>查看點名表</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inspect Attendance Sheet Modal */}
      {inspectSession && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl border border-[#DCE2E6] my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F7]">
              <div>
                <h2 className="text-base font-bold text-[#26313B] flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>{inspectSession.className} • 點名簿明細</span>
                </h2>
                <div className="text-xs text-[#66717C] mt-0.5">
                  日期：{inspectSession.date} • 授課教師：{inspectSession.teacherName} 老師 ({inspectSession.classroom})
                </div>
              </div>
              <button
                onClick={() => setInspectSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">學號 / 姓名</th>
                    <th className="py-2.5 px-3 text-center">第 1 節</th>
                    <th className="py-2.5 px-3 text-center">第 2 節</th>
                    {inspectSession.periodsCount === 3 && (
                      <th className="py-2.5 px-3 text-center">第 3 節</th>
                    )}
                    <th className="py-2.5 px-3 text-right">當日折算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {students
                    .filter((s) => inspectSession.studentIds.includes(s.id) || s.className === inspectSession.className)
                    .map((student) => {
                      const att = inspectSession.attendanceData?.[student.id] || {
                        period1: 'present',
                        period2: 'present',
                        period3: inspectSession.periodsCount === 3 ? 'present' : undefined,
                      };

                      const renderBadge = (status?: string) => {
                        if (status === 'present')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">出席</span>;
                        if (status === 'leave')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">請假 (50%)</span>;
                        if (status === 'absent')
                          return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">缺席 (0%)</span>;
                        return <span className="text-slate-300">-</span>;
                      };

                      return (
                        <tr key={student.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-[#26313B]">{student.name}</div>
                            <div className="text-[10px] text-[#66717C] font-mono">{student.studentNumber} • {student.englishName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period1)}</td>
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period2)}</td>
                          {inspectSession.periodsCount === 3 && (
                            <td className="py-2.5 px-3 text-center">{renderBadge(att.period3)}</td>
                          )}
                          <td className="py-2.5 px-3 text-right font-bold text-[#26313B] font-mono">
                            100%
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
                className="px-4 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] border border-[#DCE2E6] rounded-md font-semibold"
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
