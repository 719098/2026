import React, { useState } from 'react';
import { 
  GraduationCap, 
  Plus, 
  Edit, 
  Search, 
  Mail, 
  Phone, 
  BookOpen, 
  CheckCircle, 
  X, 
  Sparkles,
  ArrowRightLeft,
  UserCheck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  Camera,
  Upload,
  Trash2
} from 'lucide-react';
import { Teacher, ClassEntity } from '../../types';
import { calculateNextTeacherNo, resetTeacherPasswordInSupabase } from '../../lib/teacherService';
import { TeacherAvatar } from '../TeacherAvatar';
import {
  uploadTeacherAvatar,
  deleteTeacherAvatar,
  validateTeacherAvatarFile
} from '../../lib/storageService';

interface AdminTeacherManagementViewProps {
  teachers: Teacher[];
  classes: ClassEntity[];
  onAddTeacher: (teacherData: {
    name: string;
    englishName?: string;
    email: string;
    phone?: string;
    specialty?: string;
    password?: string;
  }) => Promise<void> | void;
  onUpdateTeacher: (updatedTeacher: Teacher) => void;
  onReassignTeacherClasses: (teacherId: string, assignedClassNames: string[]) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => void;
}

export const AdminTeacherManagementView: React.FC<AdminTeacherManagementViewProps> = ({
  teachers,
  classes,
  onAddTeacher,
  onUpdateTeacher,
  onReassignTeacherClasses,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [assigningTeacher, setAssigningTeacher] = useState<Teacher | null>(null);
  const [selectedClassesForAssignment, setSelectedClassesForAssignment] = useState<string[]>([]);

  // Photo Upload State for Edit Modal
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDeleting, setPhotoDeleting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuccessMsg, setPhotoSuccessMsg] = useState<string | null>(null);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTeacher) return;

    setPhotoError(null);
    setPhotoSuccessMsg(null);

    const validation = validateTeacherAvatarFile(file);
    if (!validation.valid) {
      setPhotoError(validation.error || '照片格式或大小不符');
      return;
    }

    setPhotoUploading(true);
    try {
      const result = await uploadTeacherAvatar(editingTeacher.id, file);
      if (!result.success || !result.signedUrl) {
        setPhotoError(result.error || '上傳教師照片失敗');
      } else {
        const updatedTeacher = { ...editingTeacher, avatarUrl: result.signedUrl };
        setEditingTeacher(updatedTeacher);
        onUpdateTeacher(updatedTeacher);
        setPhotoSuccessMsg('教師照片已成功上傳並儲存至 Supabase Storage！');
        onRefresh?.();
      }
    } catch (err: any) {
      setPhotoError(`上傳照片發生例外錯誤: ${err.message || String(err)}`);
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    if (!editingTeacher) return;
    if (!confirm(`確定要刪除 ${editingTeacher.name} 老師的照片嗎？`)) return;

    setPhotoError(null);
    setPhotoSuccessMsg(null);
    setPhotoDeleting(true);

    try {
      const result = await deleteTeacherAvatar(editingTeacher.id);
      if (!result.success) {
        setPhotoError(result.error || '從 Supabase Storage 刪除照片失敗');
      } else {
        const updatedTeacher = { ...editingTeacher, avatarUrl: undefined };
        setEditingTeacher(updatedTeacher);
        onUpdateTeacher(updatedTeacher);
        setPhotoSuccessMsg('教師照片已成功從 Supabase Storage 刪除！');
        onRefresh?.();
      }
    } catch (err: any) {
      setPhotoError(`刪除照片發生例外錯誤: ${err.message || String(err)}`);
    } finally {
      setPhotoDeleting(false);
    }
  };

  // Reset Password Modal State
  const [resettingTeacher, setResettingTeacher] = useState<Teacher | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSuccessMsg, setResetPasswordSuccessMsg] = useState<string | null>(null);

  // Calculate next teacher_no dynamically
  const nextTeacherNo = calculateNextTeacherNo(teachers);

  // Created Teacher Success Modal State
  const [createdSuccessModal, setCreatedSuccessModal] = useState<{
    teacherNo: string;
    name: string;
    email: string;
  } | null>(null);

  // New Teacher Form State
  const [newForm, setNewForm] = useState({
    name: '',
    englishName: '',
    email: '',
    phone: '',
    specialty: '語法結構、商務華語、發音校正',
    password: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredTeachers = teachers.filter(
    (t) =>
      t.name.includes(searchTerm) ||
      (t.englishName && t.englishName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.teacherNo && t.teacherNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.includes(searchTerm) ||
      (t.specialty && t.specialty.includes(searchTerm))
  );

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newForm.name.trim()) {
      setFormError('請填寫教師中文姓名！');
      return;
    }
    if (!newForm.email.trim()) {
      setFormError('請填寫 Email (將作為登入帳號)！');
      return;
    }
    if (!newForm.password) {
      setFormError('請填寫登入初始密碼！');
      return;
    }
    if (newForm.password.length < 6) {
      setFormError('初始密碼長度至少需要 6 個字元！');
      return;
    }
    if (newForm.password !== newForm.confirmPassword) {
      setFormError('二次輸入的密碼不一致，請再次確認！');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddTeacher({
        name: newForm.name.trim(),
        englishName: newForm.englishName.trim(),
        email: newForm.email.trim(),
        phone: newForm.phone.trim(),
        specialty: newForm.specialty.trim(),
        password: newForm.password,
      });

      setCreatedSuccessModal({
        teacherNo: nextTeacherNo,
        name: newForm.name.trim(),
        email: newForm.email.trim(),
      });

      setIsAddModalOpen(false);
      setNewForm({
        name: '',
        englishName: '',
        email: '',
        phone: '',
        specialty: '語法結構、商務華語、發音校正',
        password: '',
        confirmPassword: '',
      });
    } catch (err: any) {
      console.error('handleAddTeacher error:', err);
      setFormError(err?.message ? `建立失敗: ${err.message}` : '建立教師時發生未預期錯誤');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setIsSubmitting(true);
    try {
      await onUpdateTeacher(editingTeacher);
      setEditingTeacher(null);
    } catch (err: any) {
      console.error('handleEditSubmit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAssignModal = (teacher: Teacher) => {
    setAssigningTeacher(teacher);
    // Find all classes taught by this teacher
    const taughtClasses = classes
      .filter((c) => c.teacherId === teacher.id || c.teacherName === teacher.name)
      .map((c) => c.name);
    setSelectedClassesForAssignment(taughtClasses);
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTeacher) return;
    onReassignTeacherClasses(assigningTeacher.id, selectedClassesForAssignment);
    setAssigningTeacher(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingTeacher) return;
    setResetPasswordError(null);
    setResetPasswordSuccessMsg(null);

    if (!resetPasswordInput || resetPasswordInput.length < 6) {
      setResetPasswordError('請輸入至少 6 位數的新密碼！');
      return;
    }

    setResetPasswordSubmitting(true);
    try {
      const res = await resetTeacherPasswordInSupabase({
        teacherId: resettingTeacher.id,
        profileId: resettingTeacher.profileId,
        email: resettingTeacher.email,
        newPassword: resetPasswordInput,
      });

      if (!res.success || res.error) {
        setResetPasswordError(res.error?.message || '重設密碼失敗');
      } else {
        setResetPasswordSuccessMsg(`🎉 已成功將【${resettingTeacher.name} 老師】的 Auth 密碼重設為新密碼！`);
        setTimeout(() => {
          setResettingTeacher(null);
          setResetPasswordInput('');
          setResetPasswordSuccessMsg(null);
        }, 2000);
      }
    } catch (err: any) {
      setResetPasswordError(err?.message || '重設密碼失敗');
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <GraduationCap className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">全校專兼任教師師資管理</h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">
              共 {teachers.length} 位專任教師
            </span>
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            維護全校教師基本資料、聯絡電話、專長領域、研究室分機與開課班級指派調動。
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>聘任 / 建立新教師</span>
        </button>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-md font-semibold flex items-center space-x-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新載入</span>
            </button>
          )}
        </div>
      )}

      {/* Search Bar & Refresh */}
      <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋教師姓名 / Email / 教學專長..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
          />
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="self-end sm:self-auto inline-flex items-center space-x-1.5 px-3 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] text-xs font-semibold border border-[#DCE2E6] rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>重新整理 Supabase 資料</span>
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#DCE2E6] p-12 text-center text-[#66717C]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#536B7A] mb-2" />
          <p className="text-xs font-semibold">正在從 Supabase 讀取教師資料表 (public.teachers)...</p>
        </div>
      ) : filteredTeachers.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-xl border border-[#DCE2E6] p-12 text-center text-[#66717C]">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-[#26313B] mb-1">
            {searchTerm ? '找不到符合搜尋條件的教師' : 'Supabase 目前無教師資料 (0 筆)'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
            {searchTerm
              ? '請嘗試切換搜尋關鍵字，或清除搜尋條件。'
              : '目前資料庫 public.teachers 尚未有任何教師資料。請點擊上方按鈕建立第一位專任或兼任教師。'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>立即聘任建立新教師</span>
            </button>
          )}
        </div>
      ) : (
        /* Teachers Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTeachers.map((teacher) => {
          // Find classes currently assigned to this teacher
          const teacherClasses = classes.filter(
            (c) => c.teacherId === teacher.id || c.teacherName === teacher.name
          );

          return (
            <div
              key={teacher.id}
              className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs hover:border-[#536B7A]/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header Profile */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3.5">
                    <TeacherAvatar
                      avatarUrl={teacher.avatarUrl}
                      name={teacher.name}
                      sizeClassName="w-14 h-14"
                      className="border-2 border-[#E8EEF2] shadow-2xs"
                    />
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-[#26313B]">{teacher.name} 老師</h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">
                          {teacher.title}
                        </span>
                      </div>
                      <div className="text-xs text-[#66717C] mt-0.5">{teacher.department}</div>
                      <div className="text-[10px] font-mono text-slate-400">教職員編號: {teacher.id}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setPhotoError(null);
                      setPhotoSuccessMsg(null);
                      setEditingTeacher(teacher);
                    }}
                    className="p-1.5 text-slate-400 hover:text-[#26313B] hover:bg-[#E8EEF2] rounded-md transition-colors"
                    title="編輯教師資料"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>

                {/* Contact & Info */}
                <div className="mt-4 space-y-2 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                    <div className="flex items-center space-x-1.5 p-2 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7]">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-[#26313B]">{teacher.email}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 p-2 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7]">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-[#26313B]">{teacher.phone || '+886 2-7749-5100'}</span>
                    </div>
                  </div>

                  {teacher.specialty && (
                    <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7] text-[11px] text-slate-600">
                      <span className="font-bold text-[#26313B]">教學專長：</span>
                      <span>{teacher.specialty}</span>
                    </div>
                  )}

                  {/* Assigned Classes */}
                  <div className="p-3 bg-[#F5F7F9] rounded-lg border border-[#DCE2E6]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#26313B] mb-2">
                      <span className="flex items-center space-x-1">
                        <BookOpen className="w-3.5 h-3.5 text-[#536B7A]" />
                        <span>目前授課班級 ({teacherClasses.length} 班)</span>
                      </span>
                      <button
                        onClick={() => openAssignModal(teacher)}
                        className="text-[#536B7A] hover:text-[#26313B] underline text-[11px]"
                      >
                        指派／更換班級
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {teacherClasses.length === 0 ? (
                        <span className="text-slate-400 text-xs">目前無指派授課班級</span>
                      ) : (
                        teacherClasses.map((cls) => (
                          <span
                            key={cls.id}
                            className="px-2.5 py-1 bg-white border border-[#DCE2E6] text-[#26313B] rounded-md text-xs font-semibold shadow-2xs"
                          >
                            {cls.name} ({cls.classroom})
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-4 pt-3 border-t border-[#F0F4F7] flex items-center justify-between text-xs">
                <span className="text-[#66717C] text-[11px]">
                  每週排課：{teacherClasses.reduce((acc, c) => acc + (c.dailyHours * 5), 0)} 小時
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setResettingTeacher(teacher);
                      setResetPasswordInput('');
                      setResetPasswordError(null);
                      setResetPasswordSuccessMsg(null);
                    }}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md font-semibold text-[11px] flex items-center space-x-1 transition-colors"
                    title="管理員重設此教師 Supabase Auth 登入密碼"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                    <span>重設密碼</span>
                  </button>
                  <button
                    onClick={() => openAssignModal(teacher)}
                    className="px-3 py-1 bg-[#536B7A] hover:bg-[#455865] text-white rounded-md font-semibold text-xs shadow-2xs"
                  >
                    配課管理
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Add Teacher Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-teal-600" />
                <span>聘任建立新教師檔案</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-red-700 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3.5 text-xs">
              {/* Auto-generated Teacher No Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-700 font-bold">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>自動計算教師編號：</span>
                </div>
                <span className="font-mono font-bold text-teal-700 bg-teal-100/60 border border-teal-200 px-3 py-1 rounded-lg text-xs">
                  {nextTeacherNo}
                </span>
              </div>

              {/* Basic Teacher Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">中文姓名 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：王淑華"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">英文姓名</label>
                  <input
                    type="text"
                    placeholder="例：Shu-Hua Wang"
                    value={newForm.englishName}
                    onChange={(e) => setNewForm({ ...newForm, englishName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email * (登入帳號)</label>
                  <input
                    type="email"
                    required
                    placeholder="shwang@pu.edu.tw"
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">聯絡電話</label>
                  <input
                    type="tel"
                    placeholder="例：04-26328001 #17011"
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教學專長領域 (Specialty)</label>
                <input
                  type="text"
                  placeholder="例：語法教學、會話操練、新聞華語、文化體驗"
                  value={newForm.specialty}
                  onChange={(e) => setNewForm({ ...newForm, specialty: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  disabled={isSubmitting}
                />
              </div>

              {/* Login Credentials (Supabase Auth) */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center space-x-1.5 text-slate-800 font-bold mb-2">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>登入帳號與初始密碼設定 (Supabase Auth)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">初始密碼 *</label>
                    <input
                      type="password"
                      required
                      placeholder="至少 6 位數密碼"
                      value={newForm.password}
                      onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">確認密碼 *</label>
                    <input
                      type="password"
                      required
                      placeholder="再次輸入密碼"
                      value={newForm.confirmPassword}
                      onChange={(e) => setNewForm({ ...newForm, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  密碼將透過加密安全創建於 Supabase Auth，不會以明碼儲存於公開資料表。
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setFormError(null);
                    setIsAddModalOpen(false);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在寫入 Supabase...</span>
                    </>
                  ) : (
                    <span>確認建立教師 (寫入 public.teachers)</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {editingTeacher && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-teal-600" />
                <span>編輯教師資料：{editingTeacher.name}</span>
              </h2>
              <button
                onClick={() => setEditingTeacher(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">姓名</label>
                  <input
                    type="text"
                    required
                    value={editingTeacher.name}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">職稱</label>
                  <input
                    type="text"
                    value={editingTeacher.title}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={editingTeacher.email}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">電話</label>
                  <input
                    type="tel"
                    value={editingTeacher.phone || ''}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">研究室 / 辦公室</label>
                <input
                  type="text"
                  value={editingTeacher.office || ''}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, office: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教學專長</label>
                <input
                  type="text"
                  value={editingTeacher.specialty || ''}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, specialty: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Teacher Photo Section (Supabase Storage: teacher-avatars) */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <span>教師照片 (Supabase Storage)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">JPG / PNG / WebP, 上限 5MB</span>
                </div>

                <div className="flex items-center space-x-3.5 pt-1">
                  <TeacherAvatar
                    avatarUrl={editingTeacher.avatarUrl}
                    name={editingTeacher.name}
                    sizeClassName="w-14 h-14"
                  />

                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs inline-flex items-center space-x-1 transition-colors">
                        {photoUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>上傳中...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>{editingTeacher.avatarUrl ? '更換照片' : '上傳照片'}</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleUploadPhoto}
                          disabled={photoUploading || photoDeleting}
                          className="hidden"
                        />
                      </label>

                      {editingTeacher.avatarUrl && (
                        <button
                          type="button"
                          onClick={handleDeletePhoto}
                          disabled={photoUploading || photoDeleting}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg text-xs inline-flex items-center space-x-1 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {photoDeleting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>刪除中...</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>刪除照片</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono">
                      Path: teacher-avatars/{editingTeacher.id}/avatar
                    </p>
                  </div>
                </div>

                {photoError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 font-bold text-[11px] flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                    <span>{photoError}</span>
                  </div>
                )}

                {photoSuccessMsg && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-bold text-[11px] flex items-center space-x-1">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>{photoSuccessMsg}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Classes Modal */}
      {assigningTeacher && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-teal-600" />
                <span>指派 / 更換授課班級：{assigningTeacher.name} 老師</span>
              </h2>
              <button
                onClick={() => setAssigningTeacher(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-3.5 text-xs">
              <p className="text-slate-500">
                請勾選由 <strong>{assigningTeacher.name} 老師</strong> 負責授課的班級：
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {classes.map((cls) => {
                  const isChecked = selectedClassesForAssignment.includes(cls.name);
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-teal-500 bg-teal-50/60'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClassesForAssignment([...selectedClassesForAssignment, cls.name]);
                            } else {
                              setSelectedClassesForAssignment(
                                selectedClassesForAssignment.filter((name) => name !== cls.name)
                              );
                            }
                          }}
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <div>
                          <div className="font-bold text-slate-800">{cls.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {cls.classroom} • {cls.timeSlot} • 現任教師: {cls.teacherName}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{cls.dailyHours}H/天</span>
                    </label>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAssigningTeacher(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs"
                >
                  確認指派授課
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teacher Created Success Confirmation Modal */}
      {createdSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 text-center mb-1">教師建立成功</h3>
            <p className="text-xs text-slate-500 text-center mb-5">
              已於 Supabase 安全建立 Auth 登入帳號與 public.teachers 基本檔案
            </p>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">教師編號：</span>
                <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-200/60">
                  {createdSuccessModal.teacherNo}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">姓名：</span>
                <span className="font-bold text-slate-800">{createdSuccessModal.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Email：</span>
                <span className="font-medium text-slate-800">{createdSuccessModal.email}</span>
              </div>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-500 font-medium">登入帳號：</span>
                <span className="font-medium text-slate-800">{createdSuccessModal.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">初始密碼：</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200/60">
                  已設定
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCreatedSuccessModal(null)}
              className="w-full mt-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors"
            >
              確認並完成
            </button>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingTeacher && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">重設教師 Auth 登入密碼</h3>
                  <p className="text-xs text-slate-500">
                    管理員可直接在服務端重設【{resettingTeacher.name} 老師】的 Supabase 登入密碼
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResettingTeacher(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-700 border border-slate-200/80">
                <div className="flex justify-between">
                  <span className="text-slate-500">教師姓名：</span>
                  <span className="font-bold">{resettingTeacher.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">登入 Email：</span>
                  <span className="font-mono font-medium text-slate-800">{resettingTeacher.email}</span>
                </div>
              </div>

              {resetPasswordError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{resetPasswordError}</span>
                </div>
              )}

              {resetPasswordSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center space-x-1.5">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{resetPasswordSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  請輸入全新初始密碼 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  placeholder="請輸入至少 6 位數之新密碼"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  required
                  minLength={6}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  密碼設定後將立即同步寫入 Supabase Auth 認證資料庫，不儲存於文字欄位。
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResettingTeacher(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  {resetPasswordSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在重設...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>確認重設密碼</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
