import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  MapPin, 
  Search, 
  GraduationCap, 
  Mail, 
  Phone, 
  AlertTriangle,
  CheckCircle2,
  Globe,
  Building2,
  Eye,
  Calendar,
  Clock,
  Award
} from 'lucide-react';
import { 
  STUDENTS_LEVEL1, 
  STUDENTS_LEVEL2, 
  STUDENTS_LEVEL3,
  STUDENTS_CHEN_CONVERSATION,
  STUDENTS_CHEN_BUSINESS,
  STUDENTS_CHEN_CULTURE
} from '../data/mockData';
import { Student, Teacher, CourseSession, StudentGrade } from '../types';
import { calculateStudentAttendanceHistory } from '../utils/attendanceUtils';

interface ClassesViewProps {
  currentTeacher: Teacher;
  allCourses: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  onSelectStudentForDetail: (student: Student) => void;
}

interface ClassDetail {
  students: Student[];
  textbook: string;
  classroom: string;
  timeSlot: string;
  dailyHours: number;
  description: string;
}

export const ClassesView: React.FC<ClassesViewProps> = ({
  currentTeacher,
  allCourses,
  allGrades,
  onSelectStudentForDetail,
}) => {
  const isChenTeacher = currentTeacher.name === '陳靜宜';

  const classDataLin: Record<string, ClassDetail> = {
    '初級華語一': {
      students: STUDENTS_LEVEL1,
      textbook: '《當代中文課程》第一冊',
      classroom: '博愛大樓 302 教室',
      timeSlot: '每週一至週五 09:00 - 12:00',
      dailyHours: 3,
      description: '零起點至 A2 基礎級華語班，重視生活實用對話、聲調發音與漢字筆順。',
    },
    '中級華語二': {
      students: STUDENTS_LEVEL2,
      textbook: '《當代中文課程》第二冊',
      classroom: '博愛大樓 405 教室',
      timeSlot: '每週一至週五 13:30 - 16:30',
      dailyHours: 3,
      description: 'B1 進階級華語班，著重成語語法、短篇閱讀、在地文化與專題口頭報告。',
    },
    '高級華語三': {
      students: STUDENTS_LEVEL3,
      textbook: '《新版實用視聽華語》第三冊',
      classroom: '博愛大樓 201 教室',
      timeSlot: '每週一至週五 18:30 - 20:30',
      dailyHours: 2, // 2-Hour Class!
      description: 'B2-C1 高階密集班（2小時制），著重即時新聞選讀、學術寫作與商務華語會話。',
    },
  };

  const classDataChen: Record<string, ClassDetail> = {
    '生活會話一班': {
      students: STUDENTS_CHEN_CONVERSATION,
      textbook: '《實用生活華語會話》第一冊',
      classroom: '綜合大樓 308 教室',
      timeSlot: '每週一至週五 09:00 - 12:00',
      dailyHours: 3,
      description: '生活實用語音情境會話班，著重台灣夜市購物、問路交通、看病租屋等日常表達。',
    },
    '商務華語實務': {
      students: STUDENTS_CHEN_BUSINESS,
      textbook: '《實用商務華語》第二冊',
      classroom: '綜合大樓 502 教室',
      timeSlot: '每週一至週五 13:00 - 16:00',
      dailyHours: 3,
      description: 'B2 級商務華語專班，著重商務電郵寫作、商務簡報演練、合約洽談與跨文化禮儀。',
    },
    '台灣文化與影視欣賞': {
      students: STUDENTS_CHEN_CULTURE,
      textbook: '《台灣影視文化專題》',
      classroom: '博愛大樓 203 教室',
      timeSlot: '每週一至週五 18:30 - 20:30',
      dailyHours: 2, // 2-Hour Class!
      description: 'C1 高階文化專題班（2小時制），透過台灣經典電影、紀錄片觀摩與在地風俗探討華語深層文化。',
    },
  };

  const currentClassData: Record<string, ClassDetail> = isChenTeacher ? classDataChen : classDataLin;
  const classNames = Object.keys(currentClassData);

  const [selectedClass, setSelectedClass] = useState<string>(classNames[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset selected class if teacher changes
  useEffect(() => {
    setSelectedClass(classNames[0]);
  }, [currentTeacher.id]);

  const currentClassInfo: ClassDetail = currentClassData[selectedClass] || currentClassData[classNames[0]];
  const students = currentClassInfo.students;

  // Filter students
  const filteredStudents = students.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.englishName.toLowerCase().includes(q) ||
      s.studentNumber.toLowerCase().includes(q) ||
      s.nationality.toLowerCase().includes(q)
    );
  });

  const averageAttendance = Math.round(
    (students.reduce((acc, s) => acc + s.overallAttendanceRate, 0) / students.length) * 10
  ) / 10;

  return (
    <div className="space-y-6 pb-20">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>個別學生出席統計 • {currentTeacher.name} 老師</span>
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
            {classNames.map((cls) => {
              const clsObj = currentClassData[cls as keyof typeof currentClassData];
              return (
                <button
                  key={cls}
                  id={`btn-select-class-${cls}`}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    selectedClass === cls
                      ? 'bg-white text-teal-900 shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cls} ({clsObj.students.length}人)
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
              <span className="truncate">{currentClassInfo.textbook}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
              <span>{currentClassInfo.classroom}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">上課時段與制別</span>
            <div className="text-sm font-extrabold text-slate-900 mt-1 font-mono">
              {currentClassInfo.timeSlot}
            </div>
            <span className="inline-block text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded mt-1">
              {currentClassInfo.dailyHours} 小時制 / 每日 {currentClassInfo.dailyHours} 節課
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">班級學生人數</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {students.length} <span className="text-xs font-normal text-slate-500">人</span>
            </div>
            <span className="text-xs text-slate-500">學季目標 165 小時</span>
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
            <span>【{selectedClass}】個別學生出席名冊 ({filteredStudents.length} 人)</span>
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
                <th className="py-3 px-3 text-center min-w-[90px]">簽證警示</th>
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
                        <img
                          src={student.avatarUrl}
                          alt={student.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0 group-hover:ring-2 group-hover:ring-teal-500 transition-all"
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

                    {/* 簽證警示 */}
                    <td className="py-3 px-3 text-center">
                      {isDanger ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          ⚠️ 簽證危險
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
