import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Calculator, 
  Save, 
  Download, 
  Users, 
  Sparkles, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Search,
  Filter,
  BarChart3,
  UserX
} from 'lucide-react';
import { Student, StudentGrade, CourseSession, TransferClassRecord, StudentGradeWeight, ClassEntity, Term } from '../types';
import {
  GRADE_WEIGHTS,
  calculateStudentAttendanceScore,
  calculateProvisionalTotalGrade,
} from '../utils/gradeUtils';
import { formatAttendanceScore, formatTotalGradeDisplay } from '../utils/reportUtils';
import { resolveStudentGradeWeight } from '../lib/gradeWeightService';
import { exportGradesToCsv } from '../utils/csvExport';
import { StudentAvatar } from './StudentAvatar';
import { InfoTooltip } from './common/InfoTooltip';

interface GradeManagementViewProps {
  students: Student[];
  allCourses: CourseSession[];
  allGrades: Record<string, StudentGrade>;
  gradeWeightsMap?: Record<string, StudentGradeWeight>;
  onUpdateGrades: (updatedGrades: Record<string, StudentGrade>) => void;
  onSelectStudentForDetail: (student: Student) => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  currentClassName: string;
  onSelectClass: (className: string) => void;
  availableClasses: string[];
  transferRecords?: TransferClassRecord[];
  allClasses?: ClassEntity[];
  allTerms?: Term[];
  onReloadGradeWeights?: (termId?: string) => Promise<void>;
}

