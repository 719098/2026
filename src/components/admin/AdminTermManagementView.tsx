import React, { useState } from 'react';
import { 
  CalendarDays, 
  Plus, 
  Edit, 
  Search, 
  Layers, 
  Lock, 
  Unlock, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Calendar,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  ArrowRight,
  Info
} from 'lucide-react';
import { Term, ClassEntity } from '../../types';

interface AdminTermManagementViewProps {
  terms: Term[];
  classes: ClassEntity[];
  isLoading?: boolean;
  onAddTerm: (newTerm: Partial<Term>) => Promise<boolean | void> | void;
  onUpdateTerm: (termId: string, updatedTerm: Partial<Term>) => Promise<boolean | void> | void;
  onToggleActive: (termId: string, currentActive: boolean) => Promise<boolean | void> | void;
  onToggleLock: (termId: string, currentLocked: boolean) => Promise<boolean | void> | void;
  onDeleteTerm: (termId: string) => Promise<boolean | void> | void;
  onNavigateToClasses?: (termName: string) => void;
}

export const AdminTermManagementView: React.FC<AdminTermManagementViewProps> = ({
  terms,
  classes,
  isLoading = false,
  onAddTerm,
  onUpdateTerm,
  onToggleActive,
  onToggleLock,
  onDeleteTerm,
  onNavigateToClasses,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'UNLOCKED'>('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [deletingTerm, setDeletingTerm] = useState<Term | null>(null);
  const [lockingTerm, setLockingTerm] = useState<Term | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Term Form State
  const [newForm, setNewForm] = useState({
    name: '2026 秋季密集班 (第4期)',
    termCode: '2026F',
    startDate: '2026-11-01',
    endDate: '2027-02-28',
    isActive: true,
    isLocked: false,
  });

  // Calculate classes count per term
  const getClassCountForTerm = (term: Term) => {
    return classes.filter(
      (c) => (c.termId && c.termId === term.id) || (c.term && c.term.trim() === term.name.trim())
    ).length;
  };

  const filteredTerms = terms.filter((term) => {
    const matchSearch =
      term.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.termCode.toLowerCase().includes(searchTerm.toLowerCase());

    let matchStatus = true;
    if (statusFilter === 'ACTIVE') matchStatus = term.isActive;
    else if (statusFilter === 'INACTIVE') matchStatus = !term.isActive;
    else if (statusFilter === 'LOCKED') matchStatus = term.isLocked;
    else if (statusFilter === 'UNLOCKED') matchStatus = !term.isLocked;

    return matchSearch && matchStatus;
  });

  // Summary Metrics
  const totalTermsCount = terms.length;
  const activeTermsCount = terms.filter((t) => t.isActive).length;
  const lockedTermsCount = terms.filter((t) => t.isLocked).length;
  const totalClassesCount = classes.length;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);

    try {
      if (!newForm.name.trim()) {
        setActionError('請輸入學期名稱');
        setIsSubmitting(false);
        return;
      }
      if (!newForm.startDate || !newForm.endDate) {
        setActionError('請設定開課與結課日期');
        setIsSubmitting(false);
        return;
      }
      if (new Date(newForm.startDate) > new Date(newForm.endDate)) {
        setActionError('開課日期不可晚於結課日期');
        setIsSubmitting(false);
        return;
      }

      await onAddTerm({
        name: newForm.name.trim(),
        termCode: newForm.termCode.trim(),
        startDate: newForm.startDate,
        endDate: newForm.endDate,
        isActive: newForm.isActive,
        isLocked: newForm.isLocked,
      });

      setActionSuccess(`成功建立學期「${newForm.name}」！`);
      setIsAddModalOpen(false);
      setNewForm({
        name: '',
        termCode: '',
        startDate: '',
        endDate: '',
        isActive: true,
        isLocked: false,
      });
    } catch (err: any) {
      setActionError(err.message || '新增學期失敗，請重試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTerm) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);

    try {
      if (!editingTerm.name.trim()) {
        setActionError('請輸入學期名稱');
        setIsSubmitting(false);
        return;
      }
      if (!editingTerm.startDate || !editingTerm.endDate) {
        setActionError('請設定開課與結課日期');
        setIsSubmitting(false);
        return;
      }
      if (new Date(editingTerm.startDate) > new Date(editingTerm.endDate)) {
        setActionError('開課日期不可晚於結課日期');
        setIsSubmitting(false);
        return;
      }

      await onUpdateTerm(editingTerm.id, {
        name: editingTerm.name.trim(),
        termCode: editingTerm.termCode.trim(),
        startDate: editingTerm.startDate,
        endDate: editingTerm.endDate,
        isActive: editingTerm.isActive,
        isLocked: editingTerm.isLocked,
      });

      setActionSuccess(`學期「${editingTerm.name}」已更新！`);
      setEditingTerm(null);
    } catch (err: any) {
      setActionError(err.message || '更新學期失敗，請重試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTerm) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);

    try {
      await onDeleteTerm(deletingTerm.id);
      setActionSuccess(`學期「${deletingTerm.name}」已安全刪除！`);
      setDeletingTerm(null);
    } catch (err: any) {
      setActionError(err.message || '刪除學期失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmToggleLock = async () => {
    if (!lockingTerm) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);

    try {
      const nextLocked = !lockingTerm.isLocked;
      await onToggleLock(lockingTerm.id, lockingTerm.isLocked);
      setActionSuccess(
        `學期「${lockingTerm.name}」已${nextLocked ? '鎖定封存（唯讀保護）' : '解除鎖定（開放編輯）'}！`
      );
      setLockingTerm(null);
    } catch (err: any) {
      setActionError(err.message || '切換學期鎖定狀態失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert Messages */}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium text-sm">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium text-sm">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">學期期別管理 (Term Management)</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                管理中心正式學期期別、開課日期區間、開班狀態與歷史學期封存鎖定（即時同步 Supabase）
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setActionError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>新增學期期別</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">總學期期別數</span>
            <CalendarDays className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">{totalTermsCount}</p>
          <span className="text-xs text-slate-400 mt-1 block">Supabase terms 總筆數</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">進行／開放中學期</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2 font-mono">{activeTermsCount}</p>
          <span className="text-xs text-emerald-700/70 mt-1 block">開放供開班與選課</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700">已封存鎖定學期</span>
            <Lock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2 font-mono">{lockedTermsCount}</p>
          <span className="text-xs text-amber-700/70 mt-1 block">唯讀保護歷史學籍</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-700">全校開班總數</span>
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-black text-teal-600 mt-2 font-mono">{totalClassesCount}</p>
          <span className="text-xs text-teal-700/70 mt-1 block">關聯 classes 班級總數</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜尋學期名稱或代碼 (如 2026S)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(
            [
              { key: 'ALL', label: '全部學期' },
              { key: 'ACTIVE', label: '啟用中' },
              { key: 'INACTIVE', label: '已停用' },
              { key: 'LOCKED', label: '已鎖定' },
              { key: 'UNLOCKED', label: '未鎖定' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                statusFilter === filter.key
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terms Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mb-3" />
            <p className="font-bold">正在讀取 Supabase 學期資料...</p>
          </div>
        ) : filteredTerms.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-300 stroke-1" />
            <p className="font-bold text-slate-600 text-base">找不到符合條件的學期期別</p>
            <p className="text-sm text-slate-400 mt-1">請嘗試調整搜尋條件或點擊上方「新增學期期別」</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[13px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">學期名稱與期別代碼</th>
                  <th className="py-3.5 px-4">開課～結課日期區間</th>
                  <th className="py-3.5 px-4 text-center">關聯班級數</th>
                  <th className="py-3.5 px-4 text-center">開放狀態 (is_active)</th>
                  <th className="py-3.5 px-4 text-center">封存鎖定 (is_locked)</th>
                  <th className="py-3.5 px-4 text-right">操作管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTerms.map((term) => {
                  const boundCount = getClassCountForTerm(term);
                  return (
                    <tr key={term.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Code */}
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black font-mono text-xs border border-emerald-100 shrink-0">
                            {term.termCode || 'TERM'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center space-x-2">
                              <span>{term.name}</span>
                              {term.id === 'f230e634-2051-4606-ac49-adcb42480103' && (
                                <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
                                  現行正式學期
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              ID: {term.id.slice(0, 8)}... | 代碼: {term.termCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date Range */}
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2 font-mono text-xs text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{term.startDate || '未設定'}</span>
                          <span className="text-slate-400">至</span>
                          <span>{term.endDate || '未設定'}</span>
                        </div>
                      </td>

                      {/* Bound Classes */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => onNavigateToClasses && onNavigateToClasses(term.name)}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold font-mono transition-colors"
                          title="點擊查看該學期班級"
                        >
                          <Layers className="w-3.5 h-3.5 text-teal-600" />
                          <span>{boundCount} 個班級</span>
                        </button>
                      </td>

                      {/* Active Status */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => onToggleActive(term.id, term.isActive)}
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                            term.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {term.isActive ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-emerald-600" />
                              <span>啟用中</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-slate-400" />
                              <span>已停用</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Locked Status */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => {
                            setActionError(null);
                            setLockingTerm(term);
                          }}
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                            term.isLocked
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {term.isLocked ? (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-700" />
                              <span>已鎖定封存</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-slate-500" />
                              <span>開放編輯</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setActionError(null);
                              setEditingTerm(term);
                            }}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="編輯學期設定"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setActionError(null);
                              setDeletingTerm(term);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="刪除學期"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Term Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>新增學期期別 (Add Term)</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 mt-4 text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">學期名稱 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：2026 秋季密集班 (第4期)"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">期別代碼 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：2026F"
                  value={newForm.termCode}
                  onChange={(e) => setNewForm({ ...newForm, termCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">開課起始日期 *</label>
                  <input
                    type="date"
                    required
                    value={newForm.startDate}
                    onChange={(e) => setNewForm({ ...newForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">結課結束日期 *</label>
                  <input
                    type="date"
                    required
                    value={newForm.endDate}
                    onChange={(e) => setNewForm({ ...newForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">啟用學期 (is_active)</span>
                  <span className="text-[11px] text-slate-500">啟用後將在開設班級時開放作為選填學期</span>
                </div>
                <input
                  type="checkbox"
                  checked={newForm.isActive}
                  onChange={(e) => setNewForm({ ...newForm, isActive: e.target.checked })}
                  className="w-5 h-5 text-emerald-600 rounded-md focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '正在寫入 Supabase...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Term Modal */}
      {editingTerm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-emerald-600" />
                <span>編輯學期設定 (Edit Term)</span>
              </h2>
              <button
                onClick={() => setEditingTerm(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4 text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">學期名稱 *</label>
                <input
                  type="text"
                  required
                  value={editingTerm.name}
                  onChange={(e) => setEditingTerm({ ...editingTerm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">期別代碼 *</label>
                <input
                  type="text"
                  required
                  value={editingTerm.termCode}
                  onChange={(e) => setEditingTerm({ ...editingTerm, termCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">開課起始日期 *</label>
                  <input
                    type="date"
                    required
                    value={editingTerm.startDate}
                    onChange={(e) => setEditingTerm({ ...editingTerm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">結課結束日期 *</label>
                  <input
                    type="date"
                    required
                    value={editingTerm.endDate}
                    onChange={(e) => setEditingTerm({ ...editingTerm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">啟用狀態</span>
                    <span className="text-[11px] text-slate-500">是否開放開班</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editingTerm.isActive}
                    onChange={(e) => setEditingTerm({ ...editingTerm, isActive: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded-md focus:ring-emerald-500"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">鎖定封存</span>
                    <span className="text-[11px] text-slate-500">唯讀保護歷史</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editingTerm.isLocked}
                    onChange={(e) => setEditingTerm({ ...editingTerm, isLocked: e.target.checked })}
                    className="w-5 h-5 text-amber-600 rounded-md focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingTerm(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '正在儲存至 Supabase...' : '儲存變更'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lock/Unlock Confirmation Modal */}
      {lockingTerm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 text-amber-600 mb-4">
              <div className="p-3 bg-amber-50 rounded-full border border-amber-200">
                {lockingTerm.isLocked ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {lockingTerm.isLocked ? '解除學期鎖定 (Unlock)' : '鎖定封存學期 (Lock)'}
                </h3>
                <p className="text-xs text-slate-500">{lockingTerm.name}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2 mb-5 leading-relaxed">
              {lockingTerm.isLocked ? (
                <p>
                  解鎖後，教務人員將可再次針對此學期的班級、排課、成績與點名紀錄進行編輯。
                </p>
              ) : (
                <p>
                  <strong>鎖定保護說明：</strong>
                  <br />
                  學期鎖定後將視為歷史封存期別，系統將限制在此學期下新增班級或異動成績，以保護歷史學籍資料完整性。
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setLockingTerm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmToggleLock}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? '處理中...' : lockingTerm.isLocked ? '確認解除鎖定' : '確認鎖定封存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Term Confirmation Modal */}
      {deletingTerm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-full border border-rose-200">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">刪除學期期別 (Delete Term)</h3>
                <p className="text-xs text-slate-500">{deletingTerm.name}</p>
              </div>
            </div>

            {getClassCountForTerm(deletingTerm) > 0 ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2 mb-5">
                <div className="flex items-center space-x-2 font-bold text-rose-700">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>外鍵關聯安全保護：禁止刪除！</span>
                </div>
                <p className="leading-relaxed">
                  該學期目前尚有{' '}
                  <strong className="font-mono text-rose-950 font-black">
                    {getClassCountForTerm(deletingTerm)}
                  </strong>{' '}
                  個開設班級綁定中。為了確保班級與學籍資料之完整性，請先至「開設班級管理」將所屬班級刪除或轉移至其他學期後，方可刪除此學期。
                </p>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 mb-5">
                <p>
                  您確定要從 Supabase 資料庫永久刪除學期「<strong>{deletingTerm.name}</strong>」（代碼：
                  <span className="font-mono font-bold text-slate-800">{deletingTerm.termCode}</span>）嗎？此操作無法復原。
                </p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeletingTerm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm"
              >
                {getClassCountForTerm(deletingTerm) > 0 ? '了解並關閉' : '取消'}
              </button>
              {getClassCountForTerm(deletingTerm) === 0 && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '正在刪除...' : '確認刪除學期'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
