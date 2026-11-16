import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Clock,
  FileText,
  BookOpen,
  GraduationCap,
  Calculator,
  Download,
  FileSpreadsheet,
  Award,
  Filter,
  RotateCcw,
  History,
  ArrowRightLeft,
  IdCard,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Student,
  CourseSession,
  StudentGrade,
  TransferClassRecord,
  StudentGradeWeight,
  ClassEntity,
  Term,
  Teacher,
  AttendanceAuditLog,
} from '../types';
import { calculateStudentAttendanceHistory } from '../utils/attendanceUtils';
import { getStudentEffectiveGrade, calculateTotalGrade } from '../utils/gradeUtils';
import { resolveStudentGradeWeight } from '../lib/gradeWeightService';
import { StudentAvatar } from './StudentAvatar';
import { exportIndividualStudentAttendanceToCsv } from '../utils/csvExport';
import { exportStudentAttendanceToXlsx } from '../utils/excelExport';
import {
  computeCertificateAttendanceStats,
  buildDefaultEnglishWithTitle,
  buildDefaultNationalityLabel,
  formatChineseDateLong,
  formatDotDate,
  formatBilingualIssueDate,
  downloadCertificateDocx,
} from '../utils/certificateDocx';
import { getTodayDateStr } from '../utils/quarterScheduler';

interface StudentDetailModalProps {
  student: Student | null;
  allCourses: CourseSession[];
  grade?: StudentGrade;
  allGrades?: Record<string, StudentGrade>;
  customWeight?: StudentGradeWeight | null;
  gradeWeightsMap?: Record<string, StudentGradeWeight>;
  classes?: ClassEntity[];
  terms?: Term[];
  teachers?: Teacher[];
  auditLogs?: AttendanceAuditLog[];
  teacherName?: string;
  transferRecords?: TransferClassRecord[];
  isAdmin?: boolean;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  onClose: () => void;
}

const formatAuditPeriod = (val?: string | null) => {
  if (!val) return '-';
  const u = String(val).toUpperCase();
  if (u === 'PRESENT') return '出席';
  if (u === 'LEAVE') return '請假';
  if (u === 'ABSENT') return '缺席';
  return val;
};