export const GradeManagementView: React.FC<GradeManagementViewProps> = ({
  students,
  allCourses,
  allGrades,
  gradeWeightsMap = {},
  onUpdateGrades,
  onSelectStudentForDetail,
  onShowToast,
  currentClassName,
  onSelectClass,
  availableClasses,
  transferRecords,
  allClasses = [],
  allTerms = [],
  onReloadGradeWeights,
}) => {
  const [localGrades, setLocalGrades] = useState<Record<string, StudentGrade>>(allGrades);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Identify current class entity and current term entity
  const currentClassObj = useMemo(() => {
    return allClasses.find((c) => c.name === currentClassName || c.id === currentClassName);
  }, [allClasses, currentClassName]);

  const currentTermObj = useMemo(() => {
    if (currentClassObj?.termId && allTerms.length > 0) {
      const match = allTerms.find((t) => t.id === currentClassObj.termId);
      if (match) return match;
    }
    return allTerms.find((t) => t.isActive && !t.isLocked) || allTerms[0];
  }, [allTerms, currentClassObj]);

  // When class switches or component loads, ensure weights for the class's term are loaded
  useEffect(() => {
    const targetTermId = currentClassObj?.termId || currentTermObj?.id;
    if (targetTermId && onReloadGradeWeights) {
      onReloadGradeWeights(targetTermId);
    }
  }, [currentClassObj?.termId, currentTermObj?.id, onReloadGradeWeights]);

  // Sync if allGrades changes from parent
  useEffect(() => {
    setLocalGrades(allGrades);
  }, [allGrades]);

  // If currentClassName is not in availableClasses, auto-sync to the first available class
  useEffect(() => {
    if (availableClasses && availableClasses.length > 0 && !availableClasses.includes(currentClassName)) {
      onSelectClass(availableClasses[0]);
    }
  }, [availableClasses, currentClassName, onSelectClass]);

  // Filter students by selected class
  const classStudents = useMemo(() => {
    return students.filter((s) => s.className === currentClassName || s.classId === currentClassName);
  }, [students, currentClassName]);

  // Filter by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return classStudents;
    const q = searchQuery.toLowerCase();
    return classStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.englishName.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q)
    );
  }, [classStudents, searchQuery]);

  // Helper to dynamically calculate real attendance score from attendance records (no fake 100 fallback)
  const getStudentAttendanceData = useCallback(
    (studentId: string, studentClassName?: string) => {
      const student = students.find((s) => s.id === studentId);
      const attResult = calculateStudentAttendanceScore(
        studentId,
        allCourses,
        studentClassName || currentClassName,
        student,
        transferRecords,
        {
          classId: currentClassObj?.id,
          className: studentClassName || currentClassName,
          termId: currentClassObj?.termId || currentTermObj?.id,
          classes: allClasses,
          terms: allTerms,
        }
      );
      return {
        attResult,
        attendanceScore: attResult.hasRecords ? attResult.attendanceScore : null,
      };
    },
    [students, allCourses, currentClassName, transferRecords, currentClassObj?.id, currentClassObj?.termId, currentTermObj?.id, allClasses, allTerms]
  );

  // Handler for numerical input changes (supports clearing to null)
  const handleScoreChange = (
    studentId: string,
    studentName: string,
    field: 'quizScore' | 'midtermScore' | 'finalScore' | 'homeworkScore' | 'attitudeScore',
    valueStr: string
  ) => {
    let val: number | null = null;
    if (valueStr.trim() !== '') {
      const parsed = parseFloat(valueStr);
      if (!isNaN(parsed)) {
        val = Math.min(100, Math.max(0, parsed));
      }
    }

    const targetClassId = currentClassObj?.id || students.find((s) => s.id === studentId)?.classId;
    const gradeKey = targetClassId ? `${studentId}_${targetClassId}` : studentId;

    const { attendanceScore, attResult } = getStudentAttendanceData(studentId, currentClassName);
    const weightRes = resolveStudentGradeWeight(studentId, currentClassObj?.termId, gradeWeightsMap);

    setLocalGrades((prev) => {
      const existing = prev[gradeKey] || prev[studentId] || {
        studentId,
        studentName,
        className: currentClassName,
        classId: targetClassId,
        attendanceScore,
        quizScore: null,
        midtermScore: null,
        finalScore: null,
        homeworkScore: null,
        attitudeScore: null,
        totalScore: null,
        hasAttendanceData: attResult.hasRecords,
        hasSavedGrade: false,
      };

      const updated: StudentGrade = {
        ...existing,
        classId: targetClassId || existing.classId,
        className: currentClassName,
        attendanceScore,
        hasAttendanceData: attResult.hasRecords,
        hasSavedGrade: true,
        [field]: val,
      };

      const provisional = calculateProvisionalTotalGrade(
        {
          attendanceScore: updated.attendanceScore,
          quizScore: updated.quizScore,
          midtermScore: updated.midtermScore,
          finalScore: updated.finalScore,
          homeworkScore: updated.homeworkScore,
          attitudeScore: updated.attitudeScore,
        },
        weightRes.weights
      );
      updated.totalScore = provisional.totalScore;
      updated.isEstimated = provisional.isEstimated;
      updated.missingItems = provisional.missingItems;

      return {
        ...prev,
        [gradeKey]: updated,
        [studentId]: updated,
      };
    });

    setHasUnsavedChanges(true);
  };

  // Save handler: guarantees real attendanceScore and recalculated totalScore without inventing missing scores
  const handleSave = () => {
    const syncedGrades: Record<string, StudentGrade> = { ...localGrades };
    classStudents.forEach((s) => {
      const targetClassId = currentClassObj?.id || s.classId;
      const gradeKey = targetClassId ? `${s.id}_${targetClassId}` : s.id;
      const { attendanceScore, attResult } = getStudentAttendanceData(s.id, currentClassName);
      const existing = syncedGrades[gradeKey] || syncedGrades[s.id];

      const quiz = existing?.quizScore ?? null;
      const mid = existing?.midtermScore ?? null;
      const fin = existing?.finalScore ?? null;
      const hw = existing?.homeworkScore ?? null;
      const attid = existing?.attitudeScore ?? null;

      const hasAnyData =
        Boolean(existing?.hasSavedGrade) ||
        attResult.hasRecords ||
        quiz !== null ||
        mid !== null ||
        fin !== null ||
        hw !== null ||
        attid !== null;

      if (!hasAnyData) {
        return;
      }

      const weightRes = resolveStudentGradeWeight(s.id, currentClassObj?.termId, gradeWeightsMap);
      const provisional = calculateProvisionalTotalGrade(
        {
          attendanceScore,
          quizScore: quiz,
          midtermScore: mid,
          finalScore: fin,
          homeworkScore: hw,
          attitudeScore: attid,
        },
        weightRes.weights
      );

      const gradeItem: StudentGrade = {
        studentId: s.id,
        studentName: s.name,
        className: currentClassName,
        classId: targetClassId,
        attendanceScore,
        quizScore: quiz,
        midtermScore: mid,
        finalScore: fin,
        homeworkScore: hw,
        attitudeScore: attid,
        totalScore: provisional.totalScore,
        hasAttendanceData: attResult.hasRecords,
        hasSavedGrade: true,
        isEstimated: provisional.isEstimated,
        missingItems: provisional.missingItems,
        isPassed:
          provisional.totalScore !== null && !provisional.isEstimated
            ? provisional.totalScore >= 60.0
            : undefined,
        updatedAt: new Date().toISOString().substring(0, 16).replace('T', ' '),
      };

      syncedGrades[gradeKey] = gradeItem;
      syncedGrades[s.id] = gradeItem;
    });

    setLocalGrades(syncedGrades);
    onUpdateGrades(syncedGrades);
    setHasUnsavedChanges(false);
    onShowToast(`🎉 已成功儲存【${currentClassName}】成績資料（已同步實際出缺席與個別權重）！`, 'success');
  };

  // Class Stats Summary excluding pending/uncomputed students
  const classStats = useMemo(() => {
    if (classStudents.length === 0) return { avgTotal: null as number | null, passCount: 0, evaluatedCount: 0 };
    let sum = 0;
    let pass = 0;
    let evaluatedCount = 0;

    classStudents.forEach((s) => {
      const targetClassId = currentClassObj?.id || s.classId;
      const gradeKey = targetClassId ? `${s.id}_${targetClassId}` : s.id;
      const { attendanceScore } = getStudentAttendanceData(s.id, currentClassName);
      const g = localGrades[gradeKey] || localGrades[s.id];
      const quiz = g?.quizScore ?? null;
      const mid = g?.midtermScore ?? null;
      const fin = g?.finalScore ?? null;
      const hw = g?.homeworkScore ?? null;
      const attid = g?.attitudeScore ?? null;
      const weightRes = resolveStudentGradeWeight(s.id, currentClassObj?.termId, gradeWeightsMap);
      const provisional = calculateProvisionalTotalGrade(
        {
          attendanceScore,
          quizScore: quiz,
          midtermScore: mid,
          finalScore: fin,
          homeworkScore: hw,
          attitudeScore: attid,
        },
        weightRes.weights
      );

      if (provisional.totalScore !== null) {
        sum += provisional.totalScore;
        evaluatedCount++;
        if (provisional.totalScore >= 60) pass++;
      }
    });

    return {
      avgTotal: evaluatedCount > 0 ? Math.round((sum / evaluatedCount) * 10) / 10 : null,
      passCount: pass,
      evaluatedCount,
    };
  }, [classStudents, localGrades, getStudentAttendanceData, currentClassName, currentClassObj?.id, currentClassObj?.termId, gradeWeightsMap]);

  // Export CSV using unified export helper
  const handleExportCSV = () => {
    exportGradesToCsv(
      classStudents,
      `${currentClassName}_${currentTermObj?.name || '學期'}_成績單`,
      localGrades,
      allCourses,
      transferRecords,
      gradeWeightsMap
    );
    onShowToast(`已匯出 ${currentClassName} 成績報表 (CSV)`, 'success');
  };

  // Floating horizontal scrollbar synchronization refs and state
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const floatingScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef<boolean>(false);

  const [showFloatingScrollbar, setShowFloatingScrollbar] = useState<boolean>(false);
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollWidth: 0,
    clientWidth: 0,
    scrollLeft: 0,
    maxScrollLeft: 0,
  });
  const [floatingBarLayout, setFloatingBarLayout] = useState({
    left: 0,
    width: 0,
  });

  const updateScrollState = useCallback(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    const scrollWidth = tableEl.scrollWidth;
    const clientWidth = tableEl.clientWidth;
    const scrollLeft = tableEl.scrollLeft;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
    const needsScroll = scrollWidth > clientWidth + 4;

    if (!needsScroll) {
      setShowFloatingScrollbar(false);
      setScrollMetrics({ scrollWidth, clientWidth, scrollLeft, maxScrollLeft });
      return;
    }

    const tableRect = tableEl.getBoundingClientRect();
    const scrollParent = tableEl.closest('.overflow-y-auto') as HTMLElement | null;
    const parentRect = scrollParent ? scrollParent.getBoundingClientRect() : null;

    const viewportBottom = parentRect
      ? Math.min(parentRect.bottom, window.innerHeight)
      : window.innerHeight;
    const viewportTop = parentRect
      ? Math.max(parentRect.top, 0)
      : 0;

    const isTableTopVisible = tableRect.top < viewportBottom - 40;
    const isNativeScrollbarOffScreen = tableRect.bottom > viewportBottom + 16;
    const isTableBottomAboveTop = tableRect.bottom > viewportTop + 80;

    const shouldShow = needsScroll && isTableTopVisible && isNativeScrollbarOffScreen && isTableBottomAboveTop;
    setShowFloatingScrollbar(shouldShow);

    const viewportWidth = window.innerWidth;
    const barLeft = Math.max(12, tableRect.left);
    const maxAvailableWidth = Math.max(180, viewportWidth - barLeft - 12);
    const barWidth = Math.min(tableRect.width, maxAvailableWidth);

    setFloatingBarLayout({
      left: barLeft,
      width: barWidth,
    });
    setScrollMetrics({ scrollWidth, clientWidth, scrollLeft, maxScrollLeft });

    if (floatingScrollRef.current && !isSyncingRef.current) {
      floatingScrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const left = tableContainerRef.current?.scrollLeft || 0;
    if (floatingScrollRef.current) {
      floatingScrollRef.current.scrollLeft = left;
    }
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: left }));
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const handleFloatingScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const left = floatingScrollRef.current?.scrollLeft || 0;
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = left;
    }
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: left }));
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const handleTableWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && e.deltaY !== 0 && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    updateScrollState();

    const scrollParent = tableEl.closest('.overflow-y-auto');
    const handleScrollOrResize = () => {
      updateScrollState();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScrollOrResize, { passive: true });
    }

    const ro = new ResizeObserver(() => {
      updateScrollState();
    });
    ro.observe(tableEl);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', handleScrollOrResize);
      }
      ro.disconnect();
    };
  }, [updateScrollState, filteredStudents.length]);

  return (
    <div className="space-y-5 pb-24 sm:pb-20">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>學生成績管理</span>
              <span className="text-xs sm:text-sm font-bold bg-teal-600 text-white px-2.5 py-0.5 sm:py-1 rounded-lg">
                {currentClassName}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {currentTermObj?.name || '當前學期'}
              </span>
              <InfoTooltip
                title="計分與權重說明"
                content="標準比例：出席 20%、平時 15%、期中 20%、期末 20%、作業 15%、態度 10%。出席成績依出缺席紀錄自動計算；若行政端核定個別權重，該生列將標註「個別自訂」並依專屬比例計分（教師端僅唯讀檢視權重）。"
                align="left"
              />
            </h1>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              id="btn-export-grades"
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none justify-center flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-colors shadow-2xs whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
              <span>匯出成績單 (CSV)</span>
            </button>

            <button
              id="btn-save-grades"
              onClick={handleSave}
              className={`flex-1 sm:flex-none justify-center flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-md whitespace-nowrap ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{hasUnsavedChanges ? '儲存修改成績 *' : '儲存成績單'}</span>
            </button>
          </div>
        </div>

        {/* Class Switcher Tabs */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-500 shrink-0 mr-1">切換班級：</span>
          {availableClasses.map((cls) => {
            const isSelected = cls === currentClassName;
            return (
              <button
                key={cls}
                id={`btn-class-${cls}`}
                onClick={() => onSelectClass(cls)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {cls}
              </button>
            );
          })}
        </div>
        {/* Class Stats Summary Strip */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
            <span className="text-slate-500 font-sans font-semibold">班級平均分：</span>
            <strong className="text-teal-700 font-black">
              {classStats.avgTotal !== null ? classStats.avgTotal : '尚未計算'}
            </strong>
          </div>
          <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 whitespace-nowrap">
            <span className="text-slate-500 font-sans font-semibold">及格人數：</span>
            <strong className="text-emerald-700 font-black">
              {classStats.passCount} / {classStats.evaluatedCount}
            </strong>
          </div>
        </div>
      </div>

      {/* Grade Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search bar inside table */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
            <Users className="w-4 h-4 text-teal-600" />
            <span>全班學生名冊 ({filteredStudents.length} 人)</span>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="搜尋學生姓名 / 學號..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
            />
          </div>
        </div>

        <div
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          onWheel={handleTableWheel}
          className="overflow-x-auto focus:outline-none select-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-3 w-10 text-center">#</th>
                <th className="py-3.5 px-4 min-w-[200px]">學生姓名 / 權重類型</th>
                <th className="py-3.5 px-3 text-center min-w-[130px]">
                  <div className="text-teal-700">出席 (標準 20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">系統依紀錄計分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>平時考 (標準 15%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>期中考 (標準 20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>期末考 (標準 20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>作業 (標準 15%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>學習態度 (標準 10%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-4 text-center min-w-[130px] bg-slate-100/70">
                  <div className="text-slate-900">總成績 (100%)</div>
                  <div className="text-[10px] font-normal text-slate-600">即時加權總分</div>
                </th>
                <th className="py-3.5 px-3 text-center w-20">詳細</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.map((student, index) => {
                const targetClassId = currentClassObj?.id || student.classId;
                const gradeKey = targetClassId ? `${student.id}_${targetClassId}` : student.id;
                const { attResult, attendanceScore } = getStudentAttendanceData(student.id, currentClassName);
                const existing = localGrades[gradeKey] || localGrades[student.id];
                const quiz = existing?.quizScore ?? null;
                const midterm = existing?.midtermScore ?? null;
                const final = existing?.finalScore ?? null;
                const homework = existing?.homeworkScore ?? null;
                const attitude = existing?.attitudeScore ?? null;

                // Resolve student's exact weights matching termId, studentId, or fallback to default
                const studentTermId = currentClassObj?.termId || currentTermObj?.id;
                const weightRes = resolveStudentGradeWeight(
                  student.id,
                  studentTermId,
                  gradeWeightsMap
                );
                const studentW = weightRes.weights;
                const isCustom = weightRes.isCustom;

                const provisional = calculateProvisionalTotalGrade(
                  {
                    attendanceScore,
                    quizScore: quiz,
                    midtermScore: midterm,
                    finalScore: final,
                    homeworkScore: homework,
                    attitudeScore: attitude,
                  },
                  studentW
                );

                const grade: StudentGrade = {
                  studentId: student.id,
                  studentName: student.name,
                  className: currentClassName,
                  classId: targetClassId,
                  attendanceScore,
                  quizScore: quiz,
                  midtermScore: midterm,
                  finalScore: final,
                  homeworkScore: homework,
                  attitudeScore: attitude,
                  totalScore: provisional.totalScore,
                  hasAttendanceData: attResult.hasRecords,
                  isEstimated: provisional.isEstimated,
                  missingItems: provisional.missingItems,
                  updatedAt: existing?.updatedAt,
                };

                return (
                  <tr
                    key={student.id}
                    id={`grade-row-${student.id}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">
                      {index + 1}
                    </td>

                    {/* Student Profile & Weight Type */}
                    <td className="py-3 px-4">
                      <div 
                        onClick={() => onSelectStudentForDetail(student)}
                        className="flex items-center space-x-3 cursor-pointer group"
                      >
                        <StudentAvatar 
                          avatarUrl={student.avatarUrl} 
                          name={student.name} 
                          sizeClassName="w-9 h-9" 
                          className="group-hover:ring-2 group-hover:ring-teal-500 transition-all shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-extrabold text-slate-900 text-sm group-hover:text-teal-700 transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">{student.englishName}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono">{student.studentNumber}</span>
                            <span>•</span>
                            <span className="text-slate-600">{student.nationality}</span>
                          </div>

                          {/* Individual Weight Indicator Tag: only display for students with non-default weights; blank otherwise */}
                          {isCustom && (
                            <div className="mt-1.5">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                                title={`行政端個別自訂權重：出席 ${studentW.attendanceWeight}%、平時 ${studentW.quizWeight}%、期中 ${studentW.midtermWeight}%、期末 ${studentW.finalWeight}%、作業 ${studentW.homeworkWeight}%、態度 ${studentW.attitudeWeight}%`}
                              >
                                個別自訂 ({studentW.attendanceWeight}/{studentW.quizWeight}/{studentW.midtermWeight}/{studentW.finalWeight}/{studentW.homeworkWeight}/{studentW.attitudeWeight}%)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 1. 出席成績 (自動計算, 不可直接編輯) */}
                    <td className="py-3 px-3 text-center">
                      <div className={`inline-flex flex-col items-center justify-center px-3 py-1.5 rounded-xl border ${
                        grade.attendanceScore === null || !attResult.hasRecords
                          ? 'bg-slate-50 border-slate-200 text-slate-600'
                          : grade.attendanceScore >= 80
                          ? 'bg-teal-50/80 border-teal-200 text-teal-900'
                          : grade.attendanceScore >= 60
                          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                          : 'bg-rose-50/80 border-rose-200 text-rose-900'
                      }`}>
                        <span className="font-mono font-black text-sm">
                          {formatAttendanceScore(grade.attendanceScore, attResult.hasRecords)}
                        </span>
                        <span className={`text-[10px] font-bold mt-0.5 ${
                          grade.attendanceScore === null || !attResult.hasRecords
                            ? 'text-slate-500'
                            : grade.attendanceScore >= 80
                            ? 'text-teal-700'
                            : grade.attendanceScore >= 60
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}>
                          {grade.attendanceScore !== null && attResult.hasRecords
                            ? `權重 ${studentW.attendanceWeight}% (佔 ${Math.round(grade.attendanceScore * (studentW.attendanceWeight / 100) * 10) / 10} 分)`
                            : `權重 ${studentW.attendanceWeight}%`}
                        </span>
                        {attResult.hasRecords ? (
                          <span className="text-[9px] text-slate-500 mt-0.5 whitespace-nowrap">
                            {attResult.presentPeriods > 0 && `${attResult.presentPeriods}出 `}
                            {attResult.leavePeriods > 0 && `${attResult.leavePeriods}假 `}
                            {attResult.absentPeriods > 0 && `${attResult.absentPeriods}缺`}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400 mt-0.5">尚無點名紀錄</span>
                        )}
                      </div>
                    </td>

                    {/* 2. 平時考 (顯示個別權重) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="未輸入"
                          id={`input-quiz-${student.id}`}
                          value={grade.quizScore ?? ''}
                          onChange={(e) => handleScoreChange(student.id, student.name, 'quizScore', e.target.value)}
                          className="w-20 px-2 py-1.5 text-base sm:text-xs text-center font-mono font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                        />
                        <div className="text-[10px] font-semibold text-slate-500 mt-1">
                          權重 {studentW.quizWeight}%
                        </div>
                      </div>
                    </td>

                    {/* 3. 期中考 (顯示個別權重，0%特別標註) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="未輸入"
                          id={`input-midterm-${student.id}`}
                          value={grade.midtermScore ?? ''}
                          onChange={(e) => handleScoreChange(student.id, student.name, 'midtermScore', e.target.value)}
                          className={`w-20 px-2 py-1.5 text-base sm:text-xs text-center font-mono font-bold placeholder:text-slate-400 placeholder:font-normal bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs ${
                            studentW.midtermWeight === 0
                              ? 'border-amber-300 bg-amber-50/40 text-slate-600'
                              : 'border-slate-300 text-slate-800'
                          }`}
                        />
                        <div className={`text-[10px] font-semibold mt-1 ${
                          studentW.midtermWeight === 0 ? 'text-amber-700 font-bold' : 'text-slate-500'
                        }`}>
                          權重 {studentW.midtermWeight}%{studentW.midtermWeight === 0 ? ' (免計)' : ''}
                        </div>
                      </div>
                    </td>

                    {/* 4. 期末考 (顯示個別權重) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="未輸入"
                          id={`input-final-${student.id}`}
                          value={grade.finalScore ?? ''}
                          onChange={(e) => handleScoreChange(student.id, student.name, 'finalScore', e.target.value)}
                          className="w-20 px-2 py-1.5 text-base sm:text-xs text-center font-mono font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                        />
                        <div className="text-[10px] font-semibold text-slate-500 mt-1">
                          權重 {studentW.finalWeight}%
                        </div>
                      </div>
                    </td>

                    {/* 5. 作業 (顯示個別權重) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="未輸入"
                          id={`input-homework-${student.id}`}
                          value={grade.homeworkScore ?? ''}
                          onChange={(e) => handleScoreChange(student.id, student.name, 'homeworkScore', e.target.value)}
                          className="w-20 px-2 py-1.5 text-base sm:text-xs text-center font-mono font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                        />
                        <div className="text-[10px] font-semibold text-slate-500 mt-1">
                          權重 {studentW.homeworkWeight}%
                        </div>
                      </div>
                    </td>

                    {/* 6. 學習態度 (顯示個別權重) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="未輸入"
                          id={`input-attitude-${student.id}`}
                          value={grade.attitudeScore ?? ''}
                          onChange={(e) => handleScoreChange(student.id, student.name, 'attitudeScore', e.target.value)}
                          className="w-20 px-2 py-1.5 text-base sm:text-xs text-center font-mono font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                        />
                        <div className="text-[10px] font-semibold text-slate-500 mt-1">
                          權重 {studentW.attitudeWeight}%
                        </div>
                      </div>
                    </td>

                    {/* 總成績 */}
                    <td className="py-3 px-4 text-center bg-slate-50/70">
                      <div className="flex flex-col items-center justify-center">
                        <span className={`font-mono font-black text-base ${
                          grade.totalScore === null
                            ? 'text-slate-400 text-xs font-sans font-semibold'
                            : grade.isEstimated
                            ? 'text-amber-700'
                            : 'text-slate-900'
                        }`}>
                          {formatTotalGradeDisplay(grade)}
                        </span>
                        {grade.missingItems && grade.missingItems.length > 0 && (
                          <span className="text-[10px] text-amber-700 mt-0.5">
                            {grade.missingItems.slice(0, 2).join('、')}
                            {grade.missingItems.length > 2 ? '…' : ''}
                          </span>
                        )}
                        {isCustom && (
                          <span className="text-[10px] font-bold mt-0.5 text-amber-700">
                            依個別權重
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onSelectStudentForDetail(student)}
                        title="查看學生個人出席與成績詳細計算"
                        className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <UserX className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="font-bold text-sm text-slate-700">【{currentClassName}】查無符合條件之學生名單</p>
                    <p className="text-xs text-slate-400 mt-1">請嘗試切換上方班級標籤或清除搜尋關鍵字</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Minimal Floating Horizontal Scrollbar */}
      {showFloatingScrollbar && (
        <div
          aria-label="橫向捲軸"
          className="fixed z-30 pointer-events-none transition-opacity duration-150"
          style={{
            bottom: '10px',
            left: `${floatingBarLayout.left}px`,
            width: `${floatingBarLayout.width}px`,
            maxWidth: 'calc(100vw - 24px)',
          }}
        >
          <div
            ref={floatingScrollRef}
            onScroll={handleFloatingScroll}
            className="pointer-events-auto floating-scrollbar touch-pan-x overflow-x-auto overflow-y-hidden h-3.5 sm:h-3 bg-slate-200/80 hover:bg-slate-300/90 backdrop-blur-md rounded-full border border-slate-300/70 shadow-sm cursor-ew-resize transition-colors"
            style={{
              WebkitOverflowScrolling: 'touch',
            }}
            title="橫向捲動表格"
          >
            <div
              style={{
                width: `${scrollMetrics.scrollWidth}px`,
                height: '1px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
