import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar, NavigationTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DateNavigator } from './components/DateNavigator';
import { DashboardStats } from './components/DashboardStats';
import { LeaveNoticeBanner } from './components/LeaveNoticeBanner';
import { PendingMakeupAlert } from './components/PendingMakeupAlert';
import { CourseCard } from './components/CourseCard';
import { AttendanceSheet } from './components/AttendanceSheet';
import { RescheduleScheduleView } from './components/RescheduleScheduleView';
import { ClassesView } from './components/ClassesView';
import { AttendanceHistoryView } from './components/AttendanceHistoryView';
import { AttendanceStatsView } from './components/AttendanceStatsView';
import { GradeManagementView } from './components/GradeManagementView';
import { StudentDetailModal } from './components/StudentDetailModal';
import { ToastNotification, ToastItem } from './components/ToastNotification';

import { CourseSession, StudentPeriodAttendance, Teacher, Student, StudentGrade } from './types';
import { 
  ALL_STUDENTS_MAP, 
  MOCK_LEAVE_RECORDS,
  TEACHERS,
  TEACHER_LIN,
  STUDENTS_LEVEL1,
  STUDENTS_LEVEL2,
  STUDENTS_LEVEL3,
  STUDENTS_CHEN_CONVERSATION,
  STUDENTS_CHEN_BUSINESS,
  STUDENTS_CHEN_CULTURE
} from './data/mockData';
import { generateDateStrip, formatDateFull } from './utils/dateUtils';
import { generateFullQuarterCourses, TODAY_DATE } from './utils/quarterScheduler';
import { generateAllInitialGrades } from './utils/gradeUtils';
import { 
  Coffee, 
  CalendarX2, 
  Sparkles, 
  CheckCircle2, 
  BookOpen,
  ArrowRight
} from 'lucide-react';

const STORAGE_COURSES_KEY = 'clc_quarter_courses_v5';
const STORAGE_GRADES_KEY = 'clc_quarter_grades_v5';