const formatAuditSnapshot = (obj?: Record<string, any> | null, fallbackPeriods?: (string | null | undefined)[]) => {
  if (obj && typeof obj === 'object') {
    const parts: string[] = [];
    if (obj.period_1) parts.push(`1:${formatAuditPeriod(obj.period_1)}`);
    if (obj.period_2) parts.push(`2:${formatAuditPeriod(obj.period_2)}`);
    if (obj.period_3) parts.push(`3:${formatAuditPeriod(obj.period_3)}`);
    if (obj.period_4) parts.push(`4:${formatAuditPeriod(obj.period_4)}`);
    if (parts.length > 0) return parts.join(' / ');
  }
  if (fallbackPeriods && fallbackPeriods.some(Boolean)) {
    return fallbackPeriods
      .map((p, idx) => (p ? `${idx + 1}:${formatAuditPeriod(p)}` : null))
      .filter(Boolean)
      .join(' / ');
  }
  return '（無紀錄）';
};

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  allCourses,
  grade,
  allGrades,
  customWeight,
  gradeWeightsMap,
  classes = [],
  terms = [],
  teachers = [],
  auditLogs = [],
  teacherName,
  transferRecords = [],
  isAdmin = false,
  onShowToast,
  onClose,
}) => {
  // Multi-filter state for historical attendance records
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterTermId, setFilterTermId] = useState<string>('ALL');
  const [filterClassName, setFilterClassName] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Selected class context for multi-term / multi-class grade inspection
  const [selectedGradeClassId, setSelectedGradeClassId] = useState<string>('');

  // Certificate generation modal state (Admin-only)
  const [isCertModalOpen, setIsCertModalOpen] = useState<boolean>(false);
  const [certStudentName, setCertStudentName] = useState<string>('');
  const [certEnglishWithTitle, setCertEnglishWithTitle] = useState<string>('');
  const [certNationalityLabel, setCertNationalityLabel] = useState<string>('');
  const [certRegStartDate, setCertRegStartDate] = useState<string>('');
  const [certRegEndDate, setCertRegEndDate] = useState<string>('');
  const [certRecStartDate, setCertRecStartDate] = useState<string>('');
  const [certRecEndDate, setCertRecEndDate] = useState<string>('');
  const [certWeeklyHours, setCertWeeklyHours] = useState<number>(15);
  const [certIssueDate, setCertIssueDate] = useState<string>(() => getTodayDateStr());
  const [isGeneratingDocx, setIsGeneratingDocx] = useState<boolean>(false);

  // Sync defaults whenever student changes
  useEffect(() => {
    if (!student) return;
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterTermId('ALL');
    setFilterClassName('ALL');
    setFilterStatus('ALL');
    setSelectedGradeClassId(student.classId || '');
    setIsCertModalOpen(false);
  }, [student?.id]);

  // Derived real DB class / term / teacher metadata
  const currentClassEntity = useMemo(() => {
    if (!student) return undefined;
    return classes.find(
      (c) => (student.classId && c.id === student.classId) || (student.className && c.name === student.className)
    );
  }, [student, classes]);

  const currentTermEntity = useMemo(() => {
    if (!currentClassEntity) return undefined;
    return terms.find(
      (t) =>
        (currentClassEntity.termId && t.id === currentClassEntity.termId) ||
        (currentClassEntity.term && t.name === currentClassEntity.term)
    );
  }, [currentClassEntity, terms]);

  const resolvedTeacherName = useMemo(() => {
    if (teacherName && teacherName.trim()) return teacherName;
    if (currentClassEntity?.teacherName) return `${currentClassEntity.teacherName} 老師`;
    if (currentClassEntity?.teacherId) {
      const matchedT = teachers.find((t) => t.id === currentClassEntity.teacherId);
      if (matchedT?.name) return `${matchedT.name} 老師`;
    }
    return '未指派教師';
  }, [teacherName, currentClassEntity, teachers]);

  // Student transfer records from DB
  const studentTransfers = useMemo(() => {
    if (!student) return [];
    return (transferRecords || [])
      .filter((r) => String(r.studentId) === String(student.id))
      .sort((a, b) => (b.transferDate || '').localeCompare(a.transferDate || ''));
  }, [student, transferRecords]);

  // Full attendance history across student's timeline
  const history = useMemo(() => {
    return calculateStudentAttendanceHistory(student, allCourses, transferRecords);
  }, [student, allCourses, transferRecords]);

  // Candidate class contexts for multi-class / multi-term grades
  const gradeClassOptions = useMemo(() => {
    if (!student) return [];
    const map = new Map<string, { classId: string; className: string; termId?: string; termName?: string }>();

    const addOption = (clsId?: string, clsName?: string) => {
      const matched = classes.find((c) => (clsId && c.id === clsId) || (clsName && c.name === clsName));
      const finalId = matched?.id || clsId || clsName || '';
      if (!finalId) return;
      const termObj = matched
        ? terms.find((t) => (matched.termId && t.id === matched.termId) || (matched.term && t.name === matched.term))
        : undefined;
      if (!map.has(finalId)) {
        map.set(finalId, {
          classId: finalId,
          className: matched?.name || clsName || finalId,
          termId: matched?.termId || termObj?.id,
          termName: termObj?.name || matched?.term,
        });
      }
    };

    if (student.classId || student.className) {
      addOption(student.classId, student.className);
    }
    studentTransfers.forEach((tr) => {
      addOption(tr.fromClassId, tr.fromClassName);
      addOption(tr.toClassId, tr.toClassName);
    });
    if (allGrades) {
      Object.keys(allGrades).forEach((k) => {
        if (k.startsWith(`${student.id}_`)) {
          const cid = k.slice(student.id.length + 1);
          const g = allGrades[k];
          addOption(cid, g?.className);
        }
      });
    }
    return Array.from(map.values());
  }, [student, classes, terms, studentTransfers, allGrades]);

  const activeGradeOption = useMemo(() => {
    return (
      gradeClassOptions.find((o) => o.classId === selectedGradeClassId) ||
      gradeClassOptions[0] ||
      null
    );
  }, [gradeClassOptions, selectedGradeClassId]);

  const activeGradeContext = useMemo(() => {
    if (!student) {
      return {
        effectiveGrade: null as StudentGrade | null,
        weights: {
          attendanceWeight: 20,
          quizWeight: 15,
          midtermWeight: 20,
          finalWeight: 20,
          homeworkWeight: 15,
          attitudeWeight: 10,
        },
        isCustom: false,
      };
    }

    const targetClassId = activeGradeOption?.classId || student.classId;
    const targetTermId = activeGradeOption?.termId || currentClassEntity?.termId;

    // Resolve weight (prefer gradeWeightsMap for the selected term; fallback to customWeight prop)
    let resolved = resolveStudentGradeWeight(student.id, targetTermId, gradeWeightsMap);
    if (!resolved.isCustom && customWeight && (!targetTermId || !customWeight.termId || customWeight.termId === targetTermId)) {
      resolved = resolveStudentGradeWeight(student.id, targetTermId, {
        [student.id]: customWeight,
      });
    }

    const gradesSource: Record<string, StudentGrade> | undefined =
      allGrades && Object.keys(allGrades).length > 0
        ? allGrades
        : grade
        ? { [`${student.id}_${targetClassId || ''}`]: grade, [student.id]: grade }
        : undefined;

    const weightsSource: Record<string, StudentGradeWeight> | undefined = resolved.customWeight
      ? {
          ...(gradeWeightsMap || {}),
          ...(targetTermId ? { [`${student.id}_${targetTermId}`]: resolved.customWeight } : {}),
          [student.id]: resolved.customWeight,
        }
      : gradeWeightsMap;

    // If inspecting a non-current historical class, scope courses to that class when possible
    const isViewingCurrentClass = !targetClassId || targetClassId === student.classId;
    const scopedCourses = isViewingCurrentClass
      ? allCourses
      : allCourses.filter(
          (c) => c.classId === targetClassId || (activeGradeOption?.className && c.className === activeGradeOption.className)
        );

    const eff = getStudentEffectiveGrade(
      student,
      gradesSource,
      scopedCourses.length > 0 ? scopedCourses : allCourses,
      transferRecords,
      weightsSource,
      targetTermId,
      targetClassId
    );

    // Ensure totalScore uses exact resolved weights
    const exactTotal = calculateTotalGrade(
      eff.attendanceScore,
      eff.quizScore,
      eff.midtermScore,
      eff.finalScore,
      eff.homeworkScore,
      eff.attitudeScore,
      resolved.weights
    );

    return {
      effectiveGrade: {
        ...eff,
        totalScore: exactTotal,
        isPassed: exactTotal >= 60.0,
      },
      weights: resolved.weights,
      isCustom: resolved.isCustom,
    };
  }, [student, activeGradeOption, currentClassEntity, gradeWeightsMap, customWeight, allGrades, grade, allCourses, transferRecords]);

  // Available classes & terms in attendance records for dropdowns
  const availableHistoryClasses = useMemo(() => {
    const set = new Set<string>();
    history.dailyRecords.forEach((r) => {
      if (r.className) set.add(r.className);
    });
    return Array.from(set);
  }, [history.dailyRecords]);

  // Filtered daily records
  const filteredDailyRecords = useMemo(() => {
    const selectedTermObj = filterTermId !== 'ALL' ? terms.find((t) => t.id === filterTermId) : undefined;
    const termClassNames = new Set(
      filterTermId !== 'ALL'
        ? classes
            .filter(
              (c) =>
                c.termId === filterTermId ||
                (selectedTermObj && c.term === selectedTermObj.name)
            )
            .map((c) => c.name)
        : []
    );

    return history.dailyRecords.filter((rec) => {
      if (filterStartDate && rec.date < filterStartDate) return false;
      if (filterEndDate && rec.date > filterEndDate) return false;
      if (filterClassName !== 'ALL' && rec.className !== filterClassName) return false;

      if (filterTermId !== 'ALL') {
        const matchesTermClass = termClassNames.has(rec.className);
        const matchesTermDates =
          selectedTermObj &&
          selectedTermObj.startDate &&
          selectedTermObj.endDate &&
          rec.date >= selectedTermObj.startDate &&
          rec.date <= selectedTermObj.endDate;
        if (!matchesTermClass && !matchesTermDates) return false;
      }

      if (filterStatus !== 'ALL') {
        const isCancelled = Boolean(rec.isCancelled || rec.statusSummary.includes('停課'));
        if (filterStatus === 'cancelled') {
          if (!isCancelled) return false;
        } else {
          if (isCancelled) return false;
          const pList = [rec.period1, rec.period2, rec.period3, rec.period4].slice(0, rec.periodsCount);
          if (filterStatus === 'present' && rec.presentHours === 0) return false;
          if (filterStatus === 'leave' && rec.leaveHours === 0 && !pList.includes('leave')) return false;
          if (filterStatus === 'absent' && rec.absentHours === 0 && !pList.includes('absent')) return false;
        }
      }

      return true;
    });
  }, [history.dailyRecords, filterStartDate, filterEndDate, filterTermId, filterClassName, filterStatus, terms, classes]);

  const filteredStats = useMemo(() => {
    let expectedHours = 0;
    let presentHours = 0;
    let leaveHours = 0;
    let absentHours = 0;
    let has4Periods = false;

    filteredDailyRecords.forEach((rec) => {
      if (rec.periodsCount >= 4) has4Periods = true;
      if (rec.isCancelled || rec.statusSummary.includes('停課')) return;
      expectedHours += rec.totalHours || 0;
      presentHours += rec.presentHours || 0;
      leaveHours += rec.leaveHours || 0;
      absentHours += rec.absentHours || 0;
    });

    const attendanceRate =
      expectedHours > 0 ? Math.round((presentHours / expectedHours) * 1000) / 10 : 100;

    return {
      expectedHours,
      presentHours,
      leaveHours,
      absentHours,
      attendanceRate,
      has4Periods,
    };
  }, [filteredDailyRecords]);

  // Student-scoped attendance audit logs
  const studentAuditLogs = useMemo(() => {
    if (!student) return [];
    return (auditLogs || [])
      .filter((log) => String(log.studentId) === String(student.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [auditLogs, student]);

  // Live certificate attendance calculation when cert modal open
  const certStats = useMemo(() => {
    if (!student) {
      return { weeklyHours: 15, expectedHours: 0, leaveHours: 0, absentHours: 0, actualHours: 0, validSessionCount: 0 };
    }
    return computeCertificateAttendanceStats({
      student,
      allCourses,
      classes,
      transferRecords,
      recordStartDate: certRecStartDate,
      recordEndDate: certRecEndDate,
    });
  }, [student, allCourses, classes, transferRecords, certRecStartDate, certRecEndDate]);

  useEffect(() => {
    if (isCertModalOpen) {
      setCertWeeklyHours(certStats.weeklyHours);
    }
  }, [isCertModalOpen, certStats.weeklyHours]);

  if (!student) return null;

  const effectiveGrade = activeGradeContext.effectiveGrade;
  const wAtt = activeGradeContext.weights.attendanceWeight;
  const wQuiz = activeGradeContext.weights.quizWeight;
  const wMid = activeGradeContext.weights.midtermWeight;
  const wFin = activeGradeContext.weights.finalWeight;
  const wHw = activeGradeContext.weights.homeworkWeight;
  const wAttid = activeGradeContext.weights.attitudeWeight;

  const attendanceWeighted = effectiveGrade ? Math.round(effectiveGrade.attendanceScore * (wAtt / 100) * 100) / 100 : 0;
  const quizWeighted = effectiveGrade ? Math.round(effectiveGrade.quizScore * (wQuiz / 100) * 100) / 100 : 0;
  const midtermWeighted = effectiveGrade ? Math.round(effectiveGrade.midtermScore * (wMid / 100) * 100) / 100 : 0;
  const finalWeighted = effectiveGrade ? Math.round(effectiveGrade.finalScore * (wFin / 100) * 100) / 100 : 0;
  const homeworkWeighted = effectiveGrade ? Math.round(effectiveGrade.homeworkScore * (wHw / 100) * 100) / 100 : 0;
  const attitudeWeighted = effectiveGrade ? Math.round(effectiveGrade.attitudeScore * (wAttid / 100) * 100) / 100 : 0;

  const handleOpenCertModal = () => {
    const sortedDates = history.dailyRecords
      .filter((r) => !r.isCancelled)
      .map((r) => r.date)
      .sort();
    const defaultRecStart =
      sortedDates[0] || currentClassEntity?.startDate || currentTermEntity?.startDate || student.registrationStartDate || '';
    const defaultRecEnd =
      sortedDates[sortedDates.length - 1] || currentClassEntity?.endDate || getTodayDateStr();

    setCertStudentName(student.name);
    setCertEnglishWithTitle(buildDefaultEnglishWithTitle(student));
    setCertNationalityLabel(buildDefaultNationalityLabel(student.nationality));
    setCertRegStartDate(student.registrationStartDate || '');
    setCertRegEndDate(student.registrationEndDate || '');
    setCertRecStartDate(defaultRecStart);
    setCertRecEndDate(defaultRecEnd);
    setCertIssueDate(getTodayDateStr());
    setIsCertModalOpen(true);
  };

  const handleExportXlsx = () => {
    const termLabel =
      filterTermId === 'ALL'
        ? '全部學期'
        : terms.find((t) => t.id === filterTermId)?.name || filterTermId;
    const statusMap: Record<string, string> = {
      ALL: '全部狀態',
      present: '含出席紀錄',
      leave: '含請假紀錄',
      absent: '含曠課缺席',
      cancelled: '僅停課免點名',
    };
    exportStudentAttendanceToXlsx({
      student,
      records: filteredDailyRecords,
      filterSummary: {
        startDate: filterStartDate,
        endDate: filterEndDate,
        termLabel,
        classLabel: filterClassName === 'ALL' ? '全部班級' : filterClassName,
        statusLabel: statusMap[filterStatus] || filterStatus,
      },
      summaryStats: filteredStats,
    });
    onShowToast?.('已匯出 Excel (.xlsx) 出缺席明細報表！', 'success');
  };

  const handleDownloadCertificateDocx = async () => {
    setIsGeneratingDocx(true);
    try {
      await downloadCertificateDocx({
        studentName: certStudentName.trim() || student.name,
        englishNameWithTitle: certEnglishWithTitle.trim() || buildDefaultEnglishWithTitle(student),
        nationalityLabel: certNationalityLabel.trim() || buildDefaultNationalityLabel(student.nationality),
        registrationStartDate: certRegStartDate,
        registrationEndDate: certRegEndDate,
        recordStartDate: certRecStartDate,
        recordEndDate: certRecEndDate,
        weeklyHours: Number(certWeeklyHours) || 0,
        expectedHours: certStats.expectedHours,
        leaveHours: certStats.leaveHours,
        absentHours: certStats.absentHours,
        actualHours: certStats.actualHours,
        issueDate: certIssueDate || getTodayDateStr(),
        studentNumber: student.studentNumber,
      });
      onShowToast?.('已產生並下載「在學證明書暨出席記錄表」(.docx)！', 'success');
    } catch (err: any) {
      onShowToast?.(`產生證明書失敗：${err?.message || '未知錯誤'}`, 'error');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const hasActiveFilters =
    Boolean(filterStartDate) ||
    Boolean(filterEndDate) ||
    filterTermId !== 'ALL' ||
    filterClassName !== 'ALL' ||
    filterStatus !== 'ALL';

  const issueDatesPreview = formatBilingualIssueDate(certIssueDate || getTodayDateStr());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 sm:p-6 relative">
          <button
            id="btn-close-student-modal"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-colors"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-5 pr-10">
            <StudentAvatar
              avatarUrl={student.avatarUrl}
              name={student.name}
              sizeClassName="w-16 h-16 sm:w-20 sm:h-20"
              className="rounded-2xl border-2 border-teal-400/80 shadow-md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{student.name}</h2>
                {student.englishName && (
                  <span className="text-xs sm:text-sm font-semibold text-slate-300">({student.englishName})</span>
                )}
                <span className="text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded-md">
                  {student.studentNumber}
                </span>
                <span className="text-xs font-bold bg-slate-700 text-slate-200 px-2 py-0.5 rounded-md">
                  {student.nationality || '未設定'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mt-2">
                <span className="flex items-center">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5 text-teal-400 shrink-0" />
                  <span>
                    班級：<strong className="text-white ml-1 font-semibold">{student.className || '尚未分班'}</strong>
                  </span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="flex items-center">
                  <GraduationCap className="w-3.5 h-3.5 mr-1.5 text-teal-400 shrink-0" />
                  <span>
                    授課教師：<strong className="text-white ml-1 font-semibold">{resolvedTeacherName}</strong>
                  </span>
                </span>
                {student.email && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span className="text-slate-400 truncate">{student.email}</span>
                  </>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="shrink-0 pt-1 sm:pt-0 w-full sm:w-auto">
                <button
                  id="btn-open-certificate-modal"
                  type="button"
                  onClick={handleOpenCertModal}
                  className="w-full sm:w-auto justify-center inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
                >
                  <Award className="w-4 h-4 shrink-0" />
                  <span>產生在學證明書暨出席記錄表</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {/* 0. 學生基本學籍與註冊起訖資訊（真實資料庫欄位） */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <IdCard className="w-4 h-4 text-[#536B7A] shrink-0" />
                <span>學生基本學籍與註冊資料</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                學籍狀態：{student.enrollmentStatus === 'graduated' ? '已結業' : student.enrollmentStatus === 'suspended' ? '休學中' : student.enrollmentStatus === 'withdrawn' ? '已退學' : '在學中'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 text-xs">
              <div className="min-w-0 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">學號</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{student.studentNumber || '未設定'}</div>
              </div>
              <div className="min-w-0 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">護照／證件號碼</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{student.passportNumber || student.idno || '未設定'}</div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">所屬班級</div>
                <div className="font-bold text-slate-900 mt-0.5 truncate" title={student.className || '尚未分班'}>
                  {student.className || '尚未分班'}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">學期與學年</div>
                <div className="font-bold text-slate-900 mt-0.5 truncate">
                  {currentTermEntity ? `${currentTermEntity.name} (${currentTermEntity.termCode})` : currentClassEntity?.term || '未設定'}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">註冊起日</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">
                  {student.registrationStartDate || '未設定'}
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-[11px] text-slate-500 font-semibold">註冊迄日</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">
                  {student.registrationEndDate || '未設定'}
                </div>
              </div>
            </div>

            {/* Enrollment & Transfer Timeline */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
                <span>
                  入班／入學日期：<strong className="font-mono text-slate-800">{student.joinedAt || student.admissionDate || '未設定'}</strong>
                </span>
                <span>
                  離班／退班日期：<strong className="font-mono text-slate-800">{student.droppedAt || '在籍中'}</strong>
                </span>
              </div>

              {studentTransfers.length > 0 && (
                <div className="mt-1 space-y-1">
                  <div className="text-[11px] font-bold text-slate-600 flex items-center space-x-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#536B7A]" />
                    <span>歷史轉班／分班紀錄 ({studentTransfers.length} 筆)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {studentTransfers.map((tr) => (
                      <span
                        key={tr.id}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-700"
                      >
                        <span className="font-mono font-semibold text-slate-800">{tr.transferDate}</span>
                        <span>{tr.fromClassName || '未分班'} → <strong>{tr.toClassName}</strong></span>
                        {tr.reason && <span className="text-slate-500">({tr.reason})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 1. 出席統計 Summary Cards */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  出席統計總覽
                  {currentTermEntity?.name ? ` (${currentTermEntity.name})` : currentClassEntity?.term ? ` (${currentClassEntity.term})` : ''}
                </span>
              </h3>
              <span className="text-xs font-bold text-slate-500">
                目標總時數：{history.requiredHours || student.totalRequiredHours || currentClassEntity?.totalTargetHours || 0} 小時
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500">應修總時數</span>
                <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                  {history.requiredHours} <span className="text-xs font-normal">H</span>
                </div>
                <span className="text-[10px] text-slate-400">學季目標</span>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500">已上課時數</span>
                <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                  {history.completedHours} <span className="text-xs font-normal">H</span>
                </div>
                <span className="text-[10px] text-slate-400">截至今日累積</span>
              </div>

              <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-800">出席時數</span>
                <div className="text-xl font-black text-emerald-700 mt-1 font-mono">
                  {history.presentHours} <span className="text-xs font-normal">H</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium">實際在堂</span>
              </div>

              <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200 shadow-2xs">
                <span className="text-[11px] font-bold text-blue-800">請假時數</span>
                <div className="text-xl font-black text-blue-700 mt-1 font-mono">
                  {history.leaveHours} <span className="text-xs font-normal">H</span>
                </div>
                <span className="text-[10px] text-blue-600 font-medium">核准假單</span>
              </div>

              <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200 shadow-2xs">
                <span className="text-[11px] font-bold text-rose-800">曠課缺席</span>
                <div className="text-xl font-black text-rose-700 mt-1 font-mono">
                  {history.absentHours} <span className="text-xs font-normal">H</span>
                </div>
                <span className="text-[10px] text-rose-600 font-medium">無故未到</span>
              </div>

              <div
                className={`p-3.5 rounded-2xl border shadow-2xs ${
                  history.attendanceRate >= 90
                    ? 'bg-teal-50 border-teal-200 text-teal-900'
                    : history.attendanceRate >= 80
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold">目前實際出席率</span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/70">純到課</span>
                </div>
                <div className="text-2xl font-black mt-0.5 font-mono">{history.attendanceRate}%</div>
                <span className="text-[10px] font-semibold block">
                  {history.attendanceRate >= 90
                    ? '良好'
                    : history.attendanceRate >= 80
                    ? '接近警示線'
                    : '出席率過低 (<80%)'}
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  實到 {history.presentHours}H ÷ 應到 {history.completedHours}H
                </span>
              </div>
            </div>

            {effectiveGrade && (
              <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-md font-bold bg-teal-100 text-teal-800 text-[11px] shrink-0">
                    公式區隔
                  </span>
                  <span className="text-slate-600 font-medium">
                    <strong>實際出席率</strong>（{history.attendanceRate}%，請假計0%）與<strong>學期出席成績</strong>（
                    {effectiveGrade.attendanceScore}分，請假折算50%）依中心規範分開計算。
                  </span>
                </div>
                <div className="text-slate-500 font-mono text-[11px] self-end sm:self-auto shrink-0 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                  出席評分：<strong className="text-teal-900 font-bold">{effectiveGrade.attendanceScore} 分</strong>
                </div>
              </div>
            )}
          </div>

          {/* 2. 成績與計算明細 (Multi-class / Multi-term Grade Selector) */}
          {effectiveGrade && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
                    <Calculator className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>學期成績計算明細 (各項佔比合計 100%)</span>
                    {activeGradeContext.isCustom && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        個別自訂權重
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    出席成績依實際出缺席自動產生；切換班級／學期可檢視該班對應之原始成績與權重配分。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  {gradeClassOptions.length > 0 && (
                    <select
                      aria-label="選擇成績對應班級與學期"
                      value={activeGradeOption?.classId || ''}
                      onChange={(e) => setSelectedGradeClassId(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 text-base sm:text-xs font-semibold border border-slate-300 rounded-xl bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#536B7A]/30"
                    >
                      {gradeClassOptions.map((opt) => (
                        <option key={opt.classId} value={opt.classId}>
                          {opt.className}
                          {opt.termName ? ` (${opt.termName})` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="flex items-center space-x-3 bg-slate-900 text-white px-4 py-2 rounded-xl">
                    <span className="text-xs text-slate-300 font-medium">總成績：</span>
                    <span className="text-2xl font-black text-teal-400 font-mono">{effectiveGrade.totalScore}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 text-xs">
                <div className="bg-teal-50/50 p-3 rounded-xl border border-teal-100">
                  <div className="font-bold text-teal-900 flex flex-wrap items-center justify-between gap-1">
                    <span>出席成績 ({wAtt}%)</span>
                    <span className="text-[10px] text-teal-700 font-semibold">折算50%假單</span>
                  </div>
                  <div className="text-base font-extrabold text-teal-950 font-mono mt-1">
                    {effectiveGrade.attendanceScore} 分
                  </div>
                  <div className="text-[11px] text-teal-700 mt-1 font-mono">
                    {effectiveGrade.attendanceScore} × {wAtt}% = <strong className="text-teal-950 font-bold">{attendanceWeighted}</strong>
                  </div>
                  <div className="text-[10px] text-teal-600 mt-0.5">出席1.0 + 請假0.5</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">平時考 ({wQuiz}%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">{effectiveGrade.quizScore} 分</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {effectiveGrade.quizScore} × {wQuiz}% = <strong className="text-slate-900 font-bold">{quizWeighted}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">期中考 ({wMid}%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">{effectiveGrade.midtermScore} 分</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {effectiveGrade.midtermScore} × {wMid}% = <strong className="text-slate-900 font-bold">{midtermWeighted}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">期末考 ({wFin}%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">{effectiveGrade.finalScore} 分</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {effectiveGrade.finalScore} × {wFin}% = <strong className="text-slate-900 font-bold">{finalWeighted}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">作業 ({wHw}%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">{effectiveGrade.homeworkScore} 分</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {effectiveGrade.homeworkScore} × {wHw}% = <strong className="text-slate-900 font-bold">{homeworkWeighted}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">學習態度 ({wAttid}%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">{effectiveGrade.attitudeScore} 分</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {effectiveGrade.attitudeScore} × {wAttid}% = <strong className="text-slate-900 font-bold">{attitudeWeighted}</strong>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 bg-slate-100/80 p-2.5 rounded-xl text-xs text-slate-600 font-mono flex flex-wrap items-center justify-between gap-2">
                <span>
                  總分公式：{attendanceWeighted} + {quizWeighted} + {midtermWeighted} + {finalWeighted} + {homeworkWeighted} +{' '}
                  {attitudeWeighted} = <strong className="text-slate-900">{effectiveGrade.totalScore}</strong> 分
                </span>
                <span className="text-[11px] text-slate-400">更新時間：{effectiveGrade.updatedAt || '未記錄'}</span>
              </div>
            </div>
          )}

          {/* 3. 多條件歷史出缺席查詢與匯出 (Multi-filter Historical Attendance) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>
                      每日詳細點名紀錄 ({filteredDailyRecords.length}
                      {hasActiveFilters ? ` / ${history.dailyRecords.length}` : ''} 堂)
                    </span>
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    可依日期區間、學期／學年、班級及出缺席狀態即時篩選並匯出 Excel (.xlsx) 或 CSV
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    id="btn-export-student-xlsx"
                    type="button"
                    onClick={handleExportXlsx}
                    className="flex-1 sm:flex-none justify-center inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span>匯出篩選結果 (Excel .xlsx)</span>
                  </button>

                  {filteredDailyRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => exportIndividualStudentAttendanceToCsv(student, filteredDailyRecords)}
                      className="flex-1 sm:flex-none justify-center inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-2xs transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>匯出 CSV</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-200/70">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">起始日期</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">結束日期</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">學期／學年</label>
                  <select
                    value={filterTermId}
                    onChange={(e) => setFilterTermId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">全部學期</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">上課班級</label>
                  <select
                    value={filterClassName}
                    onChange={(e) => setFilterClassName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">全部班級</option>
                    {availableHistoryClasses.map((cn) => (
                      <option key={cn} value={cn}>
                        {cn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">出席狀態</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">全部狀態</option>
                    <option value="present">含出席</option>
                    <option value="leave">含請假</option>
                    <option value="absent">含曠課缺席</option>
                    <option value="cancelled">停課免點名</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterTermId('ALL');
                      setFilterClassName('ALL');
                      setFilterStatus('ALL');
                    }}
                    disabled={!hasActiveFilters}
                    className="w-full inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重設條件</span>
                  </button>
                </div>
              </div>

              {/* Live Filtered Summary Bar */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-600">
                <span className="inline-flex items-center font-bold text-slate-800">
                  <Filter className="w-3 h-3 mr-1 text-teal-600" />
                  篩選統計：
                </span>
                <span>
                  應上課 <strong className="font-mono text-slate-900">{filteredStats.expectedHours}</strong> H
                </span>
                <span>
                  出席 <strong className="font-mono text-emerald-700">{filteredStats.presentHours}</strong> H
                </span>
                <span>
                  請假 <strong className="font-mono text-blue-700">{filteredStats.leaveHours}</strong> H
                </span>
                <span>
                  曠課 <strong className="font-mono text-rose-700">{filteredStats.absentHours}</strong> H
                </span>
                <span>
                  出席率 <strong className="font-mono text-teal-800">{filteredStats.attendanceRate}%</strong>
                </span>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">日期</th>
                    <th className="py-2.5 px-3">上課班級</th>
                    <th className="py-2.5 px-3">課程名稱</th>
                    <th className="py-2.5 px-3 text-center">第 1 節</th>
                    <th className="py-2.5 px-3 text-center">第 2 節</th>
                    <th className="py-2.5 px-3 text-center">第 3 節</th>
                    {filteredStats.has4Periods && <th className="py-2.5 px-3 text-center">第 4 節</th>}
                    <th className="py-2.5 px-3 text-center">總計</th>
                    <th className="py-2.5 px-3">備註事由</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDailyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={filteredStats.has4Periods ? 9 : 8} className="py-8 text-center text-slate-400">
                        {hasActiveFilters ? '查無符合篩選條件的點名紀錄' : '尚無已完成點名之紀錄'}
                      </td>
                    </tr>
                  ) : (
                    filteredDailyRecords.map((rec, index) => {
                      const is3H = rec.periodsCount >= 3;
                      const is4H = rec.periodsCount >= 4;
                      const isCancelled = rec.isCancelled || rec.statusSummary.includes('停課');

                      const renderBadge = (status?: string) => (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                            status === 'present'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'leave'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {status === 'present' ? '出席' : status === 'leave' ? '請假' : '缺席'}
                        </span>
                      );

                      return (
                        <tr
                          key={`${rec.date}_${rec.className}_${index}`}
                          className={`hover:bg-slate-50/80 ${
                            isCancelled
                              ? 'bg-slate-50/60 text-slate-400'
                              : rec.absentHours > 0
                              ? 'bg-rose-50/30'
                              : rec.leaveHours > 0
                              ? 'bg-blue-50/20'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{rec.date}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs font-mono">
                              {rec.className}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{rec.courseName}</td>
                          <td className="py-2.5 px-3 text-center">
                            {isCancelled ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                停課
                              </span>
                            ) : (
                              renderBadge(rec.period1)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isCancelled ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                停課
                              </span>
                            ) : (
                              renderBadge(rec.period2)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isCancelled ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                停課
                              </span>
                            ) : is3H ? (
                              renderBadge(rec.period3)
                            ) : (
                              <span className="text-slate-300 font-mono">-</span>
                            )}
                          </td>
                          {filteredStats.has4Periods && (
                            <td className="py-2.5 px-3 text-center">
                              {isCancelled ? (
                                <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  停課
                                </span>
                              ) : is4H ? (
                                renderBadge(rec.period4)
                              ) : (
                                <span className="text-slate-300 font-mono">-</span>
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-center font-semibold">
                            {isCancelled ? (
                              <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                停課（不計出缺勤）
                              </span>
                            ) : (
                              <span
                                className={
                                  rec.absentHours > 0 ? 'text-rose-600' : rec.leaveHours > 0 ? 'text-blue-600' : 'text-emerald-600'
                                }
                              >
                                {rec.statusSummary}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 truncate max-w-[180px]" title={rec.remarks || ''}>
                            {isCancelled ? (
                              <span className="text-[11px] text-slate-500 font-medium">{rec.remarks || '停課免點名'}</span>
                            ) : rec.isDefaultPresent && !rec.remarks ? (
                              <span className="inline-flex items-center text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                系統預設到課
                              </span>
                            ) : (
                              rec.remarks || '-'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 個人點名異動稽核紀錄 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <History className="w-4 h-4 text-[#536B7A] shrink-0" />
                <span>點名異動稽核紀錄 ({studentAuditLogs.length} 筆)</span>
              </h3>
              <span className="text-[11px] text-slate-500">顯示該學生所有節次狀態修改與補點名異動軌跡</span>
            </div>

            {studentAuditLogs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">此學生目前尚無點名異動稽核紀錄</div>
            ) : (
              <div className="max-h-56 overflow-y-auto overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[620px] text-left text-xs border-collapse">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-2 px-3">異動時間</th>
                      <th className="py-2 px-3">上課日期 / 班級</th>
                      <th className="py-2 px-3">變更前</th>
                      <th className="py-2 px-3">變更後</th>
                      <th className="py-2 px-3">原因 / 備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentAuditLogs.map((log) => {
                      const clsName =
                        log.className ||
                        (log.classId ? classes.find((c) => String(c.id) === String(log.classId))?.name : undefined) ||
                        '—';
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {log.createdAt ? log.createdAt.slice(0, 19).replace('T', ' ') : '—'}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono font-semibold text-slate-800">{log.sessionDate || '—'}</span>
                            <span className="ml-1.5 text-[11px] text-slate-500">{clsName}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                            {formatAuditSnapshot(log.oldValue, [
                              log.oldPeriod1,
                              log.oldPeriod2,
                              log.oldPeriod3,
                              log.oldPeriod4,
                            ])}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] font-bold text-teal-700">
                            {formatAuditSnapshot(log.newValue, [
                              log.newPeriod1,
                              log.newPeriod2,
                              log.newPeriod3,
                              log.newPeriod4,
                            ])}
                          </td>
                          <td className="py-2 px-3 text-slate-700">{log.reason || '點名狀態變更'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <span className="text-xs text-slate-500 text-center sm:text-left">
            華語教學中心教務管理處 • 學生個人學籍檔案
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors text-center"
          >
            關閉視窗
          </button>
        </div>
      </div>

      {/* Admin Certificate Preview & Export Modal */}
      {isAdmin && isCertModalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setIsCertModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-[#26313B] text-white flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <Award className="w-5 h-5 text-teal-300 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">產生在學證明書暨出席記錄表 (.docx)</h3>
                  <p className="text-[11px] text-slate-300">
                    依記錄期間自動帶入應上課、請假、曠課及實際上課時數，可於匯出前核對或微調欄位
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCertModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50">
              {(!certRegStartDate || !certRegEndDate) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-2 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    該生資料庫尚未設定註冊起訖日期，可於下方手動填入後再匯出，或保留為「未設定」。
                  </span>
                </div>
              )}

              {/* Editable Form */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">中文姓名</label>
                  <input
                    type="text"
                    value={certStudentName}
                    onChange={(e) => setCertStudentName(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">稱謂及英文姓名</label>
                  <input
                    type="text"
                    value={certEnglishWithTitle}
                    onChange={(e) => setCertEnglishWithTitle(e.target.value)}
                    placeholder="例如 Mr. Wang, Da-Ming"
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">國籍身分別稱呼</label>
                  <input
                    type="text"
                    value={certNationalityLabel}
                    onChange={(e) => setCertNationalityLabel(e.target.value)}
                    placeholder="例如 菲律賓籍生"
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">註冊起日</label>
                  <input
                    type="date"
                    value={certRegStartDate}
                    onChange={(e) => setCertRegStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">註冊迄日</label>
                  <input
                    type="date"
                    value={certRegEndDate}
                    onChange={(e) => setCertRegEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">開立日期 (Issue Date)</label>
                  <input
                    type="date"
                    value={certIssueDate}
                    onChange={(e) => setCertIssueDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>記錄期間（起）</span>
                  </label>
                  <input
                    type="date"
                    value={certRecStartDate}
                    onChange={(e) => setCertRecStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>記錄期間（迄）</span>
                  </label>
                  <input
                    type="date"
                    value={certRecEndDate}
                    onChange={(e) => setCertRecEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">每週上課時數</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={40}
                    value={certWeeklyHours}
                    onChange={(e) => setCertWeeklyHours(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Document Live Bilingual Preview */}
              <div className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-10 shadow-sm text-black max-w-3xl mx-auto font-serif">
                <div className="text-center space-y-1 mb-6">
                  <div className="text-lg sm:text-2xl font-bold tracking-wider">在學證明書暨出席記錄表</div>
                  <div className="text-base sm:text-xl font-bold">Certificate of Study &amp; Attendance Record</div>
                </div>

                <p className="text-sm sm:text-base leading-relaxed mb-5">
                  茲證明 {certStudentName || student.name} ({certEnglishWithTitle})為{certNationalityLabel}
                  至本校華語文教學中心學習中國文化和語言。註冊起訖日期自{' '}
                  {certRegStartDate ? formatChineseDateLong(certRegStartDate) : '未設定'} 至{' '}
                  {certRegEndDate ? formatChineseDateLong(certRegEndDate) : '未設定'} 止。
                </p>

                <div className="text-xs sm:text-sm mb-2">該生出席記錄如下：</div>

                <div className="overflow-x-auto mb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full min-w-[520px] border-collapse border border-black text-center text-xs sm:text-sm">
                    <thead>
                      <tr>
                        <th className="border border-black py-2 px-2 font-normal">記錄期間</th>
                        <th className="border border-black py-2 px-2 font-normal">每週上課時數</th>
                        <th className="border border-black py-2 px-2 font-normal">應上課時數</th>
                        <th className="border border-black py-2 px-2 font-normal">請假時數</th>
                        <th className="border border-black py-2 px-2 font-normal">曠課時數</th>
                        <th className="border border-black py-2 px-2 font-normal">實際上課時數</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-black py-2.5 px-2 font-mono">
                          {formatDotDate(certRecStartDate)}~{formatDotDate(certRecEndDate)}
                        </td>
                        <td className="border border-black py-2.5 px-2">{certWeeklyHours}</td>
                        <td className="border border-black py-2.5 px-2">{certStats.expectedHours}</td>
                        <td className="border border-black py-2.5 px-2">{certStats.leaveHours}</td>
                        <td className="border border-black py-2.5 px-2">{certStats.absentHours}</td>
                        <td className="border border-black py-2.5 px-2 font-bold">{certStats.actualHours}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="text-sm sm:text-base mb-10">特此證明</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
                  <div className="flex justify-start sm:justify-center">
                    <img
                      src="/assets/stamps/clec_seal.png"
                      alt="靜宜大學華語文教學中心章"
                      className="h-24 w-auto object-contain"
                    />
                  </div>
                  <div className="text-center space-y-2 text-sm sm:text-base">
                    <div>華語文教學中心主任</div>
                    <div className="flex items-center justify-center space-x-2">
                      <span>林子敬</span>
                      <img
                        src="/assets/stamps/director_stamp.png"
                        alt="林子敬主任章"
                        className="h-8 w-auto object-contain inline-block"
                      />
                    </div>
                    <div>Director Dr. Tzu-Ching Lin</div>
                    <div>{issueDatesPreview.english}</div>
                    <div>{issueDatesPreview.chinese}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-white border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <span className="text-[11px] text-slate-500 text-center sm:text-left">
                已依有效課堂統計（排除停課）：共 {certStats.validSessionCount} 堂，實際 = 應上課 − 請假 − 曠課
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsCertModalOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 sm:border-transparent rounded-xl text-center"
                >
                  取消
                </button>
                <button
                  id="btn-download-certificate-docx"
                  type="button"
                  onClick={handleDownloadCertificateDocx}
                  disabled={isGeneratingDocx}
                  className="flex-1 sm:flex-none justify-center inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-[#26313B] hover:bg-[#1a2229] rounded-xl disabled:opacity-50 whitespace-nowrap"
                >
                  {isGeneratingDocx ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>產生中...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>匯出 Word (.docx)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
