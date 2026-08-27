import React, { useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2,
  Search, 
  Clock, 
  Sparkles, 
  Layers, 
  X, 
  CheckCircle,
  FileText,
  Bookmark,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { CourseDefinition } from '../../types';

interface AdminCourseCatalogViewProps {
  courses: CourseDefinition[];
  onAddCourse: (newCourse: Partial<CourseDefinition>) => Promise<void> | void;
  onUpdateCourse: (courseId: string, updatedCourse: Partial<CourseDefinition>) => Promise<void> | void;
  onDeleteCourse: (courseId: string) => Promise<void> | void;
  isLoading?: boolean;
}

export const AdminCourseCatalogView: React.FC<AdminCourseCatalogViewProps> = ({
  courses,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseDefinition | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<CourseDefinition | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Course Form State
  const [newForm, setNewForm] = useState({
    code: 'CHN-',
    name: '',
    level: '初級 A1',
    textbook: '《當代中文課程》',
    suggestedHours: 165,
    description: '',
    targetAudience: '',
  });

  const filteredCourses = courses.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.textbook && c.textbook.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchLevel = selectedLevelFilter === 'ALL' || c.level.includes(selectedLevelFilter);
    return matchSearch && matchLevel;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.code) {
      setErrorMessage('請填寫課程代碼與課程名稱！');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payload: Partial<CourseDefinition> = {
        code: newForm.code.toUpperCase().trim(),
        name: newForm.name.trim(),
        level: newForm.level.trim(),
        textbook: newForm.textbook.trim(),
        suggestedHours: Number(newForm.suggestedHours) || 165,
        description: newForm.description.trim() || '無詳細說明',
        targetAudience: newForm.targetAudience.trim() || '華語中心學員',
      };

      await onAddCourse(payload);
      setIsAddModalOpen(false);
      setNewForm({
        code: 'CHN-',
        name: '',
        level: '初級 A1',
        textbook: '《當代中文課程》',
        suggestedHours: 165,
        description: '',
        targetAudience: '',
      });
    } catch (err: any) {
      setErrorMessage(err.message || '建立課程規格失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onUpdateCourse(editingCourse.id, {
        code: editingCourse.code.toUpperCase().trim(),
        name: editingCourse.name.trim(),
        level: editingCourse.level.trim(),
        textbook: editingCourse.textbook.trim(),
        suggestedHours: Number(editingCourse.suggestedHours) || 165,
        description: editingCourse.description.trim(),
        targetAudience: editingCourse.targetAudience.trim(),
      });
      setEditingCourse(null);
    } catch (err: any) {
      setErrorMessage(err.message || '更新課程規格失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCourse) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onDeleteCourse(deletingCourse.id);
      setDeletingCourse(null);
    } catch (err: any) {
      setErrorMessage(err.message || '刪除課程規格失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <Bookmark className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-black text-slate-800">教材／課程標準定義 (Courses Catalog)</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
              共 {courses.length} 門教材規格
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            <strong>COURSE ≠ CLASS</strong>：此處為中心官方教材、等級綱要與建議總時數之標準定義；實際班級請至「開設班級管理」開課。
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMessage(null);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>新增教材課程規格</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 text-rose-800 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold">操作失敗提示</div>
            <div className="mt-0.5">{errorMessage}</div>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋教材 / 課程代碼 / 教材書名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={selectedLevelFilter}
            onChange={(e) => setSelectedLevelFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">全部級別 (A1~C1)</option>
            <option value="初級">初級 (A1/A2)</option>
            <option value="中級">中級 (B1/B2)</option>
            <option value="高級">高級 (C1)</option>
            <option value="基礎">基礎會話</option>
            <option value="中高階">商務 / 影視專題</option>
          </select>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <span className="text-xs font-bold">正在讀取 Supabase 課程定義...</span>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
          <p className="text-sm font-bold">尚無符合條件的課程定義</p>
          <p className="text-xs text-slate-400 mt-1">點擊右上角「新增教材課程規格」建立新課程</p>
        </div>
      ) : (
        /* Courses Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                      {course.code}
                    </span>
                    <h3 className="text-base font-black text-slate-800 mt-2">{course.name}</h3>
                  </div>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    {course.level}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400">官方指定教材</div>
                    <div className="font-semibold text-slate-700 mt-0.5">{course.textbook}</div>
                  </div>

                  <div className="text-slate-600 leading-relaxed text-[11px] line-clamp-2">
                    {course.description}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-700">適用對象：</span>
                    {course.targetAudience}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-1 text-xs text-indigo-700 font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>建議總時數：{course.suggestedHours} 小時</span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      setErrorMessage(null);
                      setEditingCourse(course);
                    }}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="編輯課程教材定義"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setErrorMessage(null);
                      setDeletingCourse(course);
                    }}
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="刪除課程教材定義"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                <span>新增教材課程標準規格</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">課程代碼 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：CHN-101"
                    value={newForm.code}
                    onChange={(e) => setNewForm({ ...newForm, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">課程名稱 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：初級華語一"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">語言級別 (TOCFL / CEFR)</label>
                  <input
                    type="text"
                    placeholder="例：初級 A1"
                    value={newForm.level}
                    onChange={(e) => setNewForm({ ...newForm, level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">建議總授課時數</label>
                  <input
                    type="number"
                    value={newForm.suggestedHours}
                    onChange={(e) => setNewForm({ ...newForm, suggestedHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">指定教科書 / 教材</label>
                <input
                  type="text"
                  placeholder="例：《當代中文課程》第一冊 (課本+作業本)"
                  value={newForm.textbook}
                  onChange={(e) => setNewForm({ ...newForm, textbook: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">課程內容簡介</label>
                <textarea
                  rows={2}
                  placeholder="課程目標、教學進度大綱..."
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">適用對象</label>
                <input
                  type="text"
                  placeholder="例：零起點或初學華語 0-50 小時之外籍學員"
                  value={newForm.targetAudience}
                  onChange={(e) => setNewForm({ ...newForm, targetAudience: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  disabled={isSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs flex items-center space-x-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>確認建立教材規格</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCourse && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <span>編輯課程教材規格：{editingCourse.name}</span>
              </h2>
              <button
                onClick={() => setEditingCourse(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">課程代碼</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.code}
                    onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">課程名稱</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">語言級別</label>
                  <input
                    type="text"
                    value={editingCourse.level}
                    onChange={(e) => setEditingCourse({ ...editingCourse, level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">建議總時數</label>
                  <input
                    type="number"
                    value={editingCourse.suggestedHours}
                    onChange={(e) => setEditingCourse({ ...editingCourse, suggestedHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">指定教材書名</label>
                <input
                  type="text"
                  value={editingCourse.textbook}
                  onChange={(e) => setEditingCourse({ ...editingCourse, textbook: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">課程內容簡介</label>
                <textarea
                  rows={2}
                  value={editingCourse.description}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">適用對象</label>
                <input
                  type="text"
                  value={editingCourse.targetAudience}
                  onChange={(e) => setEditingCourse({ ...editingCourse, targetAudience: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  disabled={isSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center space-x-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>儲存規格變更</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCourse && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center space-x-3 text-rose-600 mb-3">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">確認刪除教材課程？</h2>
                <span className="text-xs text-rose-600 font-mono font-bold">{deletingCourse.code}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              您即將刪除課程標準定義：<strong className="text-slate-800 font-bold">{deletingCourse.name}</strong>。
              <br />
              <span className="text-slate-400 mt-1 block">
                註：若目前已有班級使用此課程規格，系統將自動阻止刪除以維護班級資料完整性。
              </span>
            </p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeletingCourse(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center space-x-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>確認安全刪除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
