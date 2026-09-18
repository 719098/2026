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
import { AdminLoginView } from './components/AdminLoginView';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { 
  fetchStudentsFromSupabase, 
  createStudentInSupabase, 
  updateStudentInSupabase, 
  deleteStudentInSupabase,
  fetchStudentGradesFromSupabase,
  saveStudentGradeToSupabase,
  fetchTransferRecordsFromSupabase,
  createTransferRecordInSupabase
} from './lib/studentService';
import {
  fetchClassesFromSupabase,
  createClassInSupabase,
  updateClassInSupabase,
  toggleClassStatusInSupabase,
  deleteClassInSupabase
} from './lib/classService';
import {
  fetchTermsFromSupabase,
  createTermInSupabase,
  updateTermInSupabase,
  toggleTermActiveInSupabase,
  toggleTermLockInSupabase,
  deleteTermFromSupabase
} from './lib/termService';
import {
  fetchTeachersFromSupabase,
  createTeacherInSupabase,
  updateTeacherInSupabase,
  deleteTeacherInSupabase,
  toggleTeacherStatusInSupabase,
  updateTeacherClassAssignmentsInSupabase,
  mapDbToTeacher,
  fetchTeacherWithClassesByProfileId
} from './lib/teacherService';
import {
  fetchCourseSessionsFromSupabase
} from './lib/scheduleService';
import {
  saveAttendanceToSupabase,
  fetchLeavesFromSupabase,
  createLeaveInSupabase,
  updateLeaveStatusInSupabase
} from './lib/attendanceService';

// Admin Components
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { AdminStudentManagementView } from './components/admin/AdminStudentManagementView';
import { AdminClassAssignmentView } from './components/admin/AdminClassAssignmentView';
import { AdminMaterialManagementView } from './components/admin/AdminMaterialManagementView';
import { AdminTermManagementView } from './components/admin/AdminTermManagementView';
import { AdminClassManagementView } from './components/admin/AdminClassManagementView';
import { AdminTeacherManagementView } from './components/admin/AdminTeacherManagementView';
import { AdminScheduleManagementView } from './components/admin/AdminScheduleManagementView';
import { AdminAttendanceManagementView } from './components/admin/AdminAttendanceManagementView';
import { AdminGradesManagementView } from './components/admin/AdminGradesManagementView';
import { AdminReportsView } from './components/admin/AdminReportsView';

import { 
  CourseSession, 
  StudentPeriodAttendance, 
  Teacher, 
  Student, 
  StudentGrade,
  UserRole,
  UserProfile,
  AdminNavigationTab,
  ClassEntity,
  Term,
  TransferClassRecord,
  LeaveRecord
} from './types';
const DEFAULT_TEACHER: Teacher = {
  id: 'T-001',
  name: '林明學',
  title: '高級華語講師',
  email: 'lin@pu.edu.tw',
  department: '華語文教學中心',
  office: '博愛大樓 302 室',
  phone: '04-26328001 #17011',
  avatarUrl: undefined,
  term: '2026 夏季班',
  assignedClasses: ['初級華語一', '中級華語二', '高級華語三'],
};
import { generateDateStrip, formatDateFull, getAdjacentDate } from './utils/dateUtils';
import { generateFullQuarterCourses, getTodayDateStr } from './utils/quarterScheduler';
import { generateAllInitialGrades } from './utils/gradeUtils';
import { 
  Coffee, 
  CalendarX2, 
  Sparkles, 
  CheckCircle2, 
  BookOpen, 
  ArrowRight,
  Loader2
} from 'lucide-react';

const STORAGE_ROLE_KEY = 'clc_user_role_v2';
const STORAGE_COURSES_KEY = 'clc_quarter_courses_v5';
const STORAGE_GRADES_KEY = 'clc_quarter_grades_v5';
const STORAGE_ADMIN_CLASSES_KEY = 'clc_admin_classes_v2';
const STORAGE_ADMIN_COURSES_KEY = 'clc_admin_courses_v2';
const STORAGE_ADMIN_TEACHERS_KEY = 'clc_admin_teachers_v2';
const STORAGE_ADMIN_TRANSFERS_KEY = 'clc_admin_transfers_v2';
const STORAGE_ADMIN_LEAVES_KEY = 'clc_admin_leaves_v2';

