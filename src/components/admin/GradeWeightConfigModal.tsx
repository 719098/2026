import React, { useState, useEffect } from 'react';
import { X, Sliders, AlertCircle, CheckCircle2, RotateCcw, ShieldAlert, Users, Lock } from 'lucide-react';
import { Student, StudentGradeWeight } from '../../types';
import { DEFAULT_GRADE_WEIGHTS } from '../../utils/gradeUtils';

interface GradeWeightConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  students?: Student[];
  termId: string;
  termName?: string;
  isLocked?: boolean;
  initialResetMode?: boolean;
  currentWeight?: StudentGradeWeight | null;
  onSave: (weights: {
    attendanceWeight: number;
    quizWeight: number;
    midtermWeight: number;
    finalWeight: number;
    homeworkWeight: number;
    attitudeWeight: number;
    changeReason: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onResetToDefault: (changeReason: string) => Promise<{ success: boolean; error?: string }>;
}

export const GradeWeightConfigModal: React.FC<GradeWeightConfigModalProps> = ({
  isOpen,
  onClose,
  student,
  students = [],
  termId,
  termName,
  isLocked = false,
  initialResetMode = false,
  currentWeight,
  onSave,
  onResetToDefault,
}) => {
  const isBatch = Boolean(students && students.length > 0 && !student);
  const targetCount = isBatch ? students.length : 1;

  const [attendanceWeight, setAttendanceWeight] = useState<number>(20);
  const [quizWeight, setQuizWeight] = useState<number>(15);
  const [midtermWeight, setMidtermWeight] = useState<number>(20);
  const [finalWeight, setFinalWeight] = useState<number>(20);
  const [homeworkWeight, setHomeworkWeight] = useState<number>(15);
  const [attitudeWeight, setAttitudeWeight] = useState<number>(10);
  const [changeReason, setChangeReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsResetConfirmOpen(Boolean(initialResetMode));
      setChangeReason('');

      if (!isBatch && currentWeight) {
        setAttendanceWeight(currentWeight.attendanceWeight);
        setQuizWeight(currentWeight.quizWeight);
        setMidtermWeight(currentWeight.midtermWeight);
        setFinalWeight(currentWeight.finalWeight);
        setHomeworkWeight(currentWeight.homeworkWeight);
        setAttitudeWeight(currentWeight.attitudeWeight);
      } else {
        // Default 20, 15, 20, 20, 15, 10
        setAttendanceWeight(DEFAULT_GRADE_WEIGHTS.attendanceWeight);
        setQuizWeight(DEFAULT_GRADE_WEIGHTS.quizWeight);
        setMidtermWeight(DEFAULT_GRADE_WEIGHTS.midtermWeight);
        setFinalWeight(DEFAULT_GRADE_WEIGHTS.finalWeight);
        setHomeworkWeight(DEFAULT_GRADE_WEIGHTS.homeworkWeight);
        setAttitudeWeight(DEFAULT_GRADE_WEIGHTS.attitudeWeight);
      }
    }
  }, [isOpen, student, students, currentWeight, isBatch, initialResetMode]);

  if (!isOpen) return null;

  const totalSum =
    (Number(attendanceWeight) || 0) +
    (Number(quizWeight) || 0) +
    (Number(midtermWeight) || 0) +
    (Number(finalWeight) || 0) +
    (Number(homeworkWeight) || 0) +
    (Number(attitudeWeight) || 0);

  const isSumValid = totalSum === 100;
  const isReasonValid = changeReason.trim().length > 0;
  const areRangesValid =
    attendanceWeight >= 0 && attendanceWeight <= 100 &&
    quizWeight >= 0 && quizWeight <= 100 &&
    midtermWeight >= 0 && midtermWeight <= 100 &&
    finalWeight >= 0 && finalWeight <= 100 &&
    homeworkWeight >= 0 && homeworkWeight <= 100 &&
    attitudeWeight >= 0 && attitudeWeight <= 100;

  const canSubmit = isSumValid && isReasonValid && areRangesValid && !isSubmitting && !isLocked;

  const handleApplyDefaults = () => {
    if (isLocked) return;
    setAttendanceWeight(DEFAULT_GRADE_WEIGHTS.attendanceWeight);
    setQuizWeight(DEFAULT_GRADE_WEIGHTS.quizWeight);
    setMidtermWeight(DEFAULT_GRADE_WEIGHTS.midtermWeight);
    setFinalWeight(DEFAULT_GRADE_WEIGHTS.finalWeight);
    setHomeworkWeight(DEFAULT_GRADE_WEIGHTS.homeworkWeight);
    setAttitudeWeight(DEFAULT_GRADE_WEIGHTS.attitudeWeight);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await onSave({
        attendanceWeight,
        quizWeight,
        midtermWeight,
        finalWeight,
        homeworkWeight,
        attitudeWeight,
        changeReason: changeReason.trim(),
      });

      if (!res.success) {
        setErrorMsg(res.error || '儲存自訂權重失敗');
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || '操作發生異常');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async () => {
    if (isLocked) return;
    if (!changeReason.trim()) {
      setErrorMsg('請填寫恢復預設權重原因');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await onResetToDefault(changeReason.trim());
      if (!res.success) {
        setErrorMsg(res.error || '恢復預設權重失敗');
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || '操作發生異常');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {isBatch ? `批量設定成績權重 (${targetCount} 位學生)` : `設定成績權重 — ${student?.name || ''}`}
              </h3>
              <p className="text-xs text-slate-500">
                {termName || '指定學期'} • 六項權重合計必須等於 100%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Locked warning */}
          {isLocked && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2.5 text-xs text-amber-800">
              <Lock className="w-4 h-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">此學期已結算封存</p>
                <p className="text-amber-700 mt-0.5">學期成績已結算鎖定，禁止修改或恢復權重設定。</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">操作未成功</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Student target preview */}
          {isBatch ? (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-teal-600" />
                  已選取的學員名單 ({targetCount} 人，上限 500 人)
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                {students.map((s) => (
                  <span
                    key={s.id}
                    className="inline-block px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700"
                  >
                    {s.name} ({s.studentNumber})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="font-bold text-slate-800">{student?.name}</span>
                <span className="text-slate-500 font-mono ml-2">{student?.studentNumber}</span>
                <span className="text-slate-500 ml-2">({student?.className})</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                currentWeight ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {currentWeight ? '目前：個別自訂權重' : '目前：標準預設權重'}
              </span>
            </div>
          )}

          {/* Weight inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">六項成績比例設定 (0 ~ 100%)</label>
              {!isLocked && (
                <button
                  type="button"
                  onClick={handleApplyDefaults}
                  className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 hover:underline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  填入預設值 (20/15/20/20/15/10)
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* 出席成績 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>🕒 出席成績</span>
                  <span className="text-[10px] text-slate-400">預設 20%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={attendanceWeight}
                    onChange={(e) => setAttendanceWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* 平時測驗 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>✏️ 平時測驗</span>
                  <span className="text-[10px] text-slate-400">預設 15%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={quizWeight}
                    onChange={(e) => setQuizWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* 期中考試 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>📝 期中考試</span>
                  <span className="text-[10px] text-slate-400">預設 20%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={midtermWeight}
                    onChange={(e) => setMidtermWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* 期末考試 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>🎓 期末考試</span>
                  <span className="text-[10px] text-slate-400">預設 20%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={finalWeight}
                    onChange={(e) => setFinalWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* 作業習作 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>📚 作業習作</span>
                  <span className="text-[10px] text-slate-400">預設 15%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={homeworkWeight}
                    onChange={(e) => setHomeworkWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* 學習態度 */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span>🌟 學習態度</span>
                  <span className="text-[10px] text-slate-400">預設 10%</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={isLocked || isSubmitting}
                    value={attitudeWeight}
                    onChange={(e) => setAttitudeWeight(Number(e.target.value))}
                    className="w-full pr-7 pl-2.5 py-1.5 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>
            </div>

            {/* Sum validation indicator */}
            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              isSumValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center space-x-2">
                {isSumValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  {isSumValid
                    ? '比例總和正確 (100%)'
                    : `目前合計: ${totalSum}%（必須等於 100%，尚差 ${100 - totalSum}%）`}
                </span>
              </div>
              <span className="font-mono font-bold text-sm">{totalSum}% / 100%</span>
            </div>
          </div>

          {/* Change Reason Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>變更原因說明 (必填) <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              disabled={isLocked || isSubmitting}
              placeholder="例如：個別化學習專案調整、轉班學分採計認定..."
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Reset Confirm Box */}
          {isResetConfirmOpen && !isLocked && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs">
              <div className="flex items-start space-x-2 text-amber-800">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">確定要恢復為全校標準預設權重？</p>
                  <p className="text-slate-600 mt-0.5">
                    {isBatch
                      ? `選取的 ${targetCount} 位學生將移除個別自訂比例，回復為 20/15/20/20/15/10，系統會即時重新計算該學期成績。`
                      : `學員 ${student?.name} 將移除個別自訂比例，回復為 20/15/20/20/15/10，系統會即時重新計算該學期成績。`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleResetSubmit}
                  disabled={!isReasonValid || isSubmitting || isLocked}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {isSubmitting ? '處理中...' : '確認恢復預設'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div>
            {!isLocked && (((!isBatch && currentWeight) || isBatch)) ? (
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                disabled={isSubmitting}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                恢復預設權重
              </button>
            ) : null}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
            >
              {isSubmitting ? '儲存中...' : isBatch ? `套用至 ${targetCount} 位學生` : '儲存權重設定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
