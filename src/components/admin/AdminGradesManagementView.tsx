import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  Award, 
  Search, 
  Download, 
  Filter, 
  FileSpreadsheet,
  Sliders,
  CheckCircle,
  AlertTriangle,
  X,
  RotateCcw,
  Settings,
  Users,
  Calendar,
  Lock
} from 'lucide-react';
import { 
  Student, 
  ClassEntity, 
  StudentGrade, 
  CourseSession, 
  TransferClassRecord, 
  Term, 
  StudentGradeWeight 
} from '../../types';
import { getStudentEffectiveGrade, DEFAULT_GRADE_WEIGHTS } from '../../utils/gradeUtils';
import { exportGradesToCsv } from '../../utils/csvExport';
import { InfoTooltip } from '../common/InfoTooltip';
import { BatchActionBar, BatchActionItem } from '../common/BatchActionBar';
import { GradeWeightConfigModal } from './GradeWeightConfigModal';
import { 
  setSingleStudentWeight, 
  applyBatchStudentWeights, 
  resetSingleStudentWeight, 
  resetBatchStudentWeights,
  resolveStudentGradeWeight
} from '../../lib/gradeWeightService';

interface AdminGradesManagementViewProps {
  students: Student[];
  classes: ClassEntity[];
  terms?: Term[];
  allCourses?: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  transferRecords?: TransferClassRecord[];
  gradeWeightsMap?: Record<string, StudentGradeWeight>;
  onReloadGradeWeights?: (termId?: string) => void;
  onSelectStudentDetail: (student: Student) => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export const AdminGradesManagementView: React.FC<AdminGradesManagementViewProps> = ({
  students,
  classes,
  terms = [],
  allCourses = [],
  allGrades = {},
  transferRecords = [],
  gradeWeightsMap = {},
  onReloadGradeWeights,
  onSelectStudentDetail,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedGradeBandFilter, setSelectedGradeBandFilter] = useState('ALL');
  const [selectedWeightTypeFilter, setSelectedWeightTypeFilter] = useState<'ALL' | 'CUSTOM' | 'DEFAULT'>('ALL');

  // Term selection: default to first active term or first available term
  const activeTerm = useMemo(() => {
    return terms.find((t) => t.isActive && !t.isLocked) || terms[0] || null;
  }, [terms]);

  const [selectedTermId, setSelectedTermId] = useState<string>(activeTerm?.id || '');

  // Keep selectedTermId in sync if terms change and was empty
  React.useEffect(() => {
    if (!selectedTermId && activeTerm?.id) {
      setSelectedTermId(activeTerm.id);
      if (onReloadGradeWeights) {
        onReloadGradeWeights(activeTerm.id);
      }
    }
  }, [activeTerm, selectedTermId, onReloadGradeWeights]);

  const currentTermObj = useMemo(() => {
    return terms.find((t) => t.id === selectedTermId) || activeTerm;
  }, [terms, selectedTermId, activeTerm]);

  // Term-specific classes: strictly filter by selectedTermId without falling back to classes of other terms
  const termClasses = useMemo(() => {
    if (!selectedTermId) return classes;
    const hasAnyTermConfigured = classes.some((c) => Boolean(c.termId));
    if (!hasAnyTermConfigured) return classes;
    return classes.filter((c) => c.termId === selectedTermId);
  }, [classes, selectedTermId]);

  const termClassIds = useMemo(() => {
    return new Set(termClasses.map((c) => c.id));
  }, [termClasses]);

  const termClassNames = useMemo(() => {
    return new Set(termClasses.map((c) => c.name));
  }, [termClasses]);

  // When switching terms, immediately reload weights and reset term filters/selections
  const handleTermChange = (newTermId: string) => {
    setSelectedTermId(newTermId);
    setSelectedClassFilter('ALL');
    setSelectedStudentIds(new Set());
    if (onReloadGradeWeights) {
      onReloadGradeWeights(newTermId);
    }
  };

  // Batch selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Modal states
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [modalTargetStudent, setModalTargetStudent] = useState<Student | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchResetMode, setIsBatchResetMode] = useState(false);

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // 1. Term association: check if student belongs to the selected term
      const hasTermClasses = termClasses.length > 0 && classes.some((c) => Boolean(c.termId));
      const hasSearch = Boolean(searchTerm.trim());
      
