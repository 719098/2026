import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Search, 
  BookOpen, 
  MapPin, 
  Clock, 
  UserCheck, 
  AlertTriangle, 
  Award,
  Sparkles,
  Download,
  Eye,
  BarChart3,
  GraduationCap, 
  Mail, 
  Phone, 
  CheckCircle2,
  Globe,
  Building2,
  Calendar
} from 'lucide-react';
import { Student, Teacher, CourseSession, StudentGrade, ClassEntity } from '../types';
import { calculateStudentAttendanceHistory } from '../utils/attendanceUtils';
import { StudentAvatar } from './StudentAvatar';

interface ClassesViewProps {
  currentTeacher?: Teacher | null;
  allCourses: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  onSelectStudentForDetail: (student: Student) => void;
  classes?: ClassEntity[];
  allStudentsList?: Student[];
}

export const ClassesView: React.FC<ClassesViewProps> = ({
  currentTeacher,
  allCourses,
  allGrades,
  onSelectStudentForDetail,
  classes = [],
  allStudentsList = []
}) => {
  // Filter classes for current teacher or assigned classes
  const teacherClasses = useMemo(() => {
    if (!classes || classes.length === 0) return [];
    const assignedNames = new Set(currentTeacher?.assignedClasses || []);
    return classes.filter(c => 
      c.teacherId === currentTeacher?.id || 
      c.teacher === currentTeacher?.name || 
      assignedNames.has(c.className) || 
      assignedNames.has(c.name)
    );
  }, [classes, currentTeacher]);

  const activeClasses = teacherClasses.length > 0 ? teacherClasses : classes;

  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    if (activeClasses && activeClasses.length > 0 && !activeClasses.some(c => c && c.id === selectedClassId)) {
      if (activeClasses[0]?.id) {
        setSelectedClassId(activeClasses[0].id);
      }
    }
  }, [activeClasses, selectedClassId]);

  const selectedClassObj = useMemo(() => {
    if (!activeClasses || activeClasses.length === 0) return null;
    return activeClasses.find(c => c && c.id === selectedClassId) || activeClasses[0] || null;
  }, [activeClasses, selectedClassId]);

  const students = useMemo(() => {
    if (!selectedClassObj) return [];
    return allStudentsList.filter(s => 
      s.classId === selectedClassObj.id || 
      s.className === selectedClassObj.className || 
      s.className === selectedClassObj.name
    );
  }, [allStudentsList, selectedClassObj]);

  const [searchQuery, setSearchQuery] = useState('');

  // Filter students
  const filteredStudents = students.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.englishName.toLowerCase().includes(q) ||
      s.studentNumber.toLowerCase().includes(q) ||
      (s.nationality && s.nationality.toLowerCase().includes(q))
    );
  });

  const averageAttendance = students.length > 0
    ? Math.round((students.reduce((acc, s) => acc + (s.overallAttendanceRate || 100), 0) / students.length) * 10) / 10
    : 100;

  return (
    <div className="space-y-6 pb-20">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>個別學生出席統計 • {currentTeacher?.name || ''} 老師</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              班級學生名冊與個人出缺席統計
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              可依班級查看個別學生【應到 / 出席 / 請假 / 缺席 / 出席率】統計，點擊任一學生即可進入個人出席紀錄與成績詳細頁。
            </p>
          </div>

          {/* Class Switcher Tabs */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 overflow-x-auto">
            {activeClasses.map((cls) => {
              const clsStudentsCount = allStudentsList.filter(s => s.classId === cls.id || s.className === cls.className || s.className === cls.name).length;
              return (
                <button
                  key={cls.id}
                  id={`btn-select-class-${cls.id}`}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    selectedClassObj?.id === cls.id
                      ? 'bg-white text-teal-900 shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cls.className || cls.name} ({clsStudentsCount}人)
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Class Info Card */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">班級教材與教室</span>
            <div className="text-sm font-extrabold text-slate-900 mt-1 flex items-center">
              <BookOpen className="w-4 h-4 mr-1.5 text-teal-600 shrink-0" />
              <span className="truncate">{selectedClassObj?.textbook || '標準教材'}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
              <span>{selectedClassObj?.classroom || '華語中心'}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">上課時段與制別</span>
            <div className="text-sm font-extrabold text-slate-900 mt-1 font-mono">
              {selectedClassObj?.timeSlot || '09:00 - 12:00'}
            </div>
            <span className="inline-block text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded mt-1">
              {selectedClassObj?.dailyHours || 3} 小時制 / 每日 {selectedClassObj?.dailyHours || 3} 節課
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">班級學生人數</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {students.length} <span className="text-xs font-normal text-slate-500">人</span>
            </div>
            <span className="text-xs text-slate-500">學季目標 {selectedClassObj?.totalTargetHours || 0} 小時</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">班級平均出席率</span>
            <div className="text-2xl font-black text-teal-700 mt-1 font-mono">
              {averageAttendance}%
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-teal-600 h-1.5 rounded-full"
                style={{ width: `${averageAttendance}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Search Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
            <Users className="w-4 h-4 text-teal-600" />
            <span>【{selectedClassObj?.className || selectedClassObj?.name}】個別學生出席名冊 ({filteredStudents.length} 人)</span>
          </div>

          <div className="w-full sm:w-72">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜尋學生姓名 / 學號 / 國籍..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4 min-w-[200px]">學生姓名 / 學號</th>
                <th className="py-3 px-3 text-center min-w-[90px]">國籍</th>
                <th className="py-3 px-3 text-center min-w-[90px]">應到時數</th>
                <th className="py-3 px-3 text-center min-w-[90px] text-emerald-700">出席時數</th>
                <th className="py-3 px-3 text-center min-w-[90px] text-blue-700">請假時數</th>
                <th className="py-3 px-3 text-center min-w-[90px] text-rose-700">缺席時數</th>
                <th className="py-3 px-4 text-center min-w-[120px]">出席率</th>
                <th className="py-3 px-3 text-center min-w-[90px]">出席警示</th>
                <th className="py-3 px-4 text-center w-24">個人紀錄</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.map((student, index) => {
                const history = calculateStudentAttendanceHistory(student, allCourses);
                const isWarning = history.attendanceRate < 90 && history.attendanceRate >= 80;
                const isDanger = history.attendanceRate < 80;

                return (
                  <tr
                    key={student.id}
                    id={`student-stats-row-${student.id}`}
                    onClick={() => onSelectStudentForDetail(student)}
                    className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                  >
                    {/* Index */}
                    <td className="py-3 px-4 text-center font-mono text-slate-400 font-semibold">
                      {index + 1}
                    </td>

                    {/* Student Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <StudentAvatar 
                          avatarUrl={student.avatarUrl} 
                          name={student.name} 
                          sizeClassName="w-10 h-10" 
                          className="group-hover:ring-2 group-hover:ring-teal-500 transition-all"
                        />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-extrabold text-slate-900 text-sm group-hover:text-teal-700 transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {student.englishName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono">{student.studentNumber}</span>
                            <span>•</span>
                            <span>{student.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Nationality */}
                    <td className="py-3 px-3 text-center">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {student.nationality}
                      </span>
                    </td>

                    {/* 應到時數 */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                      {history.requiredHours}H
                    </td>

                    {/* 出席時數 */}
                    <td className="py-3 px-3 text-center font-mono font-extrabold text-emerald-700 bg-emerald-50/40">
                      {history.presentHours}H
                    </td>

                    {/* 請假時數 */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-blue-700">
                      {history.leaveHours}H
                    </td>

                    {/* 缺席時數 */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-700">
                      {history.absentHours > 0 ? `${history.absentHours}H` : '-'}
                    </td>

                    {/* 出席率 */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`font-mono font-black text-sm ${
                          isDanger ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-emerald-700'
                        }`}>
                          {history.attendanceRate}%
                        </span>
                        <div className="w-16 bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                          <div
                            className={`h-1 rounded-full ${
                              isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, history.attendanceRate)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    {/* 出席警示 */}
                    <td className="py-3 px-3 text-center">
                      {isDanger ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          ⚠️ 出席危險
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          接近預警線
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          🟢 正常
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStudentForDetail(student);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-teal-600 text-slate-700 hover:text-white border border-slate-300 hover:border-teal-600 rounded-lg text-[11px] font-bold transition-all shadow-2xs mx-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>詳細紀錄</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
