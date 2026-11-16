import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, X, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

interface TeacherPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const TeacherPasswordModal: React.FC<TeacherPasswordModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  onShowToast,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateNewPassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return '新密碼長度至少需為 8 個字元。';
    }
    if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
      return '新密碼需同時包含英文字母與數字，以符合安全規則。';
    }
    if (pwd === currentPassword) {
      return '新密碼不可與目前密碼相同。';
    }
    if (pwd !== confirmPassword) {
      return '兩次輸入的新密碼不一致，請重新確認。';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('請輸入目前密碼。');
      return;
    }

    const validationError = validateNewPassword(newPassword);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    if (!supabase) {
      setErrorMsg('系統驗證服務尚未連線，請稍後再試。');
      return;
    }

    if (!userEmail) {
      setErrorMsg('找不到目前登入教師帳號之 Email，請重新登入後再試。');
      return;
    }

    setSubmitting(true);
    try {
      // 1. 驗證目前登入者之目前密碼是否正確
      const { data: sessionData } = await supabase.auth.getUser();
      const loggedInEmail = sessionData?.user?.email || userEmail;

      if (loggedInEmail.toLowerCase() !== userEmail.toLowerCase()) {
        setErrorMsg('登入帳號狀態異常，僅可修改本人密碼。');
        setSubmitting(false);
        return;
      }

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: loggedInEmail,
        password: currentPassword,
      });

      if (verifyErr) {
        setErrorMsg('目前密碼不正確，請確認後再試。');
        setSubmitting(false);
        return;
      }

      // 2. 使用 Supabase Auth updateUser 更新目前登入者自己的密碼
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setErrorMsg(`修改密碼失敗：${updateErr.message}`);
        setSubmitting(false);
        return;
      }

      setSuccessMsg('密碼已成功更新，下次登入請使用新密碼。');
      if (onShowToast) {
        onShowToast('登入密碼已成功更新！', 'success');
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message || '修改密碼時發生未預期錯誤，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-[#DCE2E6] shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 bg-[#26313B] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-white/10">
              <KeyRound className="w-4 h-4 text-teal-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold">帳號安全設定－修改密碼</h3>
              <p className="text-[11px] text-slate-300 truncate max-w-[240px]">{userEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-[#536B7A] shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              基於帳號安全考量，新密碼須至少 <strong>8 個字元</strong>，並同時包含<strong>英文字母與數字</strong>。
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-2 text-xs text-rose-700 font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-2 text-xs text-emerald-700 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="teacher-current-password" className="block text-xs font-bold text-slate-700 mb-1">
              目前密碼 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="teacher-current-password"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="請輸入目前登入密碼"
                autoComplete="current-password"
                className="w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A]/30 focus:border-[#536B7A]"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="teacher-new-password" className="block text-xs font-bold text-slate-700 mb-1">
              新密碼 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="teacher-new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 碼，含英文字母與數字"
                autoComplete="new-password"
                className="w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A]/30 focus:border-[#536B7A]"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="teacher-confirm-password" className="block text-xs font-bold text-slate-700 mb-1">
              確認新密碼 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="teacher-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="請再次輸入新密碼"
                autoComplete="new-password"
                className="w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A]/30 focus:border-[#536B7A]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              id="btn-submit-teacher-password"
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-white bg-[#26313B] hover:bg-[#1b242c] rounded-lg transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>更新中...</span>
                </>
              ) : (
                <span>確認修改密碼</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