      if (hasTermClasses && !hasSearch) {
        const inTermClass =
          (s.classId && termClassIds.has(s.classId)) ||
          (s.className && termClassNames.has(s.className));
        const inTransfer = transferRecords.some(
          (t) =>
            t.studentId === s.id &&
            ((t.fromClassId && termClassIds.has(t.fromClassId)) ||
             (t.toClassId && termClassIds.has(t.toClassId)))
        );
        const inGrades = Boolean(
          allGrades[s.id] &&
          allGrades[s.id].classId &&
          termClassIds.has(allGrades[s.id].classId!)
        );
        const inWeights = Boolean(
          (selectedTermId && gradeWeightsMap[`${s.id}_${selectedTermId}`]) ||
          gradeWeightsMap[s.id]
        );

        if (!inTermClass && !inTransfer && !inGrades && !inWeights) {
          return false;
        }
      }

      const matchSearch =
        s.name.includes(searchTerm) ||
        s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.studentNumber.includes(searchTerm);
      const matchClass = selectedClassFilter === 'ALL' || s.className === selectedClassFilter;

      // Custom weight check using strict term resolution
      const weightRes = resolveStudentGradeWeight(s.id, selectedTermId, gradeWeightsMap);
      const isCustom = weightRes.isCustom;
      let matchWeightType = true;
      if (selectedWeightTypeFilter === 'CUSTOM') matchWeightType = isCustom;
      if (selectedWeightTypeFilter === 'DEFAULT') matchWeightType = !isCustom;

      // Unified effective grade calculation with custom weight
      const grade = getStudentEffectiveGrade(s, allGrades, allCourses, transferRecords, gradeWeightsMap, selectedTermId);
      const finalScore = grade.totalScore;

      let matchBand = true;
      if (selectedGradeBandFilter === 'A') matchBand = finalScore >= 80;
      if (selectedGradeBandFilter === 'B') matchBand = finalScore >= 70 && finalScore < 80;
      if (selectedGradeBandFilter === 'PASS') matchBand = finalScore >= 60;
      if (selectedGradeBandFilter === 'FAIL') matchBand = finalScore < 60;