export default function App() {
  // Current active system role: ADMIN (行政端) or TEACHER (老師端)
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const saved = sessionStorage.getItem(STORAGE_ROLE_KEY);
    return (saved === 'TEACHER' || saved === 'ADMIN') ? saved : 'ADMIN';
  });

  // Admin Supabase Auth Profile State
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Current active teacher (null for ADMIN, populated for TEACHER)
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);

  // Navigation active tabs
  const [activeTab, setActiveTab] = useState<NavigationTab>('today');
  const [adminActiveTab, setAdminActiveTab] = useState<AdminNavigationTab>('admin_dashboard');

  // Mobile sidebar drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Active selected date (Dynamic Today via new Date())
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStr());

  // Selected student for detail popup modal
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);

  // Active attendance session being taken (null if in dashboard)
  const [activeAttendanceCourse, setActiveAttendanceCourse] = useState<CourseSession | null>(null);
  const [isReadOnlyAttendance, setIsReadOnlyAttendance] = useState<boolean>(false);

  // Selected class for Grade Management tab
  const [gradeSelectedClass, setGradeSelectedClass] = useState<string>('初級華語一');

  // ================= ADMIN DATA STATE (Unified to Supabase public.students & public.classes) =================
  // Supabase Real Students & Classes State (Single source of truth for all admin views)
  const [dbStudents, setDbStudents] = useState<Student[]>([]);
  const [isStudentsLoading, setIsStudentsLoading] = useState<boolean>(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Supabase Classes & Terms (Directly loaded from Supabase, NO mock/localStorage fallback)
  const [adminClasses, setAdminClasses] = useState<ClassEntity[]>([]);
  const [adminTerms, setAdminTerms] = useState<Term[]>([]);
  const [isTermsLoading, setIsTermsLoading] = useState<boolean>(false);

  const [adminTeachers, setAdminTeachers] = useState<Teacher[]>([]);
  const [isTeachersLoading, setIsTeachersLoading] = useState<boolean>(false);
  const [teachersError, setTeachersError] = useState<string | null>(null);

  const [adminTransferRecords, setAdminTransferRecords] = useState<TransferClassRecord[]>([]);

  const [adminLeaves, setAdminLeaves] = useState<LeaveRecord[]>([]);

  // Persistent Full Quarter Courses state
  const [courses, setCourses] = useState<CourseSession[]>([]);

  // Persistent Grades state
  const [allGrades, setAllGrades] = useState<Record<string, StudentGrade>>({});

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Sync to session storage
  useEffect(() => {
    sessionStorage.setItem(STORAGE_ROLE_KEY, currentRole);
  }, [currentRole]);

  // Clean up legacy mock data from local storage
  useEffect(() => {
    localStorage.removeItem('clc_admin_students_v2');
    localStorage.removeItem(STORAGE_ADMIN_CLASSES_KEY);
    localStorage.removeItem(STORAGE_ADMIN_COURSES_KEY);
    localStorage.removeItem(STORAGE_ADMIN_TEACHERS_KEY);
    localStorage.removeItem(STORAGE_COURSES_KEY);
  }, []);

  // Ensure gradeSelectedClass matches currentTeacher's assignedClasses with localStorage persistence
  useEffect(() => {
    if (gradeSelectedClass) {
      localStorage.setItem('pu_clc_grade_selected_class', gradeSelectedClass);
    }
  }, [gradeSelectedClass]);

  useEffect(() => {
    if (currentTeacher?.assignedClasses && currentTeacher.assignedClasses.length > 0) {
      const saved = localStorage.getItem('pu_clc_grade_selected_class');
      if (saved && currentTeacher.assignedClasses.includes(saved)) {
        if (gradeSelectedClass !== saved) {
          setGradeSelectedClass(saved);
        }
      } else if (!currentTeacher.assignedClasses.includes(gradeSelectedClass)) {
        setGradeSelectedClass(currentTeacher.assignedClasses[0]);
      }
    }
  }, [currentTeacher]);

  // Supabase Auth Session Initialization & Listener
  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured() || !supabase) {
      setIsAuthChecking(false);
      setAdminProfile(null);
      return;
    }

    const client = supabase;

    const restoreSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        
        if (sessionError || !session?.user) {
          if (isMounted) {
            setAdminProfile(null);
            setCurrentTeacher(null);
            setIsAuthChecking(false);
          }
          return;
        }

        // Verify profile in public.profiles
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile && !profileError && profile.is_active) {
          const dbRole: UserRole = profile.role === 'TEACHER' ? 'TEACHER' : 'ADMIN';
          if (isMounted) {
            if (dbRole === 'ADMIN') {
              setAdminProfile({
                id: profile.id,
                role: 'ADMIN',
                fullName: profile.full_name || '系統管理員',
                email: profile.email || session.user.email || '',
                avatarUrl: profile.avatar_url,
                isActive: profile.is_active,
                createdAt: profile.created_at,
                updatedAt: profile.updated_at,
              });
              setCurrentRole('ADMIN');
              setCurrentTeacher(null);
              sessionStorage.setItem(STORAGE_ROLE_KEY, 'ADMIN');
            } else {
              setAdminProfile({
                id: profile.id,
                role: 'TEACHER',
                fullName: profile.full_name || '教師',
                email: profile.email || session.user.email || '',
                avatarUrl: profile.avatar_url,
                isActive: profile.is_active,
                createdAt: profile.created_at,
                updatedAt: profile.updated_at,
              });
              setCurrentRole('TEACHER');
              sessionStorage.setItem(STORAGE_ROLE_KEY, 'TEACHER');

              // Fetch teacher profile from public.teachers with assigned classes
              const mappedTeacher = await fetchTeacherWithClassesByProfileId(profile.id);
              if (mappedTeacher) {
                setCurrentTeacher(mappedTeacher);
                if (mappedTeacher.assignedClasses && mappedTeacher.assignedClasses.length > 0) {
                  const saved = localStorage.getItem('pu_clc_grade_selected_class');
                  if (saved && mappedTeacher.assignedClasses.includes(saved)) {
                    setGradeSelectedClass(saved);
                  } else {
                    setGradeSelectedClass(mappedTeacher.assignedClasses[0]);
                  }
                }
              }
            }
          }
        } else {
          // Inactive or invalid profile
          await client.auth.signOut().catch(() => {});
          if (isMounted) {
            setAdminProfile(null);
            setCurrentTeacher(null);
          }
        }
      } catch (err) {
        console.error('Session restore exception:', err);
      } finally {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    };

    restoreSession();

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (isMounted) {
          setAdminProfile(null);
          setCurrentTeacher(null);
          setCurrentRole('ADMIN');
          sessionStorage.removeItem(STORAGE_ROLE_KEY);
        }
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        try {
          const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile && profile.is_active) {
            const dbRole: UserRole = profile.role === 'TEACHER' ? 'TEACHER' : 'ADMIN';
            if (isMounted) {
              if (dbRole === 'ADMIN') {
                setAdminProfile({
                  id: profile.id,
                  role: 'ADMIN',
                  fullName: profile.full_name || '系統管理員',
                  email: profile.email || session.user.email || '',
                  avatarUrl: profile.avatar_url,
                  isActive: profile.is_active,
                  createdAt: profile.created_at,
                  updatedAt: profile.updated_at,
                });
                setCurrentRole('ADMIN');
                setCurrentTeacher(null);
                sessionStorage.setItem(STORAGE_ROLE_KEY, 'ADMIN');
              } else {
                setAdminProfile({
                  id: profile.id,
                  role: 'TEACHER',
                  fullName: profile.full_name || '教師',
                  email: profile.email || session.user.email || '',
                  avatarUrl: profile.avatar_url,
                  isActive: profile.is_active,
                  createdAt: profile.created_at,
                  updatedAt: profile.updated_at,
                });
                setCurrentRole('TEACHER');
                sessionStorage.setItem(STORAGE_ROLE_KEY, 'TEACHER');

                const { data: tRow } = await client
                  .from('teachers')
                  .select('*')
                  .eq('profile_id', profile.id)
                  .maybeSingle();

                if (tRow) {
                  const mappedTeacher = mapDbToTeacher(tRow);
                  setCurrentTeacher(mappedTeacher);
                }
              }
            }
          }
        } catch (e) {
          console.error('Auth state change profile fetch error:', e);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load teachers directly from Supabase public.teachers
  const loadSupabaseTeachers = async () => {
    if (!isSupabaseConfigured() || !supabase) return;
    setIsTeachersLoading(true);
    setTeachersError(null);
    try {
      const { data, error } = await fetchTeachersFromSupabase();
      if (error) {
        console.error('Failed to load teachers from Supabase:', error);
        setTeachersError(`無法載入教師資料庫 [${error.code || 'ERR'}]: ${error.message || String(error)}`);
        setAdminTeachers([]);
      } else {
        setAdminTeachers(data || []);
        setTeachersError(null);
      }
    } catch (err: any) {
      console.error('Error in loadSupabaseTeachers:', err);
      setTeachersError(`載入教師時發生未預期錯誤: ${err.message || String(err)}`);
      setAdminTeachers([]);
    } finally {
      setIsTeachersLoading(false);
    }
  };

  // Load students, classes, courses and terms from Supabase
  const loadSupabaseStudents = async () => {
    if (!isSupabaseConfigured() || !supabase) return;
    setIsStudentsLoading(true);
    setIsTermsLoading(true);
    setStudentsError(null);
    try {
      // 0. Fetch teachers
      await loadSupabaseTeachers();

      // 1. Fetch terms directly from Supabase terms table
      const { data: dbTerms, error: termErr } = await fetchTermsFromSupabase();
      if (termErr) {
        console.error('Failed to load terms from Supabase:', termErr);
      }
      setAdminTerms(dbTerms || []);

      // 2. Fetch classes directly from Supabase classes table
      const { data: dbClasses, error: classErr } = await fetchClassesFromSupabase();
      if (classErr) {
        console.error('Failed to load classes from Supabase:', classErr);
      }
      const currentClasses = dbClasses || [];
      setAdminClasses(currentClasses);

      // 4. Fetch students joined with class_students
      const { data, error } = await fetchStudentsFromSupabase(currentClasses);
      if (error) {
        console.error('Failed to load students from Supabase:', error);
        setStudentsError(`無法載入學生資料庫 [${error.code || 'ERR'}]: ${error.message}`);
        setDbStudents([]);
      } else {
        setDbStudents(data || []);
        setStudentsError(null);
      }

      // 5. Fetch class_sessions hydrated into CourseSession[] for Attendance and Schedule
      const { data: dbSessions, error: sessErr } = await fetchCourseSessionsFromSupabase();
      if (sessErr) {
        console.error('Failed to load class_sessions from Supabase:', sessErr);
      } else if (dbSessions && dbSessions.length > 0) {
        setCourses(dbSessions);
      }

      // 6. Fetch student grades from Supabase public.student_grades
      const fetchedGrades = await fetchStudentGradesFromSupabase(data || [], currentClasses);
      setAllGrades(fetchedGrades);

      // 7. Fetch leave requests from Supabase public.leave_requests
      const fetchedLeaves = await fetchLeavesFromSupabase(data || [], currentClasses);
      setAdminLeaves(fetchedLeaves);

      // 8. Fetch transfer history from Supabase public.student_enrollment_history
      const fetchedTransfers = await fetchTransferRecordsFromSupabase(data || [], currentClasses);
      setAdminTransferRecords(fetchedTransfers);
    } catch (err: any) {
      console.error('Error in loadSupabaseStudents:', err);
      setStudentsError(`載入資料時發生未預期錯誤: ${err.message || String(err)}`);
    } finally {
      setIsStudentsLoading(false);
      setIsTermsLoading(false);
    }
  };

  // Fetch Supabase data whenever user logs in or switches role
  useEffect(() => {
    if (isSupabaseConfigured() && adminProfile) {
      loadSupabaseStudents();
    }
  }, [adminProfile, adminActiveTab, currentRole]);

  // Admin login success callback
  const handleAdminLoginSuccess = (profile: UserProfile) => {
    setAdminProfile(profile);
    setCurrentRole('ADMIN');
    setCurrentTeacher(null);
    sessionStorage.setItem(STORAGE_ROLE_KEY, 'ADMIN');
    showToast(`歡迎回來，${profile.fullName} 管理員！`, 'success');
  };

  // Teacher login success callback
  const handleTeacherLoginSuccess = (teacher: Teacher, profile: UserProfile) => {
    setAdminProfile(profile);
    setCurrentTeacher(teacher);
    setCurrentRole('TEACHER');
    sessionStorage.setItem(STORAGE_ROLE_KEY, 'TEACHER');
    if (teacher.assignedClasses && teacher.assignedClasses.length > 0) {
      setGradeSelectedClass(teacher.assignedClasses[0]);
    }
    showToast(`歡迎 ${teacher.name} 老師登入授課系統！`, 'success');
  };

  // Logout callback (Admin & Teacher)
  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
    setAdminProfile(null);
    setCurrentTeacher(null);
    setCurrentRole('ADMIN');
    sessionStorage.removeItem(STORAGE_ROLE_KEY);
    setDbStudents([]);
    showToast('已安全登出系統', 'info');
  };

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts((prev) => [...prev, { id, message, type: type === 'error' ? 'warning' : type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleCloseToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Reset full quarter data handler (re-sync with Supabase)
  const handleResetData = () => {
    setSelectedDate(getTodayDateStr());
    setActiveAttendanceCourse(null);
    setSelectedStudentForDetail(null);
    loadSupabaseStudents();
    showToast('✨ 已從 Supabase 資料庫重新同步最新資料！', 'success');
  };

  // ================= ADMIN HANDLERS =================
  // 1. Add / Update / Delete Student (Connected to Supabase public.students)
  const handleAddStudent = async (newStudent: Student) => {
    const { data, error } = await createStudentInSupabase(newStudent, adminClasses);
    if (error) {
      console.error('Failed to create student in Supabase:', error);
      showToast(`❌ 建立學生失敗 [${error.code || 'ERR'}]: ${error.message}`, 'warning');
      throw error;
    } else {
      showToast(`✅ 已成功於 Supabase 建立新學生：${data?.name || newStudent.name} (${data?.studentNumber || newStudent.studentNumber})`, 'success');
      await loadSupabaseStudents();
    }
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    const { data, error } = await updateStudentInSupabase(updatedStudent, adminClasses);
    if (error) {
      console.error('Failed to update student in Supabase:', error);
      showToast(`❌ 更新學生資料失敗 [${error.code || 'ERR'}]: ${error.message}`, 'warning');
      throw error;
    } else {
      showToast(`✅ 已成功儲存學員【${data?.name || updatedStudent.name}】資料！`, 'success');
      await loadSupabaseStudents();
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    const { error } = await deleteStudentInSupabase(studentId);
    if (error) {
      console.error('Failed to delete student in Supabase:', error);
      showToast(`❌ 刪除學生失敗 [${error.code || 'ERR'}]: ${error.message}`, 'warning');
      throw error;
    } else {
      showToast(`✅ 已從 Supabase 刪除學員資料！`, 'info');
      await loadSupabaseStudents();
    }
  };

  // 2. Student Transfer Handler
  const handleTransferStudent = async (record: TransferClassRecord) => {
    // 1. Create transfer record in Supabase public.student_enrollment_history
    const { success, error: historyErr } = await createTransferRecordInSupabase(record, adminProfile?.id);
    if (!success) {
      console.error('Failed to create transfer record in Supabase:', historyErr);
    }

    // 2. Update student in Supabase if exists
    const targetStudent = dbStudents.find(
      (s) => String(s.id) === String(record.studentId)
    );
    if (targetStudent) {
      const newHist = {
        id: `HIST-${Date.now()}`,
        action: 'transferred' as const,
        actionDate: record.transferDate,
        fromClass: record.fromClassName,
        toClass: record.toClassName,
        reason: record.reason,
        operator: record.operator,
      };
      const matchedTargetClass = adminClasses.find(
        (c) => String(c.id) === String(record.toClassId) || c.name === record.toClassName
      );
      const updatedStudent: Student = {
        ...targetStudent,
        classId: matchedTargetClass?.id || record.toClassId,
        className: record.toClassName,
        enrollmentHistory: [newHist, ...(targetStudent.enrollmentHistory || [])],
      };
      const { error } = await updateStudentInSupabase(updatedStudent, adminClasses);
      if (error) {
        console.error('Failed to update student in Supabase:', error);
        showToast(`❌ 分班/轉班失敗 [${error.code || 'ERR'}]: ${error.message || '更新錯誤'}`, 'warning');
        return;
      }
    }

    showToast(`✅ 學員【${record.studentName}】已成功分派／轉班至【${record.toClassName}】！`, 'success');
    await loadSupabaseStudents();
  };

  // 4. Terms Handlers (Supabase CRUD)
  const handleAddTerm = async (newTerm: Partial<Term>) => {
    try {
      const { data, error } = await createTermInSupabase(newTerm);
      if (error || !data) {
        showToast(`建立學期期別失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('新增學期失敗');
      }
      showToast(`✅ 已成功於 Supabase 建立學期期別：${data.name} (${data.termCode})`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleAddTerm error:', err);
      throw err;
    }
  };

  const handleUpdateTerm = async (termId: string, updatedTerm: Partial<Term>) => {
    try {
      const { data, error } = await updateTermInSupabase(termId, updatedTerm);
      if (error || !data) {
        showToast(`更新學期期別失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('更新學期失敗');
      }
      showToast(`✅ 已儲存【${data.name}】學期設定！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleUpdateTerm error:', err);
      throw err;
    }
  };

  const handleToggleTermActive = async (termId: string, currentActive: boolean) => {
    try {
      const nextActive = !currentActive;
      const { data, error } = await toggleTermActiveInSupabase(termId, nextActive);
      if (error || !data) {
        showToast(`切換學期開放狀態失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('切換學期狀態失敗');
      }
      showToast(`✅ 已將學期狀態更新為【${nextActive ? '開放中 (Active)' : '已停用 (Inactive)'}】！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleToggleTermActive error:', err);
      throw err;
    }
  };

  const handleToggleTermLock = async (termId: string, currentLocked: boolean) => {
    try {
      const nextLocked = !currentLocked;
      const { data, error } = await toggleTermLockInSupabase(termId, nextLocked);
      if (error || !data) {
        showToast(`切換學期鎖定狀態失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('切換鎖定狀態失敗');
      }
      showToast(`✅ 已將學期更新為【${nextLocked ? '鎖定封存 (Locked)' : '開放編輯 (Unlocked)'}】！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleToggleTermLock error:', err);
      throw err;
    }
  };

  const handleDeleteTerm = async (termId: string) => {
    try {
      const { success, error } = await deleteTermFromSupabase(termId);
      if (error || !success) {
        showToast(`刪除學期失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error(error?.message || '刪除學期失敗');
      }
      showToast(`✅ 已成功刪除學期期別！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleDeleteTerm error:', err);
      throw err;
    }
  };

  // 5. Classes Handlers (Supabase CRUD)
  const handleAddClass = async (newClass: Partial<ClassEntity>) => {
    try {
      const { data, error } = await createClassInSupabase(newClass);
      if (error || !data) {
        const msg = error?.message || '未知錯誤';
        showToast(`開設新班級失敗: ${msg}`, 'error');
        throw error || new Error(msg);
      }
      await loadSupabaseStudents();
      showToast(`✅ 已成功開設新班級：${data.name}`, 'success');
    } catch (err: any) {
      console.error('[handleAddClass error]:', err);
      showToast(`❌ 開設新班級失敗: ${err.message || String(err)}`, 'error');
      throw err;
    }
  };

  const handleUpdateClass = async (updatedClass: ClassEntity) => {
    try {
      const { data, error } = await updateClassInSupabase(updatedClass.id, updatedClass);
      if (error || !data) {
        const msg = error?.message || '未知錯誤';
        showToast(`更新班級失敗: ${msg}`, 'error');
        throw error || new Error(msg);
      }
      await loadSupabaseStudents();
      showToast(`✅ 已更新班級【${data.name}】開班資訊！`, 'success');
    } catch (err: any) {
      console.error('[handleUpdateClass error]:', err);
      showToast(`❌ 更新班級失敗: ${err.message || String(err)}`, 'error');
      throw err;
    }
  };

  const handleToggleClassStatus = async (classId: string, nextStatus: string) => {
    try {
      const resolvedStatus = (nextStatus || '').toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';
      const { success, error } = await toggleClassStatusInSupabase(classId, resolvedStatus);
      if (error || !success) {
        showToast(`切換班級狀態失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('切換班級狀態失敗');
      }
      showToast(`✅ 已將班級狀態更新為【${resolvedStatus === 'OPEN' ? '招生開放中 (OPEN)' : '已關閉/額滿 (CLOSED)'}】！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleToggleClassStatus error:', err);
      throw err;
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      const { success, error } = await deleteClassInSupabase(classId);
      if (error || !success) {
        showToast(`刪除班級失敗: ${error?.message || '未知錯誤'}`, 'error');
        throw error || new Error('刪除班級失敗');
      }
      showToast(`✅ 已成功刪除空班級！`, 'success');
      await loadSupabaseStudents();
    } catch (err: any) {
      console.error('handleDeleteClass error:', err);
      throw err;
    }
  };

  // 5. Teachers Handlers
  const handleAddTeacher = async (teacherData: {
    name: string;
    englishName?: string;
    email: string;
    phone?: string;
    specialty?: string;
    password?: string;
  }) => {
    const { data: newTeacher, error } = await createTeacherInSupabase(teacherData);
    if (error) {
      showToast(`建立教師失敗：${error.message || JSON.stringify(error)}`, 'error');
      throw error;
    }
    const tNo = newTeacher?.teacherNo ? ` [${newTeacher.teacherNo}]` : '';
    showToast(`✨ 已成功建立教師檔案${tNo}與 Auth 登入帳號：${newTeacher?.name || teacherData.name} 老師`, 'success');
    await loadSupabaseTeachers();
  };

  const handleUpdateTeacher = async (updatedTeacher: Teacher) => {
    const { data, error } = await updateTeacherInSupabase(updatedTeacher);
    if (error) {
      console.error('Failed to update teacher in Supabase:', error);
      showToast(`❌ 更新教師資料失敗 [${error.code || 'ERR'}]: ${error.message || String(error)}`, 'warning');
      throw error;
    } else {
      showToast(`✅ 已成功更新【${data?.name || updatedTeacher.name} 老師】師資資訊！`, 'success');
      await loadSupabaseTeachers();
    }
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    const { success, message, error } = await deleteTeacherInSupabase(teacherId);
    if (!success || error) {
      showToast(`❌ 刪除教師失敗: ${error?.message || '未知錯誤'}`, 'error');
      throw error || new Error('刪除教師失敗');
    }
    showToast(message || '✅ 已成功安全刪除教師檔案！', 'success');
    await loadSupabaseTeachers();
  };

  const handleToggleTeacherStatus = async (teacherId: string, nextStatus: 'active' | 'inactive') => {
    const { success, message, error } = await toggleTeacherStatusInSupabase(teacherId, nextStatus);
    if (!success || error) {
      showToast(`❌ 更新教師狀態失敗: ${error?.message || '未知錯誤'}`, 'warning');
      throw error || new Error('更新教師狀態失敗');
    }
    showToast(message || '✅ 已成功更新教師在職狀態！', 'success');
    await loadSupabaseTeachers();
  };

  const handleReassignTeacherClasses = async (teacherId: string, assignedClassNames: string[]) => {
    const teacher = adminTeachers.find((t) => t.id === teacherId);
    if (!teacher) return;

    setAdminTeachers((prev) =>
      prev.map((t) => (t.id === teacherId ? { ...t, assignedClasses: assignedClassNames } : t))
    );

    // Update classes to point to this teacher
    setAdminClasses((prev) =>
      prev.map((cls) => {
        if (assignedClassNames.includes(cls.name)) {
          return { ...cls, teacherId: teacher.id, teacherName: teacher.name };
        }
        return cls;
      })
    );

    const { error } = await updateTeacherClassAssignmentsInSupabase(teacherId, assignedClassNames, adminClasses);
    if (error) {
      console.error('Failed to sync teacher class assignments to Supabase:', error);
      showToast(`⚠️ 授課班級已在前端更動，但寫入 Supabase 失敗: ${error.message || String(error)}`, 'warning');
    } else {
      showToast(`✅ 已成功更新【${teacher.name} 老師】的授課班級！`, 'success');
      await loadSupabaseStudents();
    }
  };

  // 6. Schedule & Reschedule Handlers
  const handleAddCourseSession = (session: CourseSession) => {
    setCourses((prev) => [...prev, session]);
    showToast(`已新增排課堂次！`, 'success');
  };

  const handleUpdateCourseSession = (session: CourseSession) => {
    setCourses((prev) => prev.map((c) => (c.id === session.id ? session : c)));
    showToast(`已更新課堂資訊！`, 'success');
  };

  const handleRescheduleCourse = (courseId: string, targetDate: string, targetTime: string, reason: string) => {
    setCourses((prev) => {
      const original = prev.find((c) => c.id === courseId);
      if (!original) return prev;

      // Mark original as rescheduled out
      const updatedOriginal: CourseSession = {
        ...original,
        status: 'unmarked',
        rescheduleInfo: {
          originalDate: original.date,
          targetDate,
          type: 'out',
          reason,
        },
      };

      // Create new session at target date
      const newSession: CourseSession = {
        ...original,
        id: `CRS-RESCHED-${Date.now()}`,
        date: targetDate,
        timeSlot: targetTime,
        status: 'unmarked',
        rescheduleInfo: {
          originalDate: original.date,
          targetDate,
          type: 'in',
          reason,
        },
      };

      return [...prev.map((c) => (c.id === courseId ? updatedOriginal : c)), newSession];
    });

    showToast(`✅ 已排定調課至 ${targetDate} (${targetTime})！全季排課進度已更新。`, 'success');
  };

  // 7. Leaves & Grades Handlers (Supabase CRUD)
  const handleAddLeave = async (leave: LeaveRecord) => {
    setAdminLeaves((prev) => [leave, ...prev]);
    const { success, error } = await createLeaveInSupabase(leave);
    if (!success) {
      console.error('Failed to create leave in Supabase:', error);
      showToast(`⚠️ 請假單儲存至資料庫失敗: ${error?.message || '資料庫錯誤'}`, 'warning');
    } else {
      showToast(`✅ 已成功登錄學員【${leave.studentName}】的請假紀錄至 Supabase！`, 'success');
      const freshLeaves = await fetchLeavesFromSupabase(dbStudents, adminClasses);
      setAdminLeaves(freshLeaves);
    }
  };

  const handleUpdateLeaveStatus = async (leaveIdOrIndex: string | number, newStatus: 'approved' | 'rejected') => {
    let targetLeave: LeaveRecord | undefined;
    if (typeof leaveIdOrIndex === 'string') {
      targetLeave = adminLeaves.find((l) => l.id === leaveIdOrIndex);
    } else {
      targetLeave = adminLeaves[leaveIdOrIndex];
    }

    if (!targetLeave) {
      console.error('Target leave record not found for status update:', leaveIdOrIndex);
      return;
    }

    setAdminLeaves((prev) =>
      prev.map((l) =>
        l.id === targetLeave?.id || (typeof leaveIdOrIndex === 'number' && prev.indexOf(l) === leaveIdOrIndex)
          ? {
              ...l,
              status: newStatus,
              approvedAt: newStatus === 'approved' ? new Date().toISOString().substring(0, 16).replace('T', ' ') : undefined,
              approver: adminProfile?.fullName || '行政教務處',
            }
          : l
      )
    );

    if (targetLeave.id) {
      const { success, error } = await updateLeaveStatusInSupabase(
        targetLeave.id,
        newStatus,
        adminProfile?.id
      );
      if (!success) {
        console.error('Failed to update leave status in Supabase:', error);
        showToast(`⚠️ 更新請假審核狀態至資料庫失敗: ${error?.message || '資料庫錯誤'}`, 'warning');
      } else {
        showToast(`已更新請假審核狀態為：${newStatus === 'approved' ? '核准' : '退回'}！`, 'info');
        const freshLeaves = await fetchLeavesFromSupabase(dbStudents, adminClasses);
        setAdminLeaves(freshLeaves);
      }
    }
  };

  const handleUpdateGrades = async (updatedGrades: Record<string, StudentGrade>) => {
    setAllGrades(updatedGrades);

    try {
      const gradeArray = Object.values(updatedGrades);
      for (const grade of gradeArray) {
        const student = dbStudents.find((s) => String(s.id) === String(grade.studentId));
        await saveStudentGradeToSupabase(grade, student?.classId);
      }
      showToast('✅ 成績已成功寫入 Supabase 資料庫！', 'success');
    } catch (err) {
      console.error('Failed to save grades to Supabase:', err);
      showToast('⚠️ 成績儲存至資料庫時發生部分錯誤', 'warning');
    }
  };

  // ================= TEACHER SPECIFIC COMPUTED =================
  const teacherCourses = useMemo(() => {
    if (!currentTeacher) return [];
    const assignedSet = new Set(currentTeacher.assignedClasses || []);
    return courses.filter((c) => {
      const isTeacherIdMatch = Boolean(c.teacherId && c.teacherId === currentTeacher.id);
      const isTeacherNameMatch = Boolean(c.teacherName && c.teacherName === currentTeacher.name);
      const isClassNameMatch = Boolean(
        (c.className && assignedSet.has(c.className)) ||
        (c.courseName && assignedSet.has(c.courseName))
      );
      return isTeacherIdMatch || isTeacherNameMatch || isClassNameMatch;
    });
  }, [courses, currentTeacher]);

  const daySummaries = useMemo(() => {
    return generateDateStrip('2026-07-01', '2026-10-31', teacherCourses, selectedDate);
  }, [teacherCourses, selectedDate]);

  const currentDayCourses = useMemo(() => {
    return teacherCourses.filter((c) => c.date === selectedDate);
  }, [teacherCourses, selectedDate]);

  const currentDayLeaves = useMemo(() => {
    const teacherClassNames = new Set(teacherCourses.map((c) => c.className));
    return adminLeaves.filter(
      (l) => l.date === selectedDate && teacherClassNames.has(l.className)
    );
  }, [selectedDate, teacherCourses, adminLeaves]);

  const pendingMakeupCourses = useMemo(() => {
    const today = getTodayDateStr();
    const sevenDaysAgo = getAdjacentDate(today, -7);
    return teacherCourses.filter(
      (c) =>
        c.date < today &&
        c.date >= sevenDaysAgo &&
        c.status === 'unmarked' &&
        !c.isLocked
    );
  }, [teacherCourses]);

  const pendingCountForHeader = useMemo(() => {
    return currentDayCourses.filter((c) => c.status === 'unmarked' || c.status === 'in_progress').length;
  }, [currentDayCourses]);

  const pendingLeaveCount = useMemo(() => {
    return adminLeaves.filter((l) => l.status === 'pending').length;
  }, [adminLeaves]);

  const activeCourseStudents = useMemo(() => {
    if (!activeAttendanceCourse) return [];
    return activeAttendanceCourse.studentIds
      .map((id) => dbStudents.find((s) => s.id === id || s.studentNumber === id))
      .filter(Boolean) as Student[];
  }, [activeAttendanceCourse, dbStudents]);

  const currentTeacherStudents = useMemo(() => {
    if (!currentTeacher) return [];
    const teacherClassNames = currentTeacher.assignedClasses || [];
    return dbStudents.filter((s) => {
      return (
        teacherClassNames.includes(s.className) ||
        (s.classId && teacherClassNames.includes(s.classId)) ||
        s.teacher === currentTeacher.name
      );
    });
  }, [currentTeacher, dbStudents]);

  // Handler: Start Attendance
  const handleStartAttendance = (course: CourseSession) => {
    setIsReadOnlyAttendance(false);
    setActiveAttendanceCourse(course);
  };

  // Handler: View Attendance
  const handleViewRecord = (course: CourseSession) => {
    setIsReadOnlyAttendance(false);
    setActiveAttendanceCourse(course);
  };

  // Handler: Save Attendance
  const handleSaveAttendance = async (
    courseId: string,
    attendanceData: { [studentId: string]: StudentPeriodAttendance },
    targetStatus: 'in_progress' | 'completed'
  ) => {
    const targetCourse = courses.find((c) => c.id === courseId) || activeAttendanceCourse;
    if (!targetCourse) {
      showToast('❌ 找不到對應的課程資料', 'error');
      return;
    }

    const operatedBy = adminProfile?.fullName || currentTeacher?.name || '專任教師';

    const { success, error } = await saveAttendanceToSupabase({
      course: targetCourse,
      attendanceData,
      targetStatus,
      operatedBy,
    });

    if (!success || error) {
      console.error('[App] Failed to save attendance to Supabase:', error);
      showToast(`❌ 點名儲存失敗：${error?.message || String(error)}`, 'error');
      return;
    }

    const now = new Date();
    const timeStr = `${selectedDate} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    setCourses((prevCourses) => {
      return prevCourses.map((c) => {
        if (c.id === courseId) {
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
    showToast(`🎉 點名紀錄已成功寫入 Supabase 資料庫！已自動重新計算學員出缺席與出席成績。`, 'success');

    // Asynchronously reload students and grades so grade management view reflects the newly recorded attendance
    loadSupabaseStudents().catch((err) => {
      console.warn('[App] Background reload after attendance save failed:', err);
    });
  };

  // Handler: Jump to target date
  const handleJumpToTargetDate = (targetDate: string) => {
    setSelectedDate(targetDate);
    showToast(`已跳轉至 ${targetDate} 補課日程`, 'info');
  };

  // Compute title for Header
  const headerTitle = useMemo(() => {
    if (currentRole === 'ADMIN') {
      const map: Record<AdminNavigationTab, string> = {
        admin_dashboard: '行政總覽看板 (Dashboard)',
        admin_students: '全校外籍學生基本資料與學籍管理',
        admin_enrollment: '學生分班與轉班作業中樞',
        admin_assignments: '學生分班與轉班作業中樞',
        admin_courses: '課程分類定義 (Course Catalog)',
        admin_materials: '教材主資料與班級教材進度規劃 (Materials Management)',
        admin_terms: '全校學期期別管理 (Term Management)',
        admin_classes: '實際開設班級管理 (Classes Management)',
        admin_teachers: '全校專兼任教師師資管理',
        admin_schedule: '全校排課、調課與目標時數進度管理',
        admin_attendance: '全校班級點名即時監控與歷史存檔',
        admin_grades: '全校學員期末成績結算與等第總評',
        admin_reports: '全校校務報表統計與官方證明書生成',
      };
      return map[adminActiveTab] || '靜宜大學華語中心 行政管理系統';
    } else {
      const map: Record<NavigationTab, string> = {
        today: '今日點名與日程',
        grades: '學生成績管理',
        classes: '個別學生出席統計',
        schedule: '全季課程排程與調課',
        history: '點名歷史總覽',
        stats: '出席率預警',
      };
      return map[activeTab] || '靜宜大學華語中心 教師系統';
    }
  }, [currentRole, adminActiveTab, activeTab]);

  // Loading state during initial session checking
  if (isAuthChecking) {
    return (
      <div className="flex h-screen bg-slate-900 text-slate-100 font-sans antialiased items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 ring-2 ring-blue-500/30 shadow-xl">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-wide">靜宜大學華語中心</div>
            <div className="text-xs text-slate-400 mt-1">系統權限驗證中...</div>
          </div>
        </div>
      </div>
    );
  }

  // If user is not authenticated, render Shared Login screen (Admin / Teacher)
  if (!adminProfile) {
    return (
      <>
        <ToastNotification toasts={toasts} onClose={handleCloseToast} />
        <AdminLoginView 
          onLoginSuccess={handleAdminLoginSuccess}
          onTeacherLoginSuccess={handleTeacherLoginSuccess}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-[#F5F7F9] text-[#26313B] font-sans antialiased overflow-hidden">
      {/* Toast notifications */}
      <ToastNotification toasts={toasts} onClose={handleCloseToast} />

      {/* Student Personal Detail Modal */}
      {selectedStudentForDetail && (
        <StudentDetailModal
          student={selectedStudentForDetail}
          allCourses={courses}
          grade={allGrades[selectedStudentForDetail.id]}
          teacherName={currentRole === 'ADMIN' ? '教務行政組' : `${currentTeacher?.name || ''}老師`}
          onClose={() => setSelectedStudentForDetail(null)}
        />
      )}

      {/* Responsive Left Sidebar */}
      <Sidebar
        currentRole={currentRole}
        activeTab={activeTab}
        adminActiveTab={adminActiveTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveAttendanceCourse(null);
          setIsMobileSidebarOpen(false);
        }}
        onAdminTabChange={(tab) => {
          setAdminActiveTab(tab);
          setActiveAttendanceCourse(null);
          setIsMobileSidebarOpen(false);
        }}
        onResetData={handleResetData}
        pendingAttendanceCount={pendingCountForHeader}
        pendingLeaveCount={pendingLeaveCount}
        currentTeacher={currentTeacher}
        teachers={adminTeachers}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        adminProfile={adminProfile}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <Header
          currentRole={currentRole}
          title={headerTitle}
          subtitle={
            currentRole === 'ADMIN'
              ? `靜宜大學華語中心 • 行政最高管理權限 • 2026 夏季學期`
              : activeTab === 'today'
              ? `靜宜大學華語中心 • 2026 夏季班 • ${formatDateFull(selectedDate)}`
              : '靜宜大學華語中心 教師端點名與成績管理系統'
          }
          selectedDate={selectedDate}
          onJumpToDate={(date) => {
            setSelectedDate(date);
            if (currentRole === 'TEACHER') {
              setActiveTab('today');
            }
            setActiveAttendanceCourse(null);
          }}
          pendingAttendanceCount={pendingCountForHeader}
          currentTeacher={currentTeacher}
          teachers={adminTeachers}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          adminProfile={adminProfile}
          onLogout={handleLogout}
        />

        {/* Content Container */}
        <main className="p-3.5 sm:p-6 max-w-7xl w-full mx-auto flex-1">
          {/* ================= ADMIN VIEWS ================= */}
          {currentRole === 'ADMIN' ? (
            <div>
              {adminActiveTab === 'admin_dashboard' && (
                <AdminDashboardView
                  students={dbStudents}
                  classes={adminClasses}
                  teachers={adminTeachers}
                  allCourses={courses}
                  leaves={adminLeaves}
                  onNavigateTab={(tab) => setAdminActiveTab(tab)}
                  onSelectStudentDetail={(student) => setSelectedStudentForDetail(student)}
                />
              )}

              {adminActiveTab === 'admin_students' && (
                <AdminStudentManagementView
                  students={dbStudents}
                  classes={adminClasses}
                  onAddStudent={handleAddStudent}
                  onUpdateStudent={handleUpdateStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onSelectStudentDetail={(student) => setSelectedStudentForDetail(student)}
                  isLoading={isStudentsLoading}
                  errorMessage={studentsError}
                  onRefresh={loadSupabaseStudents}
                />
              )}

              {adminActiveTab === 'admin_assignments' && (
                <AdminClassAssignmentView
                  students={dbStudents}
                  classes={adminClasses}
                  transferRecords={adminTransferRecords}
                  onTransferStudent={handleTransferStudent}
                  onSelectStudentDetail={(student) => setSelectedStudentForDetail(student)}
                />
              )}

              {adminActiveTab === 'admin_courses' && (
                <AdminMaterialManagementView
                  classes={adminClasses}
                  onRefreshMaterials={() => {
                    loadSupabaseStudents();
                  }}
                />
              )}

              {adminActiveTab === 'admin_materials' && (
                <AdminMaterialManagementView
                  classes={adminClasses}
                  onRefreshMaterials={() => {
                    loadSupabaseStudents();
                  }}
                />
              )}

              {adminActiveTab === 'admin_terms' && (
                <AdminTermManagementView
                  terms={adminTerms}
                  classes={adminClasses}
                  isLoading={isTermsLoading}
                  onAddTerm={handleAddTerm}
                  onUpdateTerm={handleUpdateTerm}
                  onToggleActive={handleToggleTermActive}
                  onToggleLock={handleToggleTermLock}
                  onDeleteTerm={handleDeleteTerm}
                  onNavigateToClasses={(termName) => {
                    setAdminActiveTab('admin_classes');
                  }}
                />
              )}

              {adminActiveTab === 'admin_classes' && (
                <AdminClassManagementView
                  classes={adminClasses}
                  teachers={adminTeachers}
                  students={dbStudents}
                  terms={adminTerms}
                  onAddClass={handleAddClass}
                  onUpdateClass={handleUpdateClass}
                  onToggleClassStatus={handleToggleClassStatus}
                  onDeleteClass={handleDeleteClass}
                  onViewClassStudents={(cls) => {
                    setAdminActiveTab('admin_assignments');
                  }}
                />
              )}

              {adminActiveTab === 'admin_teachers' && (
                <AdminTeacherManagementView
                  teachers={adminTeachers}
                  classes={adminClasses}
                  onAddTeacher={handleAddTeacher}
                  onUpdateTeacher={handleUpdateTeacher}
                  onDeleteTeacher={handleDeleteTeacher}
                  onToggleTeacherStatus={handleToggleTeacherStatus}
                  onReassignTeacherClasses={handleReassignTeacherClasses}
                  isLoading={isTeachersLoading}
                  errorMessage={teachersError}
                  onRefresh={loadSupabaseTeachers}
                />
              )}

              {adminActiveTab === 'admin_schedule' && (
                <AdminScheduleManagementView
                  terms={adminTerms}
                  classes={adminClasses}
                  selectedTermId={adminTerms.find((t) => t.isActive)?.id || adminTerms[0]?.id || 'f230e634-2051-4606-ac49-adcb42480103'}
                  onRefreshData={loadSupabaseStudents}
                />
              )}

              {adminActiveTab === 'admin_attendance' && (
                <AdminAttendanceManagementView
                  allCourses={courses}
                  students={dbStudents}
                  classes={adminClasses}
                  onSelectStudentDetail={(student) => setSelectedStudentForDetail(student)}
                />
              )}

              {adminActiveTab === 'admin_grades' && (
                <AdminGradesManagementView
                  students={dbStudents}
                  classes={adminClasses}
                  onSelectStudentDetail={(student) => setSelectedStudentForDetail(student)}
                />
              )}

              {adminActiveTab === 'admin_reports' && (
                <AdminReportsView
                  students={dbStudents}
                  classes={adminClasses}
                  allCourses={courses}
                />
              )}
            </div>
          ) : (
            /* ================= TEACHER VIEWS ================= */
            <div>
              {activeAttendanceCourse ? (
                /* Attendance Sheet Component (2-Hour vs 3-Hour Dynamic) */
                <AttendanceSheet
                  course={activeAttendanceCourse}
                  students={activeCourseStudents}
                  leaveRecords={adminLeaves}
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
                  {selectedDate === getTodayDateStr() && (
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
                        onClick={() => setSelectedDate(getTodayDateStr())}
                        className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center space-x-1.5"
                      >
                        <span>返回今日 ({getTodayDateStr().slice(5).replace('-', '/')})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentDayCourses.map((course) => {
                        const studentList = course.studentIds
                          .map((id) => dbStudents.find((s) => s.id === id || s.studentNumber === id))
                          .filter(Boolean) as Student[];

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
                /* 2. Grade Management View */
                <GradeManagementView
                  students={currentTeacherStudents}
                  allCourses={courses}
                  allGrades={allGrades}
                  onUpdateGrades={handleUpdateGrades}
                  onSelectStudentForDetail={(student) => setSelectedStudentForDetail(student)}
                  onShowToast={showToast}
                  currentClassName={gradeSelectedClass}
                  onSelectClass={(cls) => setGradeSelectedClass(cls)}
                  availableClasses={currentTeacher?.assignedClasses || []}
                />
              ) : activeTab === 'classes' ? (
                /* 3. Individual Student Attendance Stats & Roster */
                <ClassesView
                  currentTeacher={currentTeacher}
                  allCourses={courses}
                  allGrades={allGrades}
                  onSelectStudentForDetail={(student) => setSelectedStudentForDetail(student)}
                  classes={adminClasses}
                  allStudentsList={dbStudents}
                />
              ) : activeTab === 'schedule' ? (
                /* 4. Full Quarter Schedule & Reschedule Tracker */
                <RescheduleScheduleView
                  courses={teacherCourses}
                  daySummaries={daySummaries}
                  currentTeacher={currentTeacher}
                  adminClasses={adminClasses}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setActiveTab('today');
                  }}
                  onStartAttendance={(c) => {
                    setActiveAttendanceCourse(c);
                  }}
                  onShowToast={showToast}
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
                /* 6. Attendance Rate Warning */
                <AttendanceStatsView
                  onShowToast={showToast}
                  currentTeacher={currentTeacher}
                  students={dbStudents}
                  classes={adminClasses}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
