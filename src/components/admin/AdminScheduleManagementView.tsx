import React, { useState, useEffect } from 'react';
import { 
  CalendarDays, 
  Clock, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRightLeft, 
  Plus, 
  Sparkles, 
  X, 
  TrendingUp,
  FileText,
  Trash2,
  Edit2,
  RefreshCw,
  Sun,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Settings,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { 
  Term, 
  ClassEntity, 
  ClassScheduleRule, 
  ClassSessionEntity, 
  ClassSessionStatus, 
  Holiday, 
  ScheduleProgress 
} from '../../types';
import * as scheduleService from '../../lib/scheduleService';
import { 
  getIsoWeekdayName, 
  formatTimeRange, 
  calculateWeeklyHoursFromRules,
  calculateScheduleProgressMetrics,
  getTodayDateStr
} from '../../utils/quarterScheduler';

const HOUR_24_OPTIONS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTE_60_OPTIONS = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

interface TimeSelectPickerProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  accentColor?: 'teal' | 'amber' | 'blue';
}

function TimeSelectPicker({ label, value, onChange, accentColor = 'teal' }: TimeSelectPickerProps) {
  const parts = (value || '09:00').slice(0, 5).split(':');
  const hour = (parts[0] || '09').padStart(2, '0');
  const minute = (parts[1] || '00').padStart(2, '0');

  const safeHour = HOUR_24_OPTIONS.includes(hour) ? hour : '09';
  const safeMinute = MINUTE_60_OPTIONS.includes(minute) ? minute : '00';

  const focusRing = accentColor === 'amber'
    ? 'focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500'
    : accentColor === 'blue'
    ? 'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500'
    : 'focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500';

  return (
    <div>
      <label className="block text-slate-700 font-bold mb-1">{label}</label>
      <div className={`flex items-center space-x-1 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs ${focusRing} transition-all`}>
        <div className="flex-1">
          <select
            value={safeHour}
            onChange={(e) => onChange(`${e.target.value}:${safeMinute}`)}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg px-2 py-1.5 font-black text-slate-800 text-xs focus:outline-hidden cursor-pointer text-center"
            title="選擇小時 (00-23)"
          >
            {HOUR_24_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <span className="font-black text-slate-500 text-sm select-none px-0.5">:</span>
        <div className="flex-1">
          <select
            value={safeMinute}
            onChange={(e) => onChange(`${safeHour}:${e.target.value}`)}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg px-2 py-1.5 font-black text-slate-800 text-xs focus:outline-hidden cursor-pointer text-center"
            title="選擇分鐘 (00-59)"
          >
            {MINUTE_60_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

interface AdminScheduleManagementViewProps {
  terms: Term[];
  classes: ClassEntity[];
  selectedTermId: string;
  onSelectTermId?: (termId: string) => void;
  onRefreshData?: () => void;
}

export const AdminScheduleManagementView: React.FC<AdminScheduleManagementViewProps> = ({
  terms,
  classes,
  selectedTermId: initialTermId,
  onSelectTermId,
  onRefreshData,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'sessions' | 'rules' | 'holidays'>('sessions');

  // Term & Class Selection
  const [currentTermId, setCurrentTermId] = useState<string>(initialTermId || (terms[0]?.id ?? ''));
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  // Month & Filter
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data states from Supabase
  const [sessions, setSessions] = useState<ClassSessionEntity[]>([]);
  const [rules, setRules] = useState<ClassScheduleRule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [progress, setProgress] = useState<ScheduleProgress | null>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState<boolean>(false);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState<boolean>(false);
  const [reschedulingSession, setReschedulingSession] = useState<ClassSessionEntity | null>(null);
  const [deletingRule, setDeletingRule] = useState<ClassScheduleRule | null>(null);
  const [deletingSession, setDeletingSession] = useState<ClassSessionEntity | null>(null);

  // Form states - Reschedule
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState<string>('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState<string>('09:00');
  const [rescheduleEndTime, setRescheduleEndTime] = useState<string>('12:00');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');

  // Form states - Add / Edit Schedule Rule
  const [editingRule, setEditingRule] = useState<ClassScheduleRule | null>(null);
  const [ruleDayOfWeek, setRuleDayOfWeek] = useState<number>(1);
  const [ruleStartTime, setRuleStartTime] = useState<string>('09:00');
  const [ruleEndTime, setRuleEndTime] = useState<string>('12:00');
  const [rulePeriodsCount, setRulePeriodsCount] = useState<number>(3);
  const [ruleClassroom, setRuleClassroom] = useState<string>('');

  // Auto calculate periods count when start and end time changes
  useEffect(() => {
    if (ruleStartTime && ruleEndTime) {
      const [sH, sM] = ruleStartTime.split(':').map(Number);
      const [eH, eM] = ruleEndTime.split(':').map(Number);
      const startMin = (sH || 0) * 60 + (sM || 0);
      const endMin = (eH || 0) * 60 + (eM || 0);
      if (endMin > startMin) {
        const diff = Math.max(1, Math.round((endMin - startMin) / 60));
        setRulePeriodsCount(diff);
      }
    }
  }, [ruleStartTime, ruleEndTime]);

  // Form states - Add Holiday
  const [holidayDate, setHolidayDate] = useState<string>('');
  const [holidayName, setHolidayName] = useState<string>('');
  const [holidayIsSuspended, setHolidayIsSuspended] = useState<boolean>(true);
  const [holidayNotes, setHolidayNotes] = useState<string>('');

  // Sync term when initialTermId changes
  useEffect(() => {
    if (initialTermId) {
      setCurrentTermId(initialTermId);
    }
  }, [initialTermId]);

  // Current active term entity
  const currentTerm = terms?.find((t) => t.id === currentTermId) || terms?.[0];

  // Classes filtered by current term
  const termClasses = classes.filter((c) => !c.termId || c.termId === currentTermId);

  // If selected class is not in current term, reset to ALL or first class
  useEffect(() => {
    if (selectedClassId !== 'ALL' && !termClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('ALL');
    }
  }, [currentTermId, termClasses, selectedClassId]);

  // Load Data from Supabase
  const loadScheduleData = async () => {
    if (!currentTermId) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch holidays
      const holRes = await scheduleService.fetchHolidays(currentTermId);
      if (holRes.error) {
        console.error('Error loading holidays:', holRes.error);
      } else {
        setHolidays(holRes.data);
      }

      // 2. Fetch Sessions
      if (selectedClassId === 'ALL') {
        const sessRes = await scheduleService.fetchTermSessions(currentTermId);
        if (sessRes.error) {
          setErrorMessage(sessRes.error.message || '載入學期課表失敗');
        } else {
          setSessions(sessRes.data);
        }
        
        // 全校總覽時，同時讀取所有班級的排課規則 (共 25 筆)
        const allRulesRes = await scheduleService.fetchAllScheduleRules();
        if (!allRulesRes.error && allRulesRes.data) {
          setRules(allRulesRes.data);
        } else {
          setRules([]);
        }
        setProgress(null);
      } else {
        // Specific class
        const sessRes = await scheduleService.fetchClassSessions(selectedClassId);
        if (sessRes.error) {
          setErrorMessage(sessRes.error.message || '載入班級課表失敗');
        } else {
          setSessions(sessRes.data);
        }

        // Fetch rules for this class
        const rulesRes = await scheduleService.fetchScheduleRules(selectedClassId);
        if (rulesRes.error) {
          console.error('Error fetching rules:', rulesRes.error);
        } else {
          setRules(rulesRes.data);
        }

        // Fetch progress metrics with known class target_hours
        const targetClassObj = classes.find((item) => item.id === selectedClassId || item.code === selectedClassId) 
          || termClasses.find((item) => item.id === selectedClassId || item.code === selectedClassId);
        const progRes = await scheduleService.getScheduleProgress(
          selectedClassId,
          targetClassObj?.totalTargetHours
        );
        if (progRes.data) {
          setProgress(progRes.data);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || '載入排課資料發生異常');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScheduleData();
  }, [currentTermId, selectedClassId, classes]);

  // Flash message helper
  const showToast = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Handler: Term Change
  const handleTermChange = (newTermId: string) => {
    setCurrentTermId(newTermId);
    if (onSelectTermId) {
      onSelectTermId(newTermId);
    }
  };

  // Handler: Generate Quarter Sessions
  const handleExecuteGenerateSessions = async () => {
    if (!currentTermId) {
      showToast('請先選擇學期後再進行課表產生', true);
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      if (selectedClassId === 'ALL') {
        const res = await scheduleService.generateAllTermSessions(currentTermId);
        if (res.error) {
          showToast(res.error.message || '產生全校課表失敗', true);
        } else if (res.data) {
          showToast(`全校課表產生成功！已為 ${res.data.classesCount} 個班級產生 ${res.data.totalGenerated} 堂課堂。`);
          setShowGenerateModal(false);
          await loadScheduleData();
        }
      } else {
        const res = await scheduleService.generateQuarterSessions(currentTermId, selectedClassId);
        if (res.error) {
          showToast(res.error.message || '產生課表失敗', true);
        } else if (res.data) {
          showToast(`課表產生成功！已為該班級產生 ${res.data.generatedCount} 堂有效課堂，共計 ${res.data.scheduledHours} 小時（目標: ${res.data.targetHours}H）。`);
          setShowGenerateModal(false);
          await loadScheduleData();
        }
      }
    } catch (err: any) {
      showToast(err.message || '課表產生失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Helpers for Rule Modal
  const handleOpenAddRuleModal = () => {
    setEditingRule(null);
    setRuleDayOfWeek(1);
    setRuleStartTime('09:00');
    setRuleEndTime('12:00');
    setRulePeriodsCount(3);
    setRuleClassroom(termClasses.find((c) => c.id === selectedClassId)?.classroom || '');
    setShowAddRuleModal(true);
  };

  const handleOpenEditRuleModal = (rule: ClassScheduleRule) => {
    setEditingRule(rule);
    setRuleDayOfWeek(rule.dayOfWeek);
    setRuleStartTime(rule.startTime ? rule.startTime.slice(0, 5) : '09:00');
    setRuleEndTime(rule.endTime ? rule.endTime.slice(0, 5) : '12:00');
    setRulePeriodsCount(rule.periodsCount);
    setRuleClassroom(rule.classroom || '');
    setShowAddRuleModal(true);
  };

  // Handler: Save Rule (Create or Edit)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClassId === 'ALL') {
      showToast('請先選擇班級後再進行動作', true);
      return;
    }

    if (!ruleStartTime || !ruleEndTime) {
      showToast('請完整輸入開始時間與結束時間', true);
      return;
    }

    // Time range validation (防呆: end time must be after start time)
    const [sH, sM] = ruleStartTime.split(':').map(Number);
    const [eH, eM] = ruleEndTime.split(':').map(Number);
    const startMin = (sH || 0) * 60 + (sM || 0);
    const endMin = (eH || 0) * 60 + (eM || 0);

    // 1. 結束時間不能早於或等於開始時間
    if (endMin <= startMin) {
      showToast('結束時間不可早於或等於開始時間，請確認上課時間。', true);
      return;
    }

    // 2. 不允許跨午夜排課 (例如 23:00 -> 01:00)
    if (sH > eH || (sH === 23 && eH < 23)) {
      showToast('不允許跨午夜排課，請填寫當日正常上課時間。', true);
      return;
    }

    // 3. 重複時間區段檢查 (星期 + 開始時間 + 結束時間)
    const isDuplicate = rules.some((r) => {
      if (editingRule && r.id === editingRule.id) return false;
      return (
        r.dayOfWeek === ruleDayOfWeek &&
        r.startTime === ruleStartTime &&
        r.endTime === ruleEndTime
      );
    });

    if (isDuplicate) {
      showToast(`此班級在該星期的同一時間段已存在相同的排課規則（週${getIsoWeekdayName(ruleDayOfWeek)} ${ruleStartTime}-${ruleEndTime}），不可重複設定。`, true);
      return;
    }

    setActionLoading(true);
    try {
      if (editingRule) {
        const res = await scheduleService.updateScheduleRule(editingRule.id, {
          dayOfWeek: ruleDayOfWeek,
          startTime: ruleStartTime,
          endTime: ruleEndTime,
          periodsCount: rulePeriodsCount,
          classroom: ruleClassroom || undefined,
        });

        if (res.error) {
          showToast(res.error.message || '更新規則失敗', true);
        } else {
          showToast('✅ 每週常態排課規則更新成功！');
          setShowAddRuleModal(false);
          setEditingRule(null);
          const rulesRes = await scheduleService.fetchScheduleRules(selectedClassId);
          setRules(rulesRes.data);
          onRefreshData?.();
          await loadScheduleData();
        }
      } else {
        const res = await scheduleService.createScheduleRule({
          classId: selectedClassId,
          dayOfWeek: ruleDayOfWeek,
          startTime: ruleStartTime,
          endTime: ruleEndTime,
          periodsCount: rulePeriodsCount,
          classroom: ruleClassroom || undefined,
        });

        if (res.error) {
          showToast(res.error.message || '新增規則失敗', true);
        } else {
          showToast('✅ 每週常態排課規則新增成功！');
          setShowAddRuleModal(false);
          const rulesRes = await scheduleService.fetchScheduleRules(selectedClassId);
          setRules(rulesRes.data);
          onRefreshData?.();
          await loadScheduleData();
        }
      }
    } catch (err: any) {
      showToast(err.message || '儲存規則失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Apply Preset Rules
  const handleApplyPreset = async (presetType: 'standard_am' | 'standard_pm' | 'culture_pm') => {
    if (selectedClassId === 'ALL') {
      showToast('請先選擇特定班級', true);
      return;
    }

    setActionLoading(true);
    try {
      let presetRules: Partial<ClassScheduleRule>[] = [];
      if (presetType === 'standard_am') {
        presetRules = [1, 2, 3, 4, 5].map((d) => ({
          dayOfWeek: d,
          startTime: '09:00',
          endTime: '12:00',
          periodsCount: 3,
        }));
      } else if (presetType === 'standard_pm') {
        presetRules = [1, 2, 3, 4, 5].map((d) => ({
          dayOfWeek: d,
          startTime: '13:30',
          endTime: '16:30',
          periodsCount: 3,
        }));
      } else if (presetType === 'culture_pm') {
        presetRules = [2, 4].map((d) => ({
          dayOfWeek: d,
          startTime: '14:00',
          endTime: '16:00',
          periodsCount: 2,
        }));
      }

      const res = await scheduleService.saveScheduleRules(selectedClassId, presetRules);
      if (res.error) {
        showToast(res.error.message || '套用預設規則失敗', true);
      } else {
        showToast('已成功套用常態排課預設規則！');
        setRules(res.data);
        onRefreshData?.();
        await loadScheduleData();
      }
    } catch (err: any) {
      showToast(err.message || '套用預設規則失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Delete Rule Confirmation & Action
  const handleConfirmDeleteRule = async () => {
    if (!deletingRule) return;
    setActionLoading(true);
    try {
      const res = await scheduleService.deleteScheduleRule(deletingRule.id);
      if (res.error) {
        showToast(`排課規則刪除失敗：${res.error.message || '未知錯誤'}`, true);
      } else {
        showToast('排課規則已刪除');
        setRules((prev) => prev.filter((r) => r.id !== deletingRule.id));
        setDeletingRule(null);
        onRefreshData?.();
        await loadScheduleData();
      }
    } catch (err: any) {
      showToast(`排課規則刪除失敗：${err.message || '刪除失敗'}`, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Create Holiday
  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate || !holidayName) {
      showToast('請填寫日期與節日名稱', true);
      return;
    }

    setActionLoading(true);
    try {
      const res = await scheduleService.createHoliday({
        termId: currentTermId || undefined,
        date: holidayDate,
        name: holidayName,
        isSuspended: holidayIsSuspended,
        notes: holidayNotes || undefined,
      });

      if (res.error) {
        showToast(res.error.message || '新增假日失敗', true);
      } else {
        showToast('校務假日/停課日新增成功！');
        setShowAddHolidayModal(false);
        setHolidayDate('');
        setHolidayName('');
        setHolidayNotes('');
        const holRes = await scheduleService.fetchHolidays(currentTermId);
        setHolidays(holRes.data);
      }
    } catch (err: any) {
      showToast(err.message || '新增假日失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Delete Holiday
  const handleDeleteHoliday = async (holidayId: string) => {
    if (!window.confirm('確定要刪除此假日設定嗎？')) return;
    setActionLoading(true);
    try {
      const res = await scheduleService.deleteHoliday(holidayId);
      if (res.error) {
        showToast(res.error.message || '刪除假日失敗', true);
      } else {
        showToast('假日設定已刪除');
        setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      }
    } catch (err: any) {
      showToast(err.message || '刪除假日失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Reschedule Session Submit
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingSession || !rescheduleTargetDate) {
      showToast('請指定調課補課日期', true);
      return;
    }

    setActionLoading(true);
    try {
      const res = await scheduleService.rescheduleSession(
        reschedulingSession.id,
        rescheduleTargetDate,
        rescheduleStartTime,
        rescheduleEndTime,
        rescheduleReason
      );

      if (res.error) {
        showToast(res.error.message || '調課作業失敗', true);
      } else {
        showToast(`調課成功！原堂次已標記為調課，並於 ${rescheduleTargetDate} 建立補課堂次。`);
        setReschedulingSession(null);
        await loadScheduleData();
      }
    } catch (err: any) {
      showToast(err.message || '調課作業失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Cancel Session (停課)
  const handleCancelSession = async (sessionId: string) => {
    const reason = window.prompt('請輸入停課原因（如：颱風停課、教師公假）：', '中心公假停課');
    if (reason === null) return;

    setActionLoading(true);
    try {
      const res = await scheduleService.cancelSession(sessionId, reason);
      if (res.error) {
        showToast(res.error.message || '停課操作失敗', true);
      } else {
        showToast('課堂已標記為停課狀態');
        await loadScheduleData();
      }
    } catch (err: any) {
      showToast(err.message || '停課操作失敗', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Confirm Delete Single Session (Triggered from modal)
  const handleConfirmDeleteSession = async () => {
    if (!deletingSession) return;
    const sessionToDelete = deletingSession;
    setActionLoading(true);
    try {
      const res = await scheduleService.deleteClassSession(sessionToDelete.id);
      if (!res.success || res.error) {
        const errMsg =
          res.error?.message ||
          res.error?.details ||
          (typeof res.error === 'string' ? res.error : '刪除課堂失敗');
        showToast(errMsg, true);
        setDeletingSession(null);
        return;
      }

      // Success notification
      const targetClass =
        termClasses.find((c) => c.id === sessionToDelete.classId) ||
        classes.find((c) => c.id === sessionToDelete.classId);
      const classNameStr = targetClass?.name || sessionToDelete.className || '';
      showToast(`課堂已自資料庫成功刪除 (${sessionToDelete.sessionDate} ${classNameStr ? `${classNameStr} 班` : ''})`);
      setDeletingSession(null);

      // 1. Immediately remove from current state
      const updatedSessions = sessions.filter((s) => s.id !== sessionToDelete.id);
      setSessions(updatedSessions);

      // 2. Immediately re-calculate scheduled hours and progress metrics
      const currentSelected =
        classes.find((c) => c.id === selectedClassId || c.code === selectedClassId) ||
        termClasses.find((c) => c.id === selectedClassId || c.code === selectedClassId);
      const targetHours =
        selectedClassId === 'ALL'
          ? termClasses.reduce((acc, c) => acc + (c.totalTargetHours || 0), 0)
          : currentSelected?.totalTargetHours || 0;

      setProgress(calculateScheduleProgressMetrics(targetHours, updatedSessions));

      // 3. Re-fetch fresh data from Supabase to guarantee complete consistency
      await loadScheduleData();
    } catch (err: any) {
      showToast(err.message || '刪除課堂失敗', true);
      setDeletingSession(null);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Sessions for display
  const filteredSessions = sessions.filter((s) => {
    const matchMonth = selectedMonth === 'ALL' || s.sessionDate.startsWith(selectedMonth);
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchMonth && matchStatus;
  });

  // Calculate stats for current view
  const currentSelectedClass = classes.find((c) => c.id === selectedClassId || c.code === selectedClassId) 
    || termClasses.find((c) => c.id === selectedClassId || c.code === selectedClassId);
  const targetHoursForSelected = selectedClassId === 'ALL'
    ? termClasses.reduce((acc, c) => acc + (c.totalTargetHours || 0), 0)
    : (currentSelectedClass?.totalTargetHours || 0);

  const overallMetrics = progress || calculateScheduleProgressMetrics(targetHoursForSelected, sessions);
  const weeklyHours = calculateWeeklyHoursFromRules(rules);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <CalendarDays className="w-6 h-6 text-teal-600" />
            <h1 className="text-xl font-black text-slate-800">全校排課管理與目標時數進度監控</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            以 Supabase 正式關聯架構管理常態每週排課規則、校務國定假日停課、全學期堂次生成與線上調課／補課作業。
          </p>
        </div>

        {/* Global Term Selector */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs font-bold text-slate-600">目前學期：</span>
          <select
            value={currentTermId}
            onChange={(e) => handleTermChange(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-teal-500/20"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.startDate} ~ {t.endDate}) {t.isActive ? '★ 啟用中' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Term Lock Warning Banner */}
      {currentTerm?.isLocked && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-center justify-between text-amber-900 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-sm flex items-center gap-2">
                <span>【{currentTerm.name}】已封存鎖定 (is_locked = true)</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-bold rounded-full border border-amber-300">
                  唯讀保護中
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                此學期已進入封存狀態，系統已自動鎖定所有排課操作（禁止自動產生課表、新增/修改/刪除排課規則、新增假日、調課與停課）。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation & Sub-Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
              activeTab === 'sessions'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>課表行事曆與堂次明細</span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
              activeTab === 'rules'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>常態每週排課規則 ({rules.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
              activeTab === 'holidays'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span>校務假日與停課設定 ({holidays.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadScheduleData}
            disabled={loading}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-xs font-bold flex items-center space-x-1"
            title="重新整理資料庫"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-600' : ''}`} />
            <span className="hidden sm:inline">重新整理</span>
          </button>
        </div>
      </div>

      {/* Class Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-slate-500 shrink-0">選擇班級：</span>
          <button
            onClick={() => setSelectedClassId('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              selectedClassId === 'ALL'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            學期所有班級總表
          </button>
          {termClasses.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                selectedClassId === c.id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Action Button: Generate Sessions */}
        <button
          onClick={() => setShowGenerateModal(true)}
          className="px-3.5 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-black rounded-xl hover:from-teal-700 hover:to-emerald-700 transition-all flex items-center space-x-1.5 shrink-0 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{selectedClassId === 'ALL' ? '⚡ 產生全校全期課表' : '⚡ 產生全期課表'}</span>
        </button>
      </div>

      {/* 165-Hour Progress Dashboard (Only when specific class or overall) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-2xl p-5 text-white shadow-xs border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {selectedClassId === 'ALL' ? '全校夏季課堂總覽' : termClasses.find((c) => c.id === selectedClassId)?.name}
              </span>
              <span className="text-xs text-slate-300 font-medium">
                {currentTerm?.startDate} ~ {currentTerm?.endDate}
              </span>
            </div>

            <div className="text-2xl font-black flex items-baseline space-x-2">
              <span>已排定</span>
              <span className="text-teal-400 font-mono">{overallMetrics.scheduledHours}</span>
              <span className="text-sm font-normal text-slate-300">/ 目標 {overallMetrics.targetHours} 小時</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 ml-2">
                {overallMetrics.progressPercentage}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-md bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-400 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, overallMetrics.progressPercentage)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">正常授課堂次</div>
              <div className="font-mono font-bold text-base text-white">{overallMetrics.normalSessionsCount} 堂</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">調課中堂次</div>
              <div className="font-mono font-bold text-base text-amber-400">{overallMetrics.rescheduledSessionsCount} 堂</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">已排補課堂次</div>
              <div className="font-mono font-bold text-base text-emerald-400">{overallMetrics.makeupSessionsCount} 堂</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">停課堂次</div>
              <div className="font-mono font-bold text-base text-rose-400">{overallMetrics.cancelledSessionsCount} 堂</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SESSIONS CALENDAR & LIST VIEW                                  */}
      {/* ===================================================================== */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {/* Controls: Month & Status Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600">檢視月份：</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="ALL">全學期所有月份 ({sessions.length} 堂)</option>
                <option value="2026-07">
                  2026 年 7 月 ({sessions.filter((s) => s.sessionDate.startsWith('2026-07')).length} 堂)
                </option>
                <option value="2026-08">
                  2026 年 8 月 ({sessions.filter((s) => s.sessionDate.startsWith('2026-08')).length} 堂)
                </option>
                <option value="2026-09">
                  2026 年 9 月 ({sessions.filter((s) => s.sessionDate.startsWith('2026-09')).length} 堂)
                </option>
                <option value="2026-10">
                  2026 年 10 月 ({sessions.filter((s) => s.sessionDate.startsWith('2026-10')).length} 堂)
                </option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600">堂次狀態：</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="ALL">全部狀態 ({sessions.length})</option>
                <option value="NORMAL">正常 (NORMAL)</option>
                <option value="RESCHEDULED">已調課 (RESCHEDULED)</option>
                <option value="MAKEUP">補課 (MAKEUP)</option>
                <option value="CANCELLED">停課 (CANCELLED)</option>
              </select>
            </div>
          </div>

          {/* Sessions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-800">
                  實際排課課堂明細 ({filteredSessions.length} 堂)
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                每堂課皆具備唯一 Session ID，供點名與出勤直接關聯
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-600 mb-2" />
                <p className="text-xs">正在自 Supabase 載入排課資料...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-600">目前尚無已排定的課堂資料</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {selectedClassId === 'ALL'
                    ? '請自上方選擇指定班級，設定每週排課規則後點擊「⚡ 產生全期課表」即可由系統自動產生全學期課堂。'
                    : '該班級目前尚未產生課堂。請先確認「排課規則」已設定，再點擊「⚡ 產生全期課表」。'}
                </p>
                {selectedClassId !== 'ALL' && (
                  <button
                    onClick={() => setShowGenerateModal(true)}
                    className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700"
                  >
                    前往產生課表
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">上課日期</th>
                      <th className="py-3 px-4">班級名稱</th>
                      <th className="py-3 px-4">時段 / 節數</th>
                      <th className="py-3 px-4">教室</th>
                      <th className="py-3 px-4">狀態</th>
                      <th className="py-3 px-4">調課 / 補課資訊 / 備註</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredSessions.map((s) => {
                      const isRescheduled = s.status === 'RESCHEDULED';
                      const isMakeup = s.status === 'MAKEUP';
                      const isCancelled = s.status === 'CANCELLED';
                      const matchedClass = classes.find((c) => c.id === s.classId);
                      const displayClassName = s.className || matchedClass?.name || matchedClass?.classCode || '華語密集班';
                      const displayCourseName = s.courseName || matchedClass?.courseName || matchedClass?.classroom || '';

                      return (
                        <tr
                          key={s.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isRescheduled
                              ? 'bg-amber-50/30'
                              : isMakeup
                              ? 'bg-emerald-50/30'
                              : isCancelled
                              ? 'bg-rose-50/30 opacity-75'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{s.sessionDate}</div>
                            <div className="text-[10px] text-slate-400">{getIsoWeekdayName(s.dayOfWeek)}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{displayClassName}</div>
                            <div className="text-[10px] text-slate-400">{displayCourseName}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold font-mono text-slate-800">
                              {formatTimeRange(s.startTime, s.endTime)}
                            </div>
                            <div className="text-[10px] text-teal-700 font-semibold">{s.periodsCount} 節課 ({s.periodsCount}H)</div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-700">{s.classroom}</td>
                          <td className="py-3 px-4">
                            {s.status === 'NORMAL' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                正常授課
                              </span>
                            )}
                            {isRescheduled && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                ⚠️ 已調課
                              </span>
                            )}
                            {isMakeup && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🔵 補課堂次
                              </span>
                            )}
                            {isCancelled && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                ❌ 已停課
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {isRescheduled && s.rescheduledToDate && (
                              <div className="text-amber-800 font-bold">
                                移至 {s.rescheduledToDate} 補課
                              </div>
                            )}
                            {s.notes && (
                              <div className="text-slate-500 text-[11px] max-w-xs truncate" title={s.notes}>
                                {s.notes}
                              </div>
                            )}
                            {!isRescheduled && !s.notes && <span className="text-slate-300">-</span>}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                            {s.status === 'NORMAL' && (
                              <>
                                <button
                                  onClick={() => {
                                    setReschedulingSession(s);
                                    setRescheduleTargetDate(s.sessionDate);
                                    setRescheduleStartTime(s.startTime);
                                    setRescheduleEndTime(s.endTime);
                                    setRescheduleReason('');
                                  }}
                                  className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold"
                                  title="調課至其他日期"
                                >
                                  調課
                                </button>
                                <button
                                  onClick={() => handleCancelSession(s.id)}
                                  className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-bold"
                                  title="停課"
                                >
                                  停課
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setDeletingSession(s)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="刪除堂次"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SCHEDULE RULES MANAGEMENT                                      */}
      {/* ===================================================================== */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <Settings className="w-4 h-4 text-teal-600" />
                <span>
                  【{selectedClassId === 'ALL' ? '請先選擇班級' : termClasses.find((c) => c.id === selectedClassId)?.name}】每週常態排課規則
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                排課規則定義班級每週固定的上課星期、起訖時間、節數與教室。系統將依此規則自動產生全學期課表。
              </p>
            </div>

            {selectedClassId !== 'ALL' && (
              <button
                onClick={handleOpenAddRuleModal}
                className="px-3.5 py-2 bg-teal-600 text-white rounded-xl text-xs font-black hover:bg-teal-700 flex items-center space-x-1.5 shrink-0 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增排課規則</span>
              </button>
            )}
          </div>

          {selectedClassId === 'ALL' ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
              <Settings className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">請先在上方點選特定班級以設定其每週排課規則</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Rules List */}
              <div className="md:col-span-2 space-y-3">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">目前已設定之常態規則</span>
                    <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100">
                      每週合計：{weeklyHours} 節 ({weeklyHours} 小時/週)
                    </span>
                  </div>

                  {rules.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <p className="text-xs font-bold text-slate-600">此班級尚未設定任何排課規則</p>
                      <p className="text-[11px] text-slate-400 mt-1">您可點擊上方「新增排課規則」或使用右側快速套用模板</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {rules.map((r) => (
                        <div key={r.id} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                          <div className="flex items-center space-x-3.5">
                            <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 font-black flex items-center justify-center text-xs shadow-2xs">
                              {getIsoWeekdayName(r.dayOfWeek)}
                            </span>
                            <div>
                              <div className="text-xs font-black text-slate-900 font-mono tracking-tight flex items-center space-x-2">
                                <span>{formatTimeRange(r.startTime, r.endTime)}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-sans font-bold">
                                  24小時制
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-2">
                                <span>當日節數: <strong className="text-teal-700 font-bold">{r.periodsCount} 節</strong></span>
                                <span>•</span>
                                <span>教室: <strong className="text-slate-700 font-bold">{r.classroom || '預設教室'}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditRuleModal(r)}
                              className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-teal-700 hover:bg-teal-50 border border-transparent hover:border-teal-200 rounded-lg transition-all flex items-center space-x-1"
                              title="編輯排課規則"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>編輯</span>
                            </button>
                            <button
                              onClick={() => setDeletingRule(r)}
                              className="px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all flex items-center space-x-1"
                              title="刪除規則"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>刪除</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-3">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black text-slate-800 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>快速套用排課模板</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    點擊以下模板將自動為本班配置標準排課規則（將覆寫現有規則）：
                  </p>

                  <div className="space-y-2 pt-1">
                    <button
                      onClick={() => handleApplyPreset('standard_am')}
                      disabled={actionLoading}
                      className="w-full p-2.5 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 rounded-xl text-left transition-all"
                    >
                      <div className="text-xs font-bold text-slate-800">標準上午班 (15H/週)</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">週一至週五 09:00 - 12:00（3節/日）</div>
                    </button>

                    <button
                      onClick={() => handleApplyPreset('standard_pm')}
                      disabled={actionLoading}
                      className="w-full p-2.5 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 rounded-xl text-left transition-all"
                    >
                      <div className="text-xs font-bold text-slate-800">標準下午班 (15H/週)</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">週一至週五 13:30 - 16:30（3節/日）</div>
                    </button>

                    <button
                      onClick={() => handleApplyPreset('culture_pm')}
                      disabled={actionLoading}
                      className="w-full p-2.5 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 rounded-xl text-left transition-all"
                    >
                      <div className="text-xs font-bold text-slate-800">文化專題選修 (4H/週)</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">週二與週四 14:00 - 16:00（2節/日）</div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: HOLIDAYS & CENTER BREAKS                                       */}
      {/* ===================================================================== */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <Sun className="w-4 h-4 text-amber-500" />
                <span>校務行事曆與國定假日停課管理</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                記錄學期中的國定假日、全校停課日、教師研習與颱風停課。排課產生器在產生課表時將自動跳過標記為停課的日期。
              </p>
            </div>

            <button
              onClick={() => setShowAddHolidayModal(true)}
              className="px-3.5 py-2 bg-amber-600 text-white rounded-xl text-xs font-black hover:bg-amber-700 flex items-center space-x-1.5 shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增假日 / 停課日</span>
            </button>
          </div>

          {/* Holidays Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">全校及學期專屬假日列表 ({holidays.length} 日)</span>
            </div>

            {holidays.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Sun className="w-10 h-10 mx-auto text-amber-300 mb-2" />
                <p className="text-sm font-bold text-slate-600">目前尚未設定任何假日資料</p>
                <p className="text-xs text-slate-400 mt-1">
                  點擊上方「新增假日 / 停課日」設定如中秋節、國慶日或中心研習日。
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">假日日期</th>
                      <th className="py-3 px-4">節日 / 停課名稱</th>
                      <th className="py-3 px-4">是否停課</th>
                      <th className="py-3 px-4">適用範圍</th>
                      <th className="py-3 px-4">備註說明</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">{h.date}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{h.name}</td>
                        <td className="py-3 px-4">
                          {h.isSuspended ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              停課
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              正常上課
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {h.termId ? '本學期專屬' : '全校通用年度假日'}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{h.notes || '-'}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteHoliday(h.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="刪除"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: GENERATE SESSIONS CONFIRMATION                               */}
      {/* ===================================================================== */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedClassId === 'ALL' ? '產生全校全學期課表堂次' : '產生全學期課表堂次'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedClassId === 'ALL'
                      ? `對象：當前學期全體班級 (${termClasses.length} 個班級)`
                      : `班級：${termClasses.find((c) => c.id === selectedClassId)?.name}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-xs text-teal-900 space-y-2">
              <div className="font-bold flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <span>全自動排課產生器作業說明：</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-teal-800 text-[11px]">
                <li>依據學期開課與結課日期（{currentTerm?.startDate} ~ {currentTerm?.endDate}）自動計算每日課堂。</li>
                <li>自動依據每週排課規則（共 {rules.length} 條規則，{weeklyHours}H/週）配置節次與教室。</li>
                <li>自動比對校務假日與國定假日，排除已標記停課的日期。</li>
                <li>產生完成後將存入 Supabase <code>public.class_sessions</code>。</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleExecuteGenerateSessions}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl text-xs font-black bg-teal-600 text-white hover:bg-teal-700 transition-all flex items-center space-x-1.5"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>確認開始產生</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ADD SCHEDULE RULE                                            */}
      {/* ===================================================================== */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingRule ? '編輯每週排課規則' : '新增每週排課規則'}
              </h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">上課星期</label>
                <select
                  value={ruleDayOfWeek}
                  onChange={(e) => setRuleDayOfWeek(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value={1}>星期一 (Mon)</option>
                  <option value={2}>星期二 (Tue)</option>
                  <option value={3}>星期三 (Wed)</option>
                  <option value={4}>星期四 (Thu)</option>
                  <option value={5}>星期五 (Fri)</option>
                  <option value={6}>星期六 (Sat)</option>
                  <option value={7}>星期日 (Sun)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">快速選擇 24 小時制時段預設</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '上午 (09:00-12:00)', s: '09:00', e: '12:00', p: 3 },
                    { label: '下午 (13:00-16:00)', s: '13:00', e: '16:00', p: 3 },
                    { label: '下午 (13:30-16:30)', s: '13:30', e: '16:30', p: 3 },
                    { label: '文化課 (14:00-16:00)', s: '14:00', e: '16:00', p: 2 },
                    { label: '晚間 (18:00-21:00)', s: '18:00', e: '21:00', p: 3 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setRuleStartTime(preset.s);
                        setRuleEndTime(preset.e);
                        setRulePeriodsCount(preset.p);
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TimeSelectPicker
                  label="開始時間 (時 : 分)"
                  value={ruleStartTime}
                  onChange={setRuleStartTime}
                  accentColor="teal"
                />
                <TimeSelectPicker
                  label="結束時間 (時 : 分)"
                  value={ruleEndTime}
                  onChange={setRuleEndTime}
                  accentColor="teal"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">當日節數 (時數)</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={rulePeriodsCount}
                    onChange={(e) => setRulePeriodsCount(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">指定教室 (選填)</label>
                  <input
                    type="text"
                    value={ruleClassroom}
                    onChange={(e) => setRuleClassroom(e.target.value)}
                    placeholder="預設使用班級教室"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-teal-600 text-white rounded-xl font-black hover:bg-teal-700"
                >
                  {editingRule ? '確認儲存修改' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: ADD HOLIDAY                                                  */}
      {/* ===================================================================== */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">新增校務假日 / 停課日</h3>
              <button
                onClick={() => setShowAddHolidayModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateHoliday} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">假日日期 (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">節日名稱</label>
                <input
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="例如：中秋節、國慶日、教師研習停課"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isSuspendedCheck"
                  checked={holidayIsSuspended}
                  onChange={(e) => setHolidayIsSuspended(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="isSuspendedCheck" className="text-slate-800 font-bold">
                  本日全校停課（排課時自動跳過此日）
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">備註說明 (選填)</label>
                <textarea
                  value={holidayNotes}
                  onChange={(e) => setHolidayNotes(e.target.value)}
                  rows={2}
                  placeholder="說明停課相關事宜..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddHolidayModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-black hover:bg-amber-700"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: RESCHEDULE SESSION MODAL                                     */}
      {/* ===================================================================== */}
      {reschedulingSession && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">線上調課／補課作業</h3>
                  <p className="text-xs text-slate-500">
                    原課堂：{reschedulingSession.sessionDate} ({formatTimeRange(reschedulingSession.startTime, reschedulingSession.endTime)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReschedulingSession(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">補課目標日期 (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={rescheduleTargetDate}
                  onChange={(e) => setRescheduleTargetDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TimeSelectPicker
                  label="補課開始時間 (時 : 分)"
                  value={rescheduleStartTime}
                  onChange={setRescheduleStartTime}
                  accentColor="amber"
                />
                <TimeSelectPicker
                  label="補課結束時間 (時 : 分)"
                  value={rescheduleEndTime}
                  onChange={setRescheduleEndTime}
                  accentColor="amber"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">調課原因說明</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  rows={2}
                  placeholder="例如：教師公差、教室空調維護..."
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-xl text-amber-900 text-[11px]">
                💡 執行後，原課堂將標記為 <strong>RESCHEDULED</strong>，並於指定補課日自動新增 <strong>MAKEUP</strong> 補課堂次，外鍵關聯原課堂。
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setReschedulingSession(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-black hover:bg-amber-700"
                >
                  確認調課
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: DELETE RULE CONFIRMATION MODAL                               */}
      {/* ===================================================================== */}
      {deletingRule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">確定要刪除這個每週排課規則嗎？</h3>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  週{getIsoWeekdayName(deletingRule.dayOfWeek)} {deletingRule.startTime} - {deletingRule.endTime} ({deletingRule.periodsCount} 節)
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-900 leading-relaxed font-medium">
              💡 補充：已經產生且已經過去的課程不會被刪除；刪除後只會停止產生未來日期的課程。
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRule(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRule}
                disabled={actionLoading}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 shadow-xs transition-colors flex items-center space-x-1"
              >
                {actionLoading ? <span>處理中...</span> : <span>確定刪除</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: DELETE SESSION CONFIRMATION MODAL                            */}
      {/* ===================================================================== */}
      {deletingSession && (() => {
        const cls =
          termClasses.find((c) => c.id === deletingSession.classId) ||
          classes.find((c) => c.id === deletingSession.classId);
        const clsName = cls?.name || deletingSession.className || '指定';
        const startStr = deletingSession.startTime ? deletingSession.startTime.slice(0, 5) : '09:00';
        const endStr = deletingSession.endTime ? deletingSession.endTime.slice(0, 5) : '12:00';
        const confirmTitleText = `確定要刪除 ${deletingSession.sessionDate} ${clsName} 班 ${startStr}-${endStr} 這堂課嗎？`;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-start space-x-3.5">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100 text-rose-600 mt-0.5">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    {confirmTitleText}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    此操作將自資料庫 (<code className="font-mono text-[11px] text-rose-700 bg-rose-50 px-1 py-0.5 rounded">public.class_sessions</code>) 精準刪除此筆記錄。
                  </p>
                </div>
              </div>

              {/* Detailed specs */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">班級名稱</span>
                  <span className="font-bold text-slate-800">{clsName} 班</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">上課日期</span>
                  <span className="font-bold text-slate-800">
                    {deletingSession.sessionDate} (週{getIsoWeekdayName(deletingSession.dayOfWeek)})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">上課時段與時數</span>
                  <span className="font-bold text-slate-800">
                    {startStr} - {endStr}（{deletingSession.periodsCount} 節 / {deletingSession.periodsCount} 小時）
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">上課教室</span>
                  <span className="font-bold text-slate-800">{deletingSession.classroom || '未指定教室'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">堂次狀態</span>
                  <div>
                    {deletingSession.status === 'NORMAL' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        正常授課
                      </span>
                    )}
                    {deletingSession.status === 'MAKEUP' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        🔵 補課堂次
                      </span>
                    )}
                    {deletingSession.status === 'RESCHEDULED' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        ⚠️ 已調課
                      </span>
                    )}
                    {deletingSession.status === 'CANCELLED' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        ❌ 已停課
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Session UUID</span>
                  <span
                    className="font-mono text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[200px]"
                    title={deletingSession.id}
                  >
                    {deletingSession.id}
                  </span>
                </div>
              </div>

              {/* Warning box */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                ⚠️ <strong>注意：</strong>確認刪除後將永久刪除此課堂資料，該班級「已排定時數」與月份統計將同步即時扣減。若此堂課已有出缺勤點名紀錄，為保護歷史資料將被拒絕刪除。
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingSession(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSession}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>刪除中...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>確認刪除</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