      return matchSearch && matchClass && matchWeightType && matchBand;
    });
  }, [
    students,
    searchTerm,
    selectedClassFilter,
    selectedWeightTypeFilter,
    selectedGradeBandFilter,
    allGrades,
    allCourses,
    transferRecords,
    gradeWeightsMap,
    termClasses,
    termClassIds,
    termClassNames,
    classes,
  ]);

  const handleToggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    if (filteredStudents.length === 0) return;
    const allSelected = filteredStudents.every((s) => selectedStudentIds.has(s.id));
    if (allSelected) {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.slice(0, 500).forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedStudentIds(new Set());
  };

  const handleExportAllCSV = () => {
    const termId = selectedTermId || currentTermObj?.id || '';
    exportGradesToCsv(filteredStudents, '全校學員期末成績冊', allGrades, allCourses, transferRecords, gradeWeightsMap, termId);
  };

  const handleBatchExportCSV = () => {
    const targets = filteredStudents.filter((s) => selectedStudentIds.has(s.id));
    if (targets.length === 0) return;
    const termId = selectedTermId || currentTermObj?.id || '';
    exportGradesToCsv(targets, `學員成績冊_選取_${targets.length}人`, allGrades, allCourses, transferRecords, gradeWeightsMap, termId);
  };

  // Open single student modal
  const handleOpenSingleWeightModal = (student: Student) => {
    setModalTargetStudent(student);
    setIsBatchMode(false);
    setIsBatchResetMode(false);
    setIsWeightModalOpen(true);
  };

  // Open batch set modal
  const handleOpenBatchWeightModal = () => {
    if (selectedStudentIds.size === 0) return;
    if (selectedStudentIds.size > 500) {
      if (onShowToast) onShowToast('單次批量操作上限為 500 人', 'warning');
      return;
    }
    setModalTargetStudent(null);
    setIsBatchMode(true);
    setIsBatchResetMode(false);
    setIsWeightModalOpen(true);
  };

  // Open batch reset modal
  const handleOpenBatchResetModal = () => {
    if (selectedStudentIds.size === 0) return;
    if (selectedStudentIds.size > 500) {
      if (onShowToast) onShowToast('單次批量操作上限為 500 人', 'warning');
      return;
    }
    setModalTargetStudent(null);
    setIsBatchMode(true);
    setIsBatchResetMode(true);
    setIsWeightModalOpen(true);
  };

  // Handle Save (Single or Batch)
  const handleSaveWeights = async (weights: {
    attendanceWeight: number;
    quizWeight: number;
    midtermWeight: number;
    finalWeight: number;
    homeworkWeight: number;
    attitudeWeight: number;
    changeReason: string;
  }): Promise<{ success: boolean; error?: string }> => {
    // 嚴格依據當前行政端所選學期進行權重設定，不被學生班級之舊學期覆寫
    const termId = selectedTermId || currentTermObj?.id || '';

    if (!termId) {
      return { success: false, error: '請先選擇有效學期' };
    }

    if (currentTermObj?.isLocked) {
      return { success: false, error: '該學期已結算鎖定，禁止修改或新增自訂權重' };
    }

    if (isBatchMode) {
      const targetIds: string[] = Array.from(selectedStudentIds);
      const res = await applyBatchStudentWeights({
        studentIds: targetIds,
        termId,
        attendanceWeight: weights.attendanceWeight,
        quizWeight: weights.quizWeight,
        midtermWeight: weights.midtermWeight,
        finalWeight: weights.finalWeight,
        homeworkWeight: weights.homeworkWeight,
        attitudeWeight: weights.attitudeWeight,
        changeReason: weights.changeReason,
      });

      if (res.success) {
        if (onShowToast) onShowToast(`成功套用自訂權重至 ${targetIds.length} 位學生`, 'success');
        if (onReloadGradeWeights) {
          await onReloadGradeWeights(termId);
        }
        setSelectedStudentIds(new Set());
        return { success: true };
      }
      return { success: false, error: res.error };
    } else if (modalTargetStudent) {
      const res = await setSingleStudentWeight({
        studentId: modalTargetStudent.id,
        termId,
        attendanceWeight: weights.attendanceWeight,
        quizWeight: weights.quizWeight,
        midtermWeight: weights.midtermWeight,
        finalWeight: weights.finalWeight,
        homeworkWeight: weights.homeworkWeight,
        attitudeWeight: weights.attitudeWeight,
        changeReason: weights.changeReason,
      });

      if (res.success) {
        if (onShowToast) onShowToast(`已成功更新 ${modalTargetStudent.name} 的個別成績權重`, 'success');
        if (onReloadGradeWeights) {
          await onReloadGradeWeights(termId);
        }
        return { success: true };
      }
      return { success: false, error: res.error };
    }

    return { success: false, error: '無效的操作目標' };
  };

  // Handle Reset to Default (Single or Batch)
  const handleResetToDefault = async (changeReason: string): Promise<{ success: boolean; error?: string }> => {
    // 嚴格依據當前行政端所選學期進行權重設定，不被學生班級之舊學期覆寫
    const termId = selectedTermId || currentTermObj?.id || '';

    if (!termId) {
      return { success: false, error: '請先選擇有效學期' };
    }

    if (currentTermObj?.isLocked) {
      return { success: false, error: '該學期已結算鎖定，禁止重置權重' };
    }

    if (isBatchMode) {
      const targetIds: string[] = Array.from(selectedStudentIds);
      const res = await resetBatchStudentWeights({
        studentIds: targetIds,
        termId,
        changeReason,
      });

      if (res.success) {
        if (onShowToast) onShowToast(`已成功將 ${targetIds.length} 位學生恢復為標準預設權重`, 'success');
        if (onReloadGradeWeights) {
          await onReloadGradeWeights(termId);
        }
        setSelectedStudentIds(new Set());
        return { success: true };
      }
      return { success: false, error: res.error };
    } else if (modalTargetStudent) {
      const res = await resetSingleStudentWeight({
        studentId: modalTargetStudent.id,
        termId,
        changeReason,
      });

      if (res.success) {
        if (onShowToast) onShowToast(`已成功將 ${modalTargetStudent.name} 恢復為全校標準預設權重`, 'success');
        if (onReloadGradeWeights) {
          await onReloadGradeWeights(termId);
        }
        return { success: true };
      }
      return { success: false, error: res.error };
    }

    return { success: false, error: '無效的操作目標' };
  };

  // Selected students list for batch modal
  const selectedStudentsList = useMemo(() => {
    return students.filter((s) => selectedStudentIds.has(s.id));
  }, [students, selectedStudentIds]);

  const isTermLocked = Boolean(currentTermObj?.isLocked);

  const batchActions: BatchActionItem[] = [
    {
      key: 'batch-weights',
      label: `批次設定權重 (${selectedStudentIds.size}人)`,
      icon: <Sliders className="w-4 h-4" />,
      variant: 'primary',
      disabled: isTermLocked,
      onClick: handleOpenBatchWeightModal,
    },
    {
      key: 'batch-reset',
      label: `批次恢復預設 (${selectedStudentIds.size}人)`,
      icon: <RotateCcw className="w-4 h-4" />,
      variant: 'secondary',
      disabled: isTermLocked,
      onClick: handleOpenBatchResetModal,
    },
    {
      key: 'batch-export',
      label: `匯出成績冊 (${selectedStudentIds.size}人)`,
      icon: <Download className="w-4 h-4" />,
      variant: 'secondary',
      onClick: handleBatchExportCSV,
    },
  ];

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

  // Helper to re-evaluate scroll metrics and floating bar visibility
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

    // Show floating scrollbar when:
    // 1. Table has horizontal overflow that requires scrolling
    // 2. Table is at least partially in the viewport (scrolled into view)
    // 3. The table's native bottom scrollbar is below the viewport bottom (hidden from view)
    // 4. The bottom of the table hasn't scrolled completely above the viewport
    const isTableTopVisible = tableRect.top < viewportBottom - 40;
    const isNativeScrollbarOffScreen = tableRect.bottom > viewportBottom + 16;
    const isTableBottomAboveTop = tableRect.bottom > viewportTop + 80;

    const shouldShow = needsScroll && isTableTopVisible && isNativeScrollbarOffScreen && isTableBottomAboveTop;

    setShowFloatingScrollbar(shouldShow);

    // Calculate layout aligned to the visible table area
    const viewportWidth = window.innerWidth;
    const barLeft = Math.max(16, tableRect.left);
    const maxAvailableWidth = Math.max(260, viewportWidth - barLeft - 16);
    const barWidth = Math.min(tableRect.width, maxAvailableWidth);

    setFloatingBarLayout({
      left: barLeft,
      width: barWidth,
    });
    setScrollMetrics({ scrollWidth, clientWidth, scrollLeft, maxScrollLeft });

    // Synchronize scrollLeft on the floating track
    if (floatingScrollRef.current && !isSyncingRef.current) {
      floatingScrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  // Sync scroll from table to floating scrollbar
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

  // Sync scroll from floating scrollbar to table
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

  // Smooth wheel support: Shift + Wheel scrolls horizontally anywhere in the table
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
    <div className="space-y-6 pb-14">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">學員期末成績總評與自訂權重</h1>
            <InfoTooltip
              title="學生成績結算與個別自訂權重"
              content="全校預設比例：出席 20% + 平時 15% + 期中 20% + 期末 20% + 作業 15% + 態度 10%（合計 100%）。可針對單一或批量學生自訂比例；未自訂者自動套用預設值。學期鎖定後不可修改。"
            />
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            支援學生個別成績比例客製化與批量設定，儲存後即時更新學期加權總成績。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {terms.length > 0 && (
            <div className="flex items-center space-x-1.5 bg-[#F8FAFC] border border-[#DCE2E6] px-3 py-1.5 rounded-lg text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#536B7A]" />
              <span className="font-semibold text-slate-600">學期：</span>
              <select
                value={selectedTermId}
                onChange={(e) => handleTermChange(e.target.value)}
                className="bg-transparent font-bold text-[#26313B] focus:outline-none"
              >
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isLocked ? '(已鎖定)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleExportAllCSV}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>匯出全校成績冊 (CSV)</span>
          </button>
        </div>
      </div>

      {/* Grade Formula Specs Banner */}
      <div className="bg-[#F8FAFC] border border-[#DCE2E6] rounded-xl p-3.5 text-xs text-[#26313B] shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-[#536B7A]" />
            <span className="font-bold">全校標準預設評分比例：</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🕒 出席成績：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              ✏️ 平時測驗：<strong>15%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📝 期中考試：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🎓 期末考試：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📚 作業習作：<strong>15%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🌟 學習態度：<strong>10%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋學號 / 姓名 / 英文名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Class Filter */}
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部班級名冊 ({termClasses.length} 班)</option>
            {termClasses.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Weight Type Filter */}
          <select
            value={selectedWeightTypeFilter}
            onChange={(e) => setSelectedWeightTypeFilter(e.target.value as any)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部權重類型</option>
            <option value="CUSTOM">僅顯示個別自訂權重</option>
            <option value="DEFAULT">僅顯示標準預設權重</option>
          </select>

          {/* Grade Band Filter */}
          <select
            value={selectedGradeBandFilter}
            onChange={(e) => setSelectedGradeBandFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部成績區間</option>
            <option value="A">優異等級 (80分以上)</option>
            <option value="B">良好等級 (70-79分)</option>
            <option value="PASS">及格 (60分以上)</option>
            <option value="FAIL">不及格預警 (&lt; 60分)</option>
          </select>
        </div>
      </div>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedStudentIds.size}
        totalCount={filteredStudents.length}
        onClearSelection={handleClearSelection}
        onSelectAllCurrentPage={handleSelectAllCurrentPage}
        isAllSelected={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))}
        actions={batchActions}
      />

      {/* Grades Table */}
      <div className="bg-white rounded-xl border border-[#DCE2E6] shadow-2xs overflow-hidden">
        <div
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          onWheel={handleTableWheel}
          className="overflow-x-auto focus:outline-none select-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))}
                    onChange={handleSelectAllCurrentPage}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    title={filteredStudents.every((s) => selectedStudentIds.has(s.id)) ? '取消全選' : '全選目前名單 (上限500人)'}
                  />
                </th>
                <th className="py-3 px-4 min-w-[140px]">學號 / 姓名</th>
                <th className="py-3 px-3 min-w-[90px]">所屬班級</th>
                <th className="py-3 px-3 min-w-[110px] text-center">評分權重模式</th>
                <th className="py-3 px-3 text-right min-w-[80px]">出席</th>
                <th className="py-3 px-3 text-right min-w-[75px]">平時</th>
                <th className="py-3 px-3 text-right min-w-[75px]">期中</th>
                <th className="py-3 px-3 text-right min-w-[75px]">期末</th>
                <th className="py-3 px-3 text-right min-w-[75px]">作業</th>
                <th className="py-3 px-3 text-right min-w-[75px]">態度</th>
                <th className="py-3 px-3 text-right min-w-[90px]">學期總分</th>
                <th className="py-3 px-3 text-center min-w-[100px]">權重操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F7]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#66717C] text-xs">
                    查無學員成績紀錄
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const termId = selectedTermId || currentTermObj?.id || '';
                  const weightRes = resolveStudentGradeWeight(student.id, termId, gradeWeightsMap);
                  const customWeight = weightRes.customWeight;
                  const hasCustom = weightRes.isCustom;
                  const grade = getStudentEffectiveGrade(student, allGrades, allCourses, transferRecords, gradeWeightsMap, termId);
                  const isSelected = selectedStudentIds.has(student.id);

                  const wAtt = weightRes.weights.attendanceWeight;
                  const wQuiz = weightRes.weights.quizWeight;
                  const wMid = weightRes.weights.midtermWeight;
                  const wFin = weightRes.weights.finalWeight;
                  const wHw = weightRes.weights.homeworkWeight;
                  const wAttid = weightRes.weights.attitudeWeight;

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-[#F8FAFC] transition-colors ${isSelected ? 'bg-teal-50/40' : ''}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectStudent(student.id)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                          title={`選取學員 ${student.name}`}
                        />
                      </td>

                      <td 
                        className="py-3 px-4 cursor-pointer hover:underline"
                        onClick={() => onSelectStudentDetail(student)}
                      >
                        <div className="font-bold text-[#26313B]">{student.name}</div>
                        <div className="text-[10px] text-[#66717C] font-mono">
                          {student.studentNumber} • {student.englishName}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {student.className}
                      </td>

                      {/* Weight status badge: only show 個別自訂 for non-default weights; blank otherwise */}
                      <td className="py-3 px-3 text-center">
                        {hasCustom ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 cursor-help"
                            title={`個別自訂比例：出席${wAtt}% 平時${wQuiz}% 期中${wMid}% 期末${wFin}% 作業${wHw}% 態度${wAttid}%`}
                          >
                            個別自訂
                          </span>
                        ) : null}
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-teal-700">{grade.attendanceScore}%</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wAtt}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-[#26313B]">{grade.quizScore}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wQuiz}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-[#26313B]">{grade.midtermScore}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wMid}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-[#26313B]">{grade.finalScore}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wFin}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-[#26313B]">{grade.homeworkScore}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wHw}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-[#26313B]">{grade.attitudeScore}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({wAttid}%)</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-extrabold text-[#26313B] text-sm">
                        {grade.totalScore}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-center">
                        {isTermLocked ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed">
                            <Lock className="w-3 h-3" />
                            <span>已鎖定</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenSingleWeightModal(student)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                            title="調整該生自訂權重或恢復預設"
                          >
                            <Settings className="w-3 h-3" />
                            <span>調整權重</span>
                          </button>
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

      {/* Minimal Floating Horizontal Scrollbar */}
      {showFloatingScrollbar && (
        <div
          aria-label="橫向捲軸"
          className="fixed z-30 pointer-events-none transition-opacity duration-150"
          style={{
            bottom: '10px',
            left: `${floatingBarLayout.left}px`,
            width: `${floatingBarLayout.width}px`,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <div
            ref={floatingScrollRef}
            onScroll={handleFloatingScroll}
            className="pointer-events-auto floating-scrollbar overflow-x-auto overflow-y-hidden h-2.5 sm:h-3 bg-slate-200/80 hover:bg-slate-300/90 backdrop-blur-md rounded-full border border-slate-300/70 shadow-sm cursor-ew-resize transition-colors"
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

      {/* Grade Weight Config Modal */}
      <GradeWeightConfigModal
        key={isWeightModalOpen ? (modalTargetStudent ? `single-${modalTargetStudent.id}` : 'batch') : 'closed'}
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        student={modalTargetStudent}
        students={isBatchMode ? selectedStudentsList : []}
        termId={selectedTermId || currentTermObj?.id || ''}
        termName={currentTermObj?.name}
        isLocked={isTermLocked}
        initialResetMode={isBatchResetMode}
        currentWeight={modalTargetStudent ? gradeWeightsMap[modalTargetStudent.id] : null}
        onSave={handleSaveWeights}
        onResetToDefault={handleResetToDefault}
      />
    </div>
  );
};
