import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRightLeft, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  BookOpen,
  Filter,
  Sparkles,
  Info,
  Calendar,
  PlusCircle,
  XCircle,
  RotateCcw,
  Building,
  RefreshCw,
  Lock,
  CalendarDays,
  Check
} from 'lucide-react';
import { CourseSession, DayScheduleSummary, Teacher, ClassEntity, ClassSessionEntity, Holiday } from '../types';

const HOUR_24_OPTIONS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTE_60_OPTIONS = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

interface TimeSelectPickerProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  accentColor?: 'teal' | 'amber' | 'blue';
}

function TimeSelectPicker({ label, value, onChange, accentColor = 'amber' }: TimeSelectPickerProps) {
  const parts = (value || '09:00').slice(0, 5).split(':');
  const hour = (parts[0] || '09').padStart(2, '0');
  const minute = (parts[1] || '00').padStart(2, '0');

  const safeHour = HOUR_24_OPTIONS.includes(hour) ? hour : '09';
  const safeMinute = MINUTE_60_OPTIONS.includes(minute) ? minute : '00';

  const focusRing = accentColor === 'blue'
    ? 'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500'
    : accentColor === 'teal'
    ? 'focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500'
    : 'focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500';

  return (
    <div>
      <label className="block text-slate-700 font-bold mb-1 text-xs">{label}</label>
      <div className={`flex items-center space-x-1 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs ${focusRing} transition-all`}>
        <div className="flex-1">
          <select
            value={safeHour}
            onChange={(e) => onChange(`${e.target.value}:${safeMinute}`)}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg px-2 py-1 font-black text-slate-800 text-xs focus:outline-hidden cursor-pointer text-center"
            title="選擇小時 (00-23)"
          >
            {HOUR_24_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <span className="font-black text-slate-500 text-xs select-none px-0.5">:</span>
        <div className="flex-1">
          <select
            value={safeMinute}
            onChange={(e) => onChange(`${safeHour}:${e.target.value}`)}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg px-2 py-1 font-black text-slate-800 text-xs focus:outline-hidden cursor-pointer text-center"
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
import { formatDateFull } from '../utils/dateUtils';
import { 
  fetchClassSessions, 
  fetchTermSessions, 
  fetchHolidays, 
  rescheduleSession, 
  createMakeupSession, 
  cancelSession, 
  restoreSession, 
  isTermLocked 
} from '../lib/scheduleService';

interface RescheduleScheduleViewProps {
  courses?: CourseSession[];
  daySummaries?: DayScheduleSummary[];
  currentTeacher?: Teacher;
  adminClasses?: ClassEntity[];
  onSelectDate: (date: string) => void;
  onStartAttendance: (course: CourseSession) => void;
  onShowToast?: (message: string, type?: 'success' | 'warning' | 'info') => void;
}

export const RescheduleScheduleView: React.FC<RescheduleScheduleViewProps> = ({
  courses = [],
  daySummaries = [],
  currentTeacher,
  adminClasses = [],
  onSelectDate,
  onStartAttendance,
  onShowToast,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'rescheduled' | 'makeup' | 'cancelled' | 'holiday'>('all');
  const [dbSessions, setDbSessions] = useState<ClassSessionEntity[]>([]);
  const [dbHolidays, setDbHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockedTermName, setLockedTermName] = useState<string>('');

  // Modals state
  const [rescheduleTargetSession, setRescheduleTargetSession] = useState<ClassSessionEntity | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState<string>('09:00');
  const [rescheduleEndTime, setRescheduleEndTime] = useState<string>('12:00');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');

  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState<boolean>(false);
  const [makeupClassId, setMakeupClassId] = useState<string>('');
  const [makeupDate, setMakeupDate] = useState<string>('');
  const [makeupStartTime, setMakeupStartTime] = useState<string>('09:00');
  const [makeupEndTime, setMakeupEndTime] = useState<string>('12:00');
  const [makeupPeriods, setMakeupPeriods] = useState<number>(3);
  const [makeupReason, setMakeupReason] = useState<string>('');

  const [cancelTargetSession, setCancelTargetSession] = useState<ClassSessionEntity | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load Supabase sessions & holidays
  const loadScheduleData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch sessions
      const { data: sessions, error: sessErr } = await fetchClassSessions();
      if (sessErr) {
        console.warn('[RescheduleScheduleView] Error fetching sessions:', sessErr);
      } else {
        setDbSessions(sessions || []);
      }

      // 2. Fetch holidays
      const { data: holidays, error: holErr } = await fetchHolidays();
      if (holErr) {
        console.warn('[RescheduleScheduleView] Error fetching holidays:', holErr);
      } else {
        setDbHolidays(holidays || []);
      }

      // 3. Check lock status
      const lockCheck = await isTermLocked({});
      setIsLocked(lockCheck.isLocked);
      if (lockCheck.termName) {
        setLockedTermName(lockCheck.termName);
      }
    } catch (err) {
      console.error('[RescheduleScheduleView] Exception loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScheduleData();
  }, []);

  // Filtered DB sessions
  const filteredDbSessions = useMemo(() => {
    return dbSessions.filter((s) => {
      if (filterType === 'rescheduled') return s.status === 'RESCHEDULED';
      if (filterType === 'makeup') return s.status === 'MAKEUP';
      if (filterType === 'cancelled') return s.status === 'CANCELLED';
      return true;
    });
  }, [dbSessions, filterType]);

  // Statistics
  const stats = useMemo(() => {
    const total = dbSessions.length;
    const normal = dbSessions.filter((s) => s.status === 'NORMAL').length;
    const rescheduled = dbSessions.filter((s) => s.status === 'RESCHEDULED').length;
    const makeup = dbSessions.filter((s) => s.status === 'MAKEUP').length;
    const cancelled = dbSessions.filter((s) => s.status === 'CANCELLED').length;
    return { total, normal, rescheduled, makeup, cancelled };
  }, [dbSessions]);

  // Handle Reschedule submit
  const handleConfirmReschedule = async () => {
    if (!rescheduleTargetSession) return;
    if (!rescheduleDate) {
      if (onShowToast) onShowToast('請選擇調課目標日期', 'warning');
      return;
    }

    if (isLocked) {
      if (onShowToast) onShowToast('此學期已封存鎖定，禁止調課！', 'warning');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await rescheduleSession(
      rescheduleTargetSession.id,
      rescheduleDate,
      rescheduleStartTime,
      rescheduleEndTime,
      rescheduleReason
    );

    setIsSubmitting(false);

    if (error) {
      if (onShowToast) onShowToast(`❌ 調課失敗: ${error.message || '請確認權限'}`, 'warning');
    } else {
      if (onShowToast) onShowToast(`✨ 已成功將課程調至 ${rescheduleDate}！`, 'success');
      setRescheduleTargetSession(null);
      setRescheduleReason('');
      setRescheduleDate('');
      loadScheduleData();
    }
  };

  // Handle Create Makeup submit
  const handleConfirmMakeup = async () => {
    if (!makeupClassId) {
      if (onShowToast) onShowToast('請選擇補課班級', 'warning');
      return;
    }
    if (!makeupDate) {
      if (onShowToast) onShowToast('請選擇補課日期', 'warning');
      return;
    }

    if (isLocked) {
      if (onShowToast) onShowToast('此學期已封存鎖定，禁止新增補課！', 'warning');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await createMakeupSession(
      makeupClassId,
      makeupDate,
      makeupStartTime,
      makeupEndTime,
      makeupPeriods,
      undefined,
      undefined,
      makeupReason
    );

    setIsSubmitting(false);

    if (error) {
      if (onShowToast) onShowToast(`❌ 新增補課失敗: ${error.message || '請確認權限'}`, 'warning');
    } else {
      if (onShowToast) onShowToast(`✨ 已成功新增 ${makeupDate} 補課堂次！`, 'success');
      setIsMakeupModalOpen(false);
      setMakeupReason('');
      setMakeupDate('');
      loadScheduleData();
    }
  };

  // Handle Cancel Session submit
  const handleConfirmCancel = async () => {
    if (!cancelTargetSession) return;

    if (isLocked) {
      if (onShowToast) onShowToast('此學期已封存鎖定，禁止停課作業！', 'warning');
      return;
    }

    setIsSubmitting(true);
    const { error } = await cancelSession(cancelTargetSession.id, cancelReason);
    setIsSubmitting(false);

    if (error) {
      if (onShowToast) onShowToast(`❌ 停課失敗: ${error.message || '請確認權限'}`, 'warning');
    } else {
      if (onShowToast) onShowToast('✨ 已將課堂標記為停課！', 'success');
      setCancelTargetSession(null);
      setCancelReason('');
      loadScheduleData();
    }
  };

  // Handle Restore Session
  const handleRestore = async (session: ClassSessionEntity) => {
    if (isLocked) {
      if (onShowToast) onShowToast('此學期已封存鎖定，禁止修改課堂狀態！', 'warning');
      return;
    }

    setIsLoading(true);
    const { error } = await restoreSession(session.id);
    setIsLoading(false);

    if (error) {
      if (onShowToast) onShowToast(`❌ 恢復上課失敗: ${error.message || '請確認權限'}`, 'warning');
    } else {
      if (onShowToast) onShowToast('✨ 已將課堂恢復為正常上課！', 'success');
      loadScheduleData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Term Lock Banner */}
      {isLocked && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-center justify-between text-amber-900 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-sm flex items-center gap-1.5">
                <span>{lockedTermName || '目前學期'} 已封存鎖定 (is_locked = true)</span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                此學期已被行政端封存鎖定，全校排課、調課、補課與停課功能目前僅供檢視，禁止進行任何異動。
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-amber-200 text-amber-900 font-bold text-xs rounded-full border border-amber-300">
            唯讀保護中
          </span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 mb-2">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>課程日期與調課行事曆 (Supabase 串接)</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span>學期排課與調課異動追蹤</span>
              {dbSessions.length > 0 && (
                <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                  Supabase 即時資料 ({dbSessions.length} 堂課)
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              本視圖彙整授課教師於學期中所有排課、停課與調課紀錄。調課時，點名紀錄與學生名單將<strong>完整跟隨課程實體</strong>移動至新日期，原定日期亦會保留追蹤標記。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadScheduleData}
              disabled={isLoading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors inline-flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>重新整理</span>
            </button>
            <button
              onClick={() => {
                if (isLocked) {
                  if (onShowToast) onShowToast('此學期已封存鎖定，禁止新增補課！', 'warning');
                  return;
                }
                setMakeupClassId(adminClasses[0]?.id || '');
                setIsMakeupModalOpen(true);
              }}
              disabled={isLocked}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center space-x-1.5 ${
                isLocked 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>新增補課堂次</span>
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-[11px] font-bold text-slate-500">正常排定堂數</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{stats.normal} 堂</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
            <div className="text-[11px] font-bold text-amber-700">已調課堂數 (RESCHEDULED)</div>
            <div className="text-xl font-black text-amber-800 mt-0.5">{stats.rescheduled} 堂</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
            <div className="text-[11px] font-bold text-blue-700">補課堂次 (MAKEUP)</div>
            <div className="text-xl font-black text-blue-800 mt-0.5">{stats.makeup} 堂</div>
          </div>
          <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-100">
            <div className="text-[11px] font-bold text-rose-700">停課堂數 (CANCELLED)</div>
            <div className="text-xl font-black text-rose-800 mt-0.5">{stats.cancelled} 堂</div>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500 flex items-center mr-1">
            <Filter className="w-3.5 h-3.5 mr-1" />
            狀態篩選：
          </span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            全部堂次 ({dbSessions.length > 0 ? dbSessions.length : daySummaries.length})
          </button>
          <button
            onClick={() => setFilterType('rescheduled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'rescheduled'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            ⚠️ 有調課紀錄 ({stats.rescheduled})
          </button>
          <button
            onClick={() => setFilterType('makeup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'makeup'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            🔵 補課／調課堂次 ({stats.makeup})
          </button>
          <button
            onClick={() => setFilterType('cancelled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'cancelled'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
            }`}
          >
            🚫 停課紀錄 ({stats.cancelled})
          </button>
          <button
            onClick={() => setFilterType('holiday')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'holiday'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            🏖️ 國定假日與校務停課 ({dbHolidays.length})
          </button>
        </div>
      </div>

      {/* Special Callout for Reschedule Logic Explanation */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-md">
        <div className="flex items-start space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              華語中心「調課不遺失、點名跟著課程走」核心機制
            </h3>
            <div className="mt-2 text-xs text-blue-100 grid grid-cols-1 md:grid-cols-2 gap-3 leading-relaxed">
              <div className="bg-white/10 p-3 rounded-xl">
                <div className="font-bold text-amber-300 mb-1 flex items-center">
                  <span>原定日期 (例：07/30 週四)</span>
                </div>
                <p className="text-[11px]">
                  原定課程卡片<strong>不會憑空消失</strong>，而是標記為「RESCHEDULED (已調課)」，清楚標示調往新日期，避免老師撲空或誤以為漏課。
                </p>
              </div>
              <div className="bg-white/10 p-3 rounded-xl">
                <div className="font-bold text-teal-300 mb-1 flex items-center">
                  <span>新補課日 (例：07/31 週五)</span>
                </div>
                <p className="text-[11px]">
                  新日期卡片自動建立「MAKEUP (補課堂次)」，關聯原堂次 ID。學生名單與 3 節分節設定完整繼承，點名完成後即計入排課進度。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Supabase Class Sessions List */}
      {dbSessions.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>資料庫排課日程列表 ({filteredDbSessions.length} 堂)</span>
            </h2>
            <span className="text-xs text-slate-500">
              點擊「調課」或「停課」可即時同步更新 Supabase 雲端資料庫
            </span>
          </div>

          {filteredDbSessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              目前篩選條件下無符合的課堂紀錄。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDbSessions.map((session) => {
                const isNormal = session.status === 'NORMAL';
                const isRescheduled = session.status === 'RESCHEDULED';
                const isMakeup = session.status === 'MAKEUP';
                const isCancelled = session.status === 'CANCELLED';

                return (
                  <div
                    key={session.id}
                    className={`bg-white rounded-2xl border p-4 shadow-xs transition-all flex flex-col justify-between ${
                      isRescheduled
                        ? 'border-amber-300 bg-amber-50/20'
                        : isMakeup
                        ? 'border-blue-300 bg-blue-50/20'
                        : isCancelled
                        ? 'border-rose-300 bg-rose-50/20 opacity-75'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      {/* Top status & date */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-slate-900 text-white">
                            {session.sessionDate}
                          </span>
                          <span className="text-xs font-semibold text-slate-600">
                            週{['一','二','三','四','五','六','日'][session.dayOfWeek - 1] || session.dayOfWeek}
                          </span>
                        </div>

                        <div>
                          {isNormal && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              正常排課
                            </span>
                          )}
                          {isRescheduled && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              已調課
                            </span>
                          )}
                          {isMakeup && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              補課堂次
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              已停課
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Course info */}
                      {(() => {
                        const matchedClass = adminClasses.find((c) => c.id === session.classId);
                        const displayClassName = session.className || matchedClass?.name || matchedClass?.classCode || '華語密集班';
                        const displayCourseName = session.courseName || matchedClass?.courseName || matchedClass?.classroom || '';
                        const displayClassroom = session.classroom || matchedClass?.classroom || '';

                        return (
                          <div className="space-y-1 mt-2">
                            <div className={`font-extrabold text-sm ${isRescheduled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {displayClassName}
                            </div>
                            {displayCourseName && (
                              <div className="text-xs text-slate-600">
                                {displayCourseName}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono pt-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{session.startTime} - {session.endTime} ({session.periodsCount} 節)</span>
                              {displayClassroom && (
                                <>
                                  <span>•</span>
                                  <span>{displayClassroom}</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Notes / Reschedule info */}
                      {session.notes && (
                        <div className="mt-3 p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600 leading-tight">
                          {session.notes}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onSelectDate(session.sessionDate)}
                        className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline flex items-center gap-1"
                      >
                        <span>開啟點名</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>

                      <div className="flex items-center gap-1">
                        {isNormal && (
                          <>
                            <button
                              onClick={() => {
                                if (isLocked) {
                                  if (onShowToast) onShowToast('此學期已封存鎖定，禁止調課！', 'warning');
                                  return;
                                }
                                setRescheduleTargetSession(session);
                                setRescheduleDate('');
                                setRescheduleStartTime(session.startTime);
                                setRescheduleEndTime(session.endTime);
                              }}
                              disabled={isLocked}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                                isLocked
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              調課
                            </button>
                            <button
                              onClick={() => {
                                if (isLocked) {
                                  if (onShowToast) onShowToast('此學期已封存鎖定，禁止停課！', 'warning');
                                  return;
                                }
                                setCancelTargetSession(session);
                              }}
                              disabled={isLocked}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                                isLocked
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              停課
                            </button>
                          </>
                        )}

                        {(isCancelled || isRescheduled) && (
                          <button
                            onClick={() => handleRestore(session)}
                            disabled={isLocked}
                            className={`px-2 py-1 rounded text-xs font-bold border transition-colors inline-flex items-center gap-1 ${
                              isLocked
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>恢復正常</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Fallback Daily Schedule List (When Supabase table is not populated yet) */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">
              全季預設日程與調課總覽 ({daySummaries.length} 天)
            </h2>
            <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
              提示：Supabase 目前尚未正式產生課表，正顯示展示日程
            </span>
          </div>

          {daySummaries.map((day) => {
            const dayCourses = courses.filter((c) => c.date === day.date);

            return (
              <div
                key={day.date}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
                  day.isToday
                    ? 'border-teal-500 ring-2 ring-teal-200'
                    : day.hasReschedule
                    ? 'border-amber-300 bg-amber-50/10'
                    : day.hasMakeup
                    ? 'border-blue-300 bg-blue-50/10'
                    : 'border-slate-200'
                }`}
              >
                {/* Date Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                  <div className="flex items-center space-x-3">
                    <div className={`px-3 py-1.5 rounded-xl font-bold text-xs ${
                      day.isToday
                        ? 'bg-teal-600 text-white'
                        : day.isHoliday
                        ? 'bg-rose-100 text-rose-800'
                        : day.isWeekend
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-slate-900 text-white'
                    }`}>
                      {day.fullDisplay}
                    </div>
                    {day.isToday && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        今日
                      </span>
                    )}
                    {day.isHoliday && (
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        {day.holidayName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSelectDate(day.date)}
                      className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline flex items-center"
                    >
                      <span>在今日點名介面開啟</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </button>
                  </div>
                </div>

                {/* Courses on this day */}
                <div className="mt-3.5">
                  {day.isHoliday ? (
                    <div className="text-xs text-rose-600 font-medium py-2 flex items-center space-x-2">
                      <Info className="w-4 h-4" />
                      <span>本日為國定假日/中心停課日，無排課。</span>
                    </div>
                  ) : day.isWeekend ? (
                    <div className="text-xs text-slate-500 font-medium py-2">
                      週末公休日，教師休息。
                    </div>
                  ) : dayCourses.length === 0 ? (
                    <div className="text-xs text-slate-400 py-2">本日無排定課程。</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {dayCourses.map((c) => (
                        <div
                          key={c.id}
                          className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                            c.status === 'rescheduled_out'
                              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                              : c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in'
                              ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                              : c.status === 'completed'
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between font-mono font-bold text-[11px] mb-1">
                              <span>{c.timeSlot}</span>
                              {c.status === 'rescheduled_out' && (
                                <span className="text-amber-800 font-bold bg-amber-200 px-1 rounded">已調課</span>
                              )}
                              {(c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in') && (
                                <span className="text-blue-800 font-bold bg-blue-200 px-1 rounded">補課堂次</span>
                              )}
                              {c.status === 'completed' && (
                                <span className="text-emerald-800 font-bold bg-emerald-200 px-1 rounded">已完成</span>
                              )}
                              {c.status === 'unmarked' && !c.rescheduleInfo && (
                                <span className="text-slate-600 bg-slate-200 px-1 rounded">未點名</span>
                              )}
                            </div>
                            <div className={`font-extrabold text-sm ${c.status === 'rescheduled_out' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {c.courseName}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">{c.className} • {c.studentCount}人</div>

                            {c.rescheduleInfo && (
                              <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] leading-tight">
                                {c.rescheduleInfo.type === 'out' ? (
                                  <span className="text-amber-800 font-medium">
                                    ↳ 已移至 {c.rescheduleInfo.targetDate}
                                  </span>
                                ) : (
                                  <span className="text-blue-800 font-medium">
                                    ↳ 原定 {c.rescheduleInfo.originalDate}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {c.status !== 'rescheduled_out' && (
                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-end">
                              <button
                                onClick={() => {
                                  onSelectDate(c.date);
                                  onStartAttendance(c);
                                }}
                                className="text-[11px] font-bold text-teal-700 hover:text-teal-900"
                              >
                                {c.status === 'completed' ? '查看點名紀錄' : '開始點名 →'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Reschedule Session (調課作業) */}
      {rescheduleTargetSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">線上調課作業</h3>
                  <p className="text-xs text-slate-500">原堂次將標記已調課，並於新日期建立補課</p>
                </div>
              </div>
              <button
                onClick={() => setRescheduleTargetSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1 text-xs">
              <div className="text-slate-500 font-medium">原定課堂資訊：</div>
              <div className="font-bold text-slate-800">{rescheduleTargetSession.className}</div>
              <div className="text-slate-600 font-mono">
                {rescheduleTargetSession.sessionDate} ({rescheduleTargetSession.startTime} - {rescheduleTargetSession.endTime})
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  調課目標日期 (Target Date) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <TimeSelectPicker
                  label="開始時間 (時 : 分)"
                  value={rescheduleStartTime}
                  onChange={setRescheduleStartTime}
                  accentColor="amber"
                />
                <TimeSelectPicker
                  label="結束時間 (時 : 分)"
                  value={rescheduleEndTime}
                  onChange={setRescheduleEndTime}
                  accentColor="amber"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">調課原因說明</label>
                <textarea
                  rows={2}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="例：教師公假、颱風補課、校務活動調課..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setRescheduleTargetSession(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleConfirmReschedule}
                disabled={isSubmitting || !rescheduleDate}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                {isSubmitting ? '處理中...' : '確認調課'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Create Makeup Session (新增補課堂次) */}
      {isMakeupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">新增獨立補課堂次</h3>
                  <p className="text-xs text-slate-500">補課堂次將計入該班級的排課進度</p>
                </div>
              </div>
              <button
                onClick={() => setIsMakeupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  選擇補課班級 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={makeupClassId}
                  onChange={(e) => setMakeupClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs font-medium"
                >
                  {adminClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.classroom || '華語教室'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  補課日期 (Session Date) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={makeupDate}
                  onChange={(e) => setMakeupDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <TimeSelectPicker
                  label="開始時間"
                  value={makeupStartTime}
                  onChange={setMakeupStartTime}
                  accentColor="blue"
                />
                <TimeSelectPicker
                  label="結束時間"
                  value={makeupEndTime}
                  onChange={setMakeupEndTime}
                  accentColor="blue"
                />
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-xs">節數 (小時)</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={makeupPeriods}
                    onChange={(e) => setMakeupPeriods(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">補課事由</label>
                <input
                  type="text"
                  value={makeupReason}
                  onChange={(e) => setMakeupReason(e.target.value)}
                  placeholder="例：加強輔導、原定進度補課..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsMakeupModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleConfirmMakeup}
                disabled={isSubmitting || !makeupClassId || !makeupDate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                {isSubmitting ? '處理中...' : '確認新增補課'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Cancel Session (停課作業) */}
      {cancelTargetSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">課堂停課作業</h3>
                  <p className="text-xs text-slate-500">停課堂次將不計入排課進度</p>
                </div>
              </div>
              <button
                onClick={() => setCancelTargetSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50/50 rounded-xl space-y-1 text-xs border border-rose-100">
              <div className="text-rose-700 font-medium">欲停課堂次：</div>
              <div className="font-bold text-slate-800">{cancelTargetSession.className}</div>
              <div className="text-slate-600 font-mono">
                {cancelTargetSession.sessionDate} ({cancelTargetSession.startTime} - {cancelTargetSession.endTime})
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">停課原因說明</label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="例：天候颱風停課、學校重大活動、全校演習..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setCancelTargetSession(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                {isSubmitting ? '處理中...' : '確認停課'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