export default function App() {
  // Current active teacher
  const [currentTeacher, setCurrentTeacher] = useState<Teacher>(TEACHER_LIN);

  // Navigation active tab
  const [activeTab, setActiveTab] = useState<NavigationTab>('today');

  // Active selected date (Anchor: 2026-08-11)
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_DATE);

  // Selected student for detail popup modal
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);

  // Active attendance session being taken (null if in dashboard)
  const [activeAttendanceCourse, setActiveAttendanceCourse] = useState<CourseSession | null>(null);
  const [isReadOnlyAttendance, setIsReadOnlyAttendance] = useState<boolean>(false);

  // Selected class for Grade Management tab
  const [gradeSelectedClass, setGradeSelectedClass] = useState<string>('初級華語一');

  // Ensure gradeSelectedClass always matches the currentTeacher's assignedClasses
  useEffect(() => {
    if (currentTeacher.assignedClasses && currentTeacher.assignedClasses.length > 0) {
      if (!currentTeacher.assignedClasses.includes(gradeSelectedClass)) {
        setGradeSelectedClass(currentTeacher.assignedClasses[0]);
      }
    }
  }, [currentTeacher, gradeSelectedClass]);

  // Persistent Full Quarter Courses state
  const [courses, setCourses] = useState<CourseSession[]>(() => {
    const saved = localStorage.getItem(STORAGE_COURSES_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved courses', e);
      }
    }
    return generateFullQuarterCourses();
  });

  // Persistent Grades state
  const [allGrades, setAllGrades] = useState<Record<string, StudentGrade>>(() => {
    const saved = localStorage.getItem(STORAGE_GRADES_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved grades', e);
      }
    }
    return generateAllInitialGrades();
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_COURSES_KEY, JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_GRADES_KEY, JSON.stringify(allGrades));
  }, [allGrades]);

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleCloseToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Reset full quarter demo data handler
  const handleResetData = () => {
    const newCourses = generateFullQuarterCourses();
    const newGrades = generateAllInitialGrades();
    setCourses(newCourses);
    setAllGrades(newGrades);
    localStorage.setItem(STORAGE_COURSES_KEY, JSON.stringify(newCourses));
    localStorage.setItem(STORAGE_GRADES_KEY, JSON.stringify(newGrades));
    setSelectedDate(TODAY_DATE);
    setActiveAttendanceCourse(null);
    setSelectedStudentForDetail(null);
    showToast('✨ 全季 165 小時排程與成績數據已重置為官方初始狀態！', 'success');
  };

  // Teacher switcher
  const handleSelectTeacher = (teacher: Teacher) => {
    setCurrentTeacher(teacher);
    setActiveAttendanceCourse(null);
    setSelectedStudentForDetail(null);
    setGradeSelectedClass(teacher.assignedClasses[0] || '初級華語一');
    showToast(`已切換為 ${teacher.name} 老師（${teacher.department}）！`, 'info');
  };

  // Courses filtered for the current active teacher
  const teacherCourses = useMemo(() => {
    return courses.filter(
      (c) => !c.teacherId || c.teacherId === currentTeacher.id || c.teacherName === currentTeacher.name
    );
  }, [courses, currentTeacher]);

  // Day summaries for date navigator strip (Full quarter: 2026-07-01 to 2026-10-31)
  const daySummaries = useMemo(() => {
    return generateDateStrip('2026-07-01', '2026-10-31', teacherCourses, selectedDate);
  }, [teacherCourses, selectedDate]);

  // Current day's courses
  const currentDayCourses = useMemo(() => {
    return teacherCourses.filter((c) => c.date === selectedDate);
  }, [teacherCourses, selectedDate]);

  // Current day's approved leaves for this teacher's classes
  const currentDayLeaves = useMemo(() => {
    const teacherClassNames = new Set(teacherCourses.map((c) => c.className));
    return MOCK_LEAVE_RECORDS.filter(
      (l) => l.date === selectedDate && teacherClassNames.has(l.className)
    );
  }, [selectedDate, teacherCourses]);

  // Pending makeup courses from past week (within 7 days of TODAY_DATE = 2026-08-11)
  const pendingMakeupCourses = useMemo(() => {
    return teacherCourses.filter(
      (c) =>
        c.date < TODAY_DATE &&
        c.date >= '2026-08-04' &&
        c.status === 'unmarked' &&
        !c.isLocked
    );
  }, [teacherCourses]);

  // Pending attendance count for today
  const pendingCountForHeader = useMemo(() => {
    return currentDayCourses.filter((c) => c.status === 'unmarked' || c.status === 'in_progress').length;
  }, [currentDayCourses]);

  // Handler: Start Attendance
  const handleStartAttendance = (course: CourseSession) => {
    setIsReadOnlyAttendance(false);
    setActiveAttendanceCourse(course);
  };

  // Handler: View Attendance (Read-only or edit)
  const handleViewRecord = (course: CourseSession) => {
    setIsReadOnlyAttendance(false);
    setActiveAttendanceCourse(course);
  };

  // Handler: Save Attendance
  const handleSaveAttendance = (
    courseId: string,
    attendanceData: { [studentId: string]: StudentPeriodAttendance },
    targetStatus: 'in_progress' | 'completed'
  ) => {
    setCourses((prevCourses) => {
      return prevCourses.map((c) => {
        if (c.id === courseId) {
          const now = new Date();
          const timeStr = `${selectedDate} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          return {
            ...c,
            status: targetStatus,
            attendanceData,
            lastUpdated: timeStr,
          };
        }
        return c;
      });
    });

    setActiveAttendanceCourse(null);
  };

  // Handler: Jump to target date (e.g. from rescheduled 07/30 to 07/31)
  const handleJumpToTargetDate = (targetDate: string) => {
    setSelectedDate(targetDate);
    showToast(`已跳轉至 ${targetDate} 補課日程`, 'info');
  };

  // Resolve students list for active course
  const activeCourseStudents = useMemo(() => {
    if (!activeAttendanceCourse) return [];
    return activeAttendanceCourse.studentIds
      .map((id) => ALL_STUDENTS_MAP[id])
      .filter(Boolean);
  }, [activeAttendanceCourse]);

  // All students for current teacher
  const currentTeacherStudents = useMemo(() => {
    if (currentTeacher.name === '陳靜宜') {
      return [...STUDENTS_CHEN_CONVERSATION, ...STUDENTS_CHEN_BUSINESS, ...STUDENTS_CHEN_CULTURE];
    }
    return [...STUDENTS_LEVEL1, ...STUDENTS_LEVEL2, ...STUDENTS_LEVEL3];
  }, [currentTeacher]);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans antialiased overflow-hidden">
      {/* Toast notifications */}
      <ToastNotification toasts={toasts} onClose={handleCloseToast} />

      {/* Student Personal Detail Modal */}
      {selectedStudentForDetail && (
        <StudentDetailModal
          student={selectedStudentForDetail}
          allCourses={courses}
          grade={allGrades[selectedStudentForDetail.id]}
          teacherName={`${currentTeacher.name}老師`}
          onClose={() => setSelectedStudentForDetail(null)}
        />
      )}

      {/* Fixed Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveAttendanceCourse(null);
        }}
        onResetData={handleResetData}
        pendingAttendanceCount={pendingCountForHeader}
        currentTeacher={currentTeacher}
        teachers={TEACHERS}
        onSelectTeacher={handleSelectTeacher}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <Header
          title={
            activeTab === 'today'
              ? '今日點名與日程'
              : activeTab === 'grades'
              ? '學生成績管理'
              : activeTab === 'classes'
              ? '個別學生出席統計'
              : activeTab === 'schedule'
              ? '全季課程排程與調課'
              : activeTab === 'history'
              ? '點名歷史總覽'
              : '出席率統計與簽證預警'
          }
          subtitle={
            activeTab === 'today'
              ? `國立華語教學中心 • 2026 夏季班 (165小時制) • ${formatDateFull(selectedDate)}`
              : '國立華語教學中心 (CLC) 教師端點名與成績管理系統'
          }
          selectedDate={selectedDate}
          onJumpToDate={(date) => {
            setSelectedDate(date);
            setActiveTab('today');
            setActiveAttendanceCourse(null);
          }}
          pendingAttendanceCount={pendingCountForHeader}
          currentTeacher={currentTeacher}
          teachers={TEACHERS}
          onSelectTeacher={handleSelectTeacher}
        />

        {/* Content Container */}
        <main className="p-6 max-w-7xl w-full mx-auto flex-1">
          {activeAttendanceCourse ? (
            /* Attendance Sheet Component (2-Hour vs 3-Hour Dynamic) */
            <AttendanceSheet
              course={activeAttendanceCourse}
              students={activeCourseStudents}
              leaveRecords={MOCK_LEAVE_RECORDS}
              onSave={handleSaveAttendance}
              onBack={() => setActiveAttendanceCourse(null)}
              onShowToast={showToast}
              isReadOnly={isReadOnlyAttendance}
            />
          ) : activeTab === 'today' ? (
            /* 1. Homepage / Today's Attendance Dashboard */
            <div>
              {/* Date Navigation & Calendar Strip */}
              <DateNavigator
                selectedDate={selectedDate}
                onSelectDate={(date) => setSelectedDate(date)}
                daySummaries={daySummaries}
              />

              {/* 4 Dashboard Stats Cards */}
              <DashboardStats
                courses={currentDayCourses}
                todayLeaves={currentDayLeaves}
              />

              {/* Leave Notice Banner if students have approved leaves today */}
              <LeaveNoticeBanner leaves={currentDayLeaves} />

              {/* Pending Makeup Alert if past courses within 7 days need attention */}
              {selectedDate === TODAY_DATE && (
                <PendingMakeupAlert
                  pendingCourses={pendingMakeupCourses}
                  onSelectCourseDate={(date) => setSelectedDate(date)}
                />
              )}

              {/* Course List Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-slate-800">
                    當日課程列表
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    共 {currentDayCourses.length} 堂課
                  </span>
                </div>

                <div className="text-xs text-slate-500 hidden sm:block">
                  ※ 點擊「<strong>開始點名</strong>」或「<strong>補做點名</strong>」進入分節點名表
                </div>
              </div>

              {/* Course Cards List */}
              {currentDayCourses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <CalendarX2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">本日無排定授課堂次</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    此日期為週末公休日、國定假日或無課程安排。您可點擊上方日期導覽切換至其他上課日。
                  </p>
                  <button
                    onClick={() => setSelectedDate(TODAY_DATE)}
                    className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center space-x-1.5"
                  >
                    <span>返回今日 ({TODAY_DATE.slice(5)})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentDayCourses.map((course) => {
                    const studentList = course.studentIds
                      .map((id) => ALL_STUDENTS_MAP[id])
                      .filter(Boolean);

                    return (
                      <CourseCard
                        key={course.id}
                        course={course}
                        students={studentList}
                        onStartAttendance={handleStartAttendance}
                        onViewRecord={handleViewRecord}
                        onJumpToTargetDate={handleJumpToTargetDate}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'grades' ? (
            /* 2. Grade Management View (佔比 100% / Auto Attendance Score) */
            <GradeManagementView
              students={currentTeacherStudents}
              allCourses={courses}
              allGrades={allGrades}
              onUpdateGrades={(updated) => setAllGrades(updated)}
              onSelectStudentForDetail={(student) => setSelectedStudentForDetail(student)}
              onShowToast={showToast}
              currentClassName={gradeSelectedClass}
              onSelectClass={(cls) => setGradeSelectedClass(cls)}
              availableClasses={currentTeacher.assignedClasses}
            />
          ) : activeTab === 'classes' ? (
            /* 3. Individual Student Attendance Stats & Roster */
            <ClassesView
              currentTeacher={currentTeacher}
              allCourses={courses}
              allGrades={allGrades}
              onSelectStudentForDetail={(student) => setSelectedStudentForDetail(student)}
            />
          ) : activeTab === 'schedule' ? (
            /* 4. Full Quarter Schedule & Reschedule Tracker */
            <RescheduleScheduleView
              courses={teacherCourses}
              daySummaries={daySummaries}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setActiveTab('today');
              }}
              onStartAttendance={(c) => {
                setActiveAttendanceCourse(c);
              }}
            />
          ) : activeTab === 'history' ? (
            /* 5. Attendance History */
            <AttendanceHistoryView
              courses={courses}
              onOpenAttendance={(c) => {
                setSelectedDate(c.date);
                setActiveAttendanceCourse(c);
              }}
              onShowToast={showToast}
              currentTeacher={currentTeacher}
            />
          ) : (
            /* 6. Attendance Stats & Visa Warnings */
            <AttendanceStatsView
              onShowToast={showToast}
              currentTeacher={currentTeacher}
            />
          )}
        </main>
      </div>
    </div>
  );
}
