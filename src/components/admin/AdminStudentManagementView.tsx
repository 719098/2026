import React, { useState, useMemo } from 'react';
import { NationalitySelect } from '../NationalitySelect';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  UserPlus, 
  Edit, 
  History, 
  ShieldAlert, 
  CheckCircle, 
  X, 
  Download, 
  Eye, 
  Globe, 
  Mail, 
  Phone, 
  CreditCard, 
  Calendar,
  Sparkles,
  ArrowRightLeft,
  UserCheck,
  UserMinus,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  User
} from 'lucide-react';
import { Student, ClassEntity, EnrollmentStatus, StudentEnrollmentHistory } from '../../types';
import { StudentAvatar } from '../StudentAvatar';
import { uploadStudentAvatar, validateAvatarFile } from '../../lib/storageService';

interface AdminStudentManagementViewProps {
  students: Student[];
  classes: ClassEntity[];
  onAddStudent: (newStudent: Student) => void | Promise<void>;
  onUpdateStudent: (updatedStudent: Student) => void | Promise<void>;
  onDeleteStudent?: (studentId: string) => void | Promise<void>;
  onSelectStudentDetail: (student: Student) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => void;
}

export const AdminStudentManagementView: React.FC<AdminStudentManagementViewProps> = ({
  students,
  classes,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onSelectStudentDetail,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [statusChangeStudent, setStatusChangeStudent] = useState<Student | null>(null);
  const [viewHistoryStudent, setViewHistoryStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setEditAvatarFile(null);
    setEditAvatarPreview(student.avatarUrl || null);
    setAvatarError(null);
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      setAvatarError(validation.error || '大頭照驗證失敗');
      e.target.value = '';
      return;
    }

    setAvatarError(null);
    setEditAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setEditAvatarPreview(objectUrl);
  };

  // New Student Form State
  const [newForm, setNewForm] = useState({
    name: '',
    englishName: '',
    passportNumber: '',
    gender: 'M' as 'M' | 'F',
    nationality: '日本',
    nationalityCode: 'JP',
    className: '',
    email: '',
    phone: '',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  });

  // Status Change / Re-enroll Form State
  const [statusAction, setStatusAction] = useState<'withdrawn' | 're_enrolled' | 'graduated' | 'suspended'>('withdrawn');
  const [statusNote, setStatusNote] = useState('');
  const [reEnrollStudentNumber, setReEnrollStudentNumber] = useState('');
  const [reEnrollClass, setReEnrollClass] = useState(classes[0]?.name || '初級華語一');

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchSearch =
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.passportNumber && student.passportNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        student.nationality.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase());

      const isUnassigned = !student.className || student.className === '尚未分班' || student.className.trim() === '';
      const matchClass =
        selectedClassFilter === 'ALL' ||
        (selectedClassFilter === 'UNASSIGNED' && isUnassigned) ||
        (!isUnassigned && student.className === selectedClassFilter);

      const matchStatus =
        selectedStatusFilter === 'ALL' || (student.enrollmentStatus || 'active') === selectedStatusFilter;

      const matchRisk =
        selectedRiskFilter === 'ALL' ||
        (selectedRiskFilter === 'warning' && student.overallAttendanceRate < 85) ||
        (selectedRiskFilter === 'safe' && student.overallAttendanceRate >= 85);

      return matchSearch && matchClass && matchStatus && matchRisk;
    });
  }, [students, searchTerm, selectedClassFilter, selectedStatusFilter, selectedRiskFilter]);

  // Handle Add Student Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.englishName) {
      alert('請填寫學生中文姓名與英文姓名！');
      return;
    }

    const studentNum = `2026${String(students.length + 101)}`;
    const passport = newForm.passportNumber || `${newForm.nationalityCode}9${Date.now().toString().slice(-6)}`;
    const matchedClass = classes.find((c) => c.name === newForm.className || c.id === newForm.className);

    const newStudent: Student = {
      id: '', // Supabase will auto-generate
      studentNumber: studentNum,
      name: newForm.name,
      englishName: newForm.englishName,
      passportNumber: passport,
      avatarUrl: newForm.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      gender: newForm.gender,
      nationality: newForm.nationality,
      nationalityCode: newForm.nationalityCode,
      classId: matchedClass?.id,
      className: newForm.className || '',
      email: newForm.email || `${newForm.englishName.toLowerCase().replace(/\s+/g, '.')}@clc.student.tw`,
      phone: newForm.phone || '+886 900-000-000',
      overallAttendanceRate: 100.0,
      totalAbsenceHours: 0,
      totalLeaveHours: 0,
      totalPresentHours: 0,
      enrollmentStatus: 'active',
      admissionDate: '2026-07-01',
      enrollmentHistory: [
        {
          id: `HIST-${Date.now()}-1`,
          date: '2026-07-01',
          action: 'admitted',
          actionName: '新生註冊入學',
          fromClass: undefined,
          toClass: newForm.className || '尚未分班',
          studentNumber: studentNum,
          note: newForm.className
            ? `行政端建立新生檔案，分發至「${newForm.className}」。`
            : '行政端建立新生檔案（尚未分班）。',
          operator: '教務行政組',
        },
      ],
    };

    setIsSubmitting(true);
    try {
      await onAddStudent(newStudent);
      setIsAddModalOpen(false);
      setNewForm({
        name: '',
        englishName: '',
        passportNumber: '',
        gender: 'M',
        nationality: '日本',
        nationalityCode: 'JP',
        className: '',
        email: '',
        phone: '',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Student Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setIsSubmitting(true);
    setAvatarError(null);

    let updatedAvatarUrl = editingStudent.avatarUrl;

    try {
      if (editAvatarFile) {
        const uploadResult = await uploadStudentAvatar(editingStudent.id, editAvatarFile);
        if (!uploadResult.success) {
          setAvatarError(uploadResult.error || '大頭照上傳失敗，請重試');
          setIsSubmitting(false);
          return;
        }
        updatedAvatarUrl = uploadResult.signedUrl || uploadResult.storagePath || updatedAvatarUrl;
      }

      const updatedStudent: Student = {
        ...editingStudent,
        avatarUrl: updatedAvatarUrl,
      };

      await onUpdateStudent(updatedStudent);
      setEditingStudent(null);
      setEditAvatarFile(null);
      setEditAvatarPreview(null);
    } catch (err: any) {
      setAvatarError(err.message || '更新學生資料失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Change / Re-enroll Submit
  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusChangeStudent) return;

    const currentHistory = statusChangeStudent.enrollmentHistory || [];
    let updatedStatus: EnrollmentStatus = 'active';
    let actionName = '學籍異動';
    let newNum = statusChangeStudent.studentNumber;
    let targetClass = statusChangeStudent.className;

    if (statusAction === 'withdrawn') {
      updatedStatus = 'withdrawn';
      actionName = '辦理離校 / 退學';
    } else if (statusAction === 'graduated') {
      updatedStatus = 'graduated';
      actionName = '修業期滿畢業';
    } else if (statusAction === 'suspended') {
      updatedStatus = 'suspended';
      actionName = '辦理休學 / 保留學籍';
    } else if (statusAction === 're_enrolled') {
      updatedStatus = 'active';
      actionName = '重新入學 / 復學';
      newNum = reEnrollStudentNumber.trim() || `2026R${statusChangeStudent.studentNumber.slice(-3)}`;
      targetClass = reEnrollClass;
    }

    const newHistoryRecord: StudentEnrollmentHistory = {
      id: `HIST-${statusChangeStudent.id}-${Date.now()}`,
      date: '2026-08-18',
      action: statusAction,
      actionName,
      fromClass: statusChangeStudent.className,
      toClass: targetClass,
      studentNumber: newNum,
      note: statusNote || `行政管理員執行學籍異動：${actionName}`,
      operator: '行政主管',
    };

    const updatedStudent: Student = {
      ...statusChangeStudent,
      enrollmentStatus: updatedStatus,
      studentNumber: newNum,
      className: targetClass,
      enrollmentHistory: [newHistoryRecord, ...currentHistory],
    };

    setIsSubmitting(true);
    try {
      await onUpdateStudent(updatedStudent);
      setStatusChangeStudent(null);
      setStatusNote('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Confirm
  const handleDeleteConfirm = async () => {
    if (!deletingStudent || !onDeleteStudent) return;
    setIsSubmitting(true);
    try {
      await onDeleteStudent(deletingStudent.id);
      setDeletingStudent(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">全校外籍學員學籍管理</h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">
              共 {students.length} 位
            </span>
            {isLoading && (
              <span className="inline-flex items-center text-xs text-slate-400 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-[#536B7A]" />
                同步中...
              </span>
            )}
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            連線至 Supabase <code className="px-1 py-0.5 rounded bg-[#F5F7F9] font-mono text-[11px] text-[#26313B] border border-[#DCE2E6]">public.students</code> 資料庫，支援學員建立、學籍狀態異動與護照資料維護。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="重新載入資料庫"
              className="p-2 text-[#536B7A] hover:text-[#26313B] hover:bg-[#E8EEF2] border border-[#DCE2E6] rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>建立新生資料</span>
          </button>
        </div>
      </div>

      {/* Error Message Alert Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 text-xs space-y-2 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white">Supabase 資料庫權限或查詢提示</div>
                <div className="mt-0.5 text-slate-300 font-mono text-[11px] break-all">{errorMessage}</div>
              </div>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors border border-slate-600"
              >
                重新整理
              </button>
            )}
          </div>

          {errorMessage.includes('42501') && (
            <div className="mt-2 p-3 bg-slate-900 rounded-lg border border-slate-700 text-slate-300 text-[11px] space-y-1.5">
              <div className="font-bold text-slate-200 flex items-center space-x-1">
                <span>💡 PostgreSQL Table Grant 提示 (Permission Denied for table students)：</span>
              </div>
              <p className="text-slate-400">
                此錯誤表示 PostgreSQL 資料表層級尚未授予 <code>authenticated</code> 角色存取權限。
                請在 Supabase SQL Editor 中執行以下指令以開放已登入管理員之操作權限（不會更動現有 RLS 邏輯）：
              </p>
              <div className="p-2 bg-slate-950 text-slate-200 font-mono rounded text-[11px] overflow-x-auto select-all border border-slate-800">
                GRANT ALL ON public.students TO authenticated, service_role;
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search & Multi-Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜尋姓名 / 英文名 / 學號 / 護照 / 國籍..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
            />
          </div>

          {/* Class Filter */}
          <div>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
            >
              <option value="ALL">全部班級 ({students.length}人)</option>
              <option value="UNASSIGNED">尚未分班 ({students.filter(s => !s.className || s.className === '尚未分班' || s.className.trim() === '').length}人)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Enrollment Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
            >
              <option value="ALL">全部學籍狀態</option>
              <option value="active">在學中 (Active)</option>
              <option value="withdrawn">已離校 / 退學 (Withdrawn)</option>
              <option value="graduated">已結業 / 畢業 (Graduated)</option>
              <option value="suspended">休學中 (Suspended)</option>
            </select>
          </div>

          {/* Attendance Risk Filter */}
          <div>
            <select
              value={selectedRiskFilter}
              onChange={(e) => setSelectedRiskFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
            >
              <option value="ALL">全部出席率狀態</option>
              <option value="warning">簽證預警 (&lt; 85%)</option>
              <option value="safe">出席正常 (≥ 85%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white rounded-xl border border-[#DCE2E6] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F5F7F9] border-b border-[#DCE2E6] text-[#26313B] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">學員資訊</th>
                <th className="py-3.5 px-3">學號 / 護照號碼</th>
                <th className="py-3.5 px-3">國籍 / 性別</th>
                <th className="py-3.5 px-3">所屬班級</th>
                <th className="py-3.5 px-3">學籍狀態</th>
                <th className="py-3.5 px-3 text-right">出席率 / 缺課</th>
                <th className="py-3.5 px-4 text-center">行政操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F7]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-zinc-400 text-xs">
                    {students.length === 0 ? (
                      <div className="space-y-2">
                        <Users className="w-8 h-8 text-zinc-300 mx-auto" />
                        <div className="font-bold text-zinc-600">目前資料庫 (public.students) 尚無學員資料</div>
                        <p className="text-zinc-400 max-w-sm mx-auto">
                          請點擊右上角「建立新生資料」新增學員，資料將即時寫入 Supabase 資料庫。
                        </p>
                      </div>
                    ) : (
                      '查無符合搜尋與篩選條件的學員資料'
                    )}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const status = student.enrollmentStatus || 'active';
                  const isWarning = student.overallAttendanceRate < 85;

                  return (
                    <tr key={student.id} className="hover:bg-[#F8FAFC] transition-colors">
                      {/* Photo & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <StudentAvatar
                            avatarUrl={student.avatarUrl}
                            name={student.name}
                            sizeClassName="w-9 h-9"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-[#26313B] text-xs">
                              {student.name}
                            </div>
                            <div className="text-[11px] text-[#66717C] truncate">
                              {student.englishName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Student Number & Passport */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-[#26313B]">
                          {student.studentNumber}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          護照: {student.passportNumber || '未登錄'}
                        </div>
                      </td>

                      {/* Nationality & Gender */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1 font-medium text-slate-800">
                          <span>{student.nationality}</span>
                          <span className="text-[10px] text-slate-400">({student.gender === 'M' ? '男' : '女'})</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{student.phone}</div>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-3">
                        {!student.className || student.className === '尚未分班' || student.className.trim() === '' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#E8EEF2] text-slate-600 border border-[#DCE2E6]">
                            尚未分班
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#E8EEF2] text-[#26313B] border border-[#C9D1D7]">
                            {student.className}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {status === 'active' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <UserCheck className="w-3 h-3 mr-1 text-emerald-600" />
                            在學中
                          </span>
                        )}
                        {status === 'withdrawn' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                            <UserMinus className="w-3 h-3 mr-1 text-rose-600" />
                            已離校
                          </span>
                        )}
                        {status === 'graduated' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#E8EEF2] text-[#536B7A] border border-[#C9D1D7]">
                            <CheckCircle className="w-3 h-3 mr-1 text-[#536B7A]" />
                            已結業
                          </span>
                        )}
                        {status === 'suspended' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            休學中
                          </span>
                        )}
                      </td>

                      {/* Attendance */}
                      <td className="py-3 px-3 text-right">
                        <div className={`font-bold font-mono text-xs ${isWarning ? 'text-amber-700 underline decoration-amber-300 underline-offset-2' : 'text-[#26313B]'}`}>
                          {student.overallAttendanceRate}%
                        </div>
                        <div className="text-[10px] text-slate-400">
                          缺課 {student.totalAbsenceHours}H / 請假 {student.totalLeaveHours}H
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            title="檢視學生完整檔案與出席明細"
                            onClick={() => onSelectStudentDetail(student)}
                            className="p-1.5 text-[#536B7A] hover:text-[#26313B] hover:bg-[#E8EEF2] rounded-md transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            title="編輯基本資料"
                            onClick={() => openEditModal(student)}
                            className="p-1.5 text-[#536B7A] hover:text-[#26313B] hover:bg-[#E8EEF2] rounded-md transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            title="學籍異動（離校 / 重新入學）"
                            onClick={() => {
                              setStatusChangeStudent(student);
                              setStatusAction(student.enrollmentStatus === 'withdrawn' ? 're_enrolled' : 'withdrawn');
                              setReEnrollStudentNumber(`2026R${student.studentNumber.slice(-3)}`);
                            }}
                            className="p-1.5 text-[#536B7A] hover:text-[#26313B] hover:bg-[#E8EEF2] rounded-md transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            title="查看學籍異動與歷程"
                            onClick={() => setViewHistoryStudent(student)}
                            className="p-1.5 text-[#536B7A] hover:text-[#26313B] hover:bg-[#E8EEF2] rounded-md transition-colors"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {onDeleteStudent && (
                            <button
                              title="刪除學員資料"
                              onClick={() => setDeletingStudent(student)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add Student */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-teal-600" />
                <span>建立新外籍學員資料 (新生註冊)</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">中文姓名 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：林大衛"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">英文護照姓名 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：David Lin"
                    value={newForm.englishName}
                    onChange={(e) => setNewForm({ ...newForm, englishName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">護照號碼</label>
                  <input
                    type="text"
                    placeholder="例：US98765432"
                    value={newForm.passportNumber}
                    onChange={(e) => setNewForm({ ...newForm, passportNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">性別</label>
                  <select
                    value={newForm.gender}
                    onChange={(e) => setNewForm({ ...newForm, gender: e.target.value as 'M' | 'F' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="M">男 (Male)</option>
                    <option value="F">女 (Female)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">國籍</label>
                  <NationalitySelect
                    value={newForm.nationality}
                    onChange={(nat, code) => setNewForm({ ...newForm, nationality: nat, nationalityCode: code })}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">分派班級 *</label>
                  <select
                    value={newForm.className}
                    onChange={(e) => setNewForm({ ...newForm, className: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">電子信箱 Email</label>
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">聯絡電話</label>
                  <input
                    type="tel"
                    placeholder="+886 912-345-678"
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs"
                >
                  確認建立新生檔案
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Student */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <span>編輯學員資料：{editingStudent.name} ({editingStudent.studentNumber})</span>
              </h2>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">中文姓名</label>
                  <input
                    type="text"
                    required
                    value={editingStudent.name}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">英文姓名</label>
                  <input
                    type="text"
                    required
                    value={editingStudent.englishName || editingStudent.ename || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, englishName: e.target.value, ename: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">護照號碼</label>
                  <input
                    type="text"
                    value={editingStudent.passportNumber || editingStudent.idno || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, passportNumber: e.target.value, idno: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">國籍</label>
                  <NationalitySelect
                    value={editingStudent.nationality || editingStudent.nation || '日本'}
                    onChange={(nat, code) => setEditingStudent({ ...editingStudent, nationality: nat, nationalityCode: code, nation: nat, natcode: code })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">所屬班級</label>
                  <select
                    value={editingStudent.className || ''}
                    onChange={(e) => {
                      const selectedClassName = e.target.value;
                      const matched = classes.find((c) => c.name === selectedClassName || c.id === selectedClassName);
                      setEditingStudent({
                        ...editingStudent,
                        className: selectedClassName,
                        classId: matched ? matched.id : undefined,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-blue-900"
                  >
                    <option value="">尚未分班</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">性別</label>
                  <select
                    value={editingStudent.gender || editingStudent.sex || 'M'}
                    onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value as 'M' | 'F', sex: e.target.value as 'M' | 'F' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="M">男 (Male)</option>
                    <option value="F">女 (Female)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingStudent.email || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">電話</label>
                  <input
                    type="tel"
                    value={editingStudent.phone || editingStudent.mobilePhone || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value, mobilePhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* 學生大頭照 (Student Avatar Upload) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>學生大頭照</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    支援 JPEG, PNG, WebP (≤ 5 MB)
                  </span>
                </div>

                <div className="flex items-center space-x-3.5">
                  {/* Photo Preview / Current Photo */}
                  <div className="relative shrink-0">
                    {editAvatarPreview && editAvatarPreview.trim() !== '' ? (
                      <img
                        src={editAvatarPreview}
                        alt="學生大頭照預覽"
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500/80 shadow-xs bg-white"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-center p-1">
                        <User className="w-6 h-6 text-slate-300 mb-0.5" />
                        <span className="text-[9px] font-bold text-slate-400 leading-tight">尚未上傳</span>
                      </div>
                    )}
                  </div>

                  {/* Actions & Feedback */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <label className="cursor-pointer inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs shadow-2xs transition-colors">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>{editAvatarPreview ? '更換照片' : '選擇照片'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarFileSelect}
                          className="hidden"
                        />
                      </label>

                      {editAvatarPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditAvatarFile(null);
                            setEditAvatarPreview(null);
                            setEditingStudent({ ...editingStudent, avatarUrl: '' });
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs transition-colors"
                          title="清除目前照片"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>清除照片</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500">
                      {editAvatarFile ? (
                        <span className="text-emerald-700 font-medium">
                          已選取新照片：{editAvatarFile.name} ({(editAvatarFile.size / 1024).toFixed(1)} KB)
                        </span>
                      ) : editAvatarPreview ? (
                        '目前已有大頭照，可點選「更換照片」更新。'
                      ) : (
                        '尚未上傳大頭照，請點選「選擇照片」。'
                      )}
                    </p>
                  </div>
                </div>

                {/* Validation Error Message */}
                {avatarError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{avatarError}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Status Change / Re-enroll */}
      {statusChangeStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <RefreshCw className="w-5 h-5 text-amber-600" />
                <span>學籍異動辦理：{statusChangeStudent.name}</span>
              </h2>
              <button
                onClick={() => setStatusChangeStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStatusChangeSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-800">{statusChangeStudent.name} ({statusChangeStudent.englishName})</div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  原學號：<span className="font-mono font-bold text-slate-700">{statusChangeStudent.studentNumber}</span> • 原班級：{statusChangeStudent.className}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">異動類別</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusAction('withdrawn')}
                    className={`p-2.5 rounded-xl border font-bold text-left text-xs ${
                      statusAction === 'withdrawn'
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    辦理離校 / 退學
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusAction('re_enrolled')}
                    className={`p-2.5 rounded-xl border font-bold text-left text-xs ${
                      statusAction === 're_enrolled'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    重新入學 / 復學
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusAction('graduated')}
                    className={`p-2.5 rounded-xl border font-bold text-left text-xs ${
                      statusAction === 'graduated'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    修業期滿畢業
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusAction('suspended')}
                    className={`p-2.5 rounded-xl border font-bold text-left text-xs ${
                      statusAction === 'suspended'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    辦理休學
                  </button>
                </div>
              </div>

              {statusAction === 're_enrolled' && (
                <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200 space-y-3">
                  <div className="text-[11px] font-bold text-teal-800">
                    💡 重新入學設定：可依教務規定產生全新學號並重新指派班級
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">新入學學號</label>
                      <input
                        type="text"
                        value={reEnrollStudentNumber}
                        onChange={(e) => setReEnrollStudentNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono bg-white"
                        placeholder="例：2026R105"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">復學班級</label>
                      <select
                        value={reEnrollClass}
                        onChange={(e) => setReEnrollClass(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">異動原因 / 核准公文備註</label>
                <textarea
                  rows={2}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="例：因個人工作調度申請離校手續，押金已退訖。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setStatusChangeStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs"
                >
                  確認執行學籍異動
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: View Enrollment History */}
      {viewHistoryStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <History className="w-5 h-5 text-purple-600" />
                <span>學籍與分班歷程日誌：{viewHistoryStudent.name}</span>
              </h2>
              <button
                onClick={() => setViewHistoryStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">{viewHistoryStudent.name} ({viewHistoryStudent.englishName})</div>
                  <div className="text-[11px] text-slate-500">學號: {viewHistoryStudent.studentNumber} • 護照: {viewHistoryStudent.passportNumber}</div>
                </div>
                <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg">
                  現所屬：{viewHistoryStudent.className}
                </span>
              </div>

              <div className="space-y-2 mt-3 max-h-[300px] overflow-y-auto pr-1">
                {(viewHistoryStudent.enrollmentHistory || []).map((hist) => (
                  <div key={hist.id} className="p-3 bg-white border border-slate-200 rounded-xl relative pl-4">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px]">
                        {hist.actionName}
                      </span>
                      <span className="text-slate-400 text-[10px]">{hist.date}</span>
                    </div>
                    <div className="text-slate-600 text-[11px] mt-1.5">
                      {hist.note}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                      <span>經辦人：{hist.operator}</span>
                      {hist.studentNumber && <span>學號紀錄：{hist.studentNumber}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setViewHistoryStudent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Delete Student Confirmation */}
      {deletingStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center space-x-3 text-rose-600 mb-3">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">確認刪除學員資料</h3>
                <p className="text-xs text-slate-500">此動作將從 Supabase 資料庫永久刪除</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 my-4 text-xs space-y-1">
              <div className="font-bold text-slate-800">
                {deletingStudent.name} ({deletingStudent.englishName})
              </div>
              <div className="text-slate-500">
                學號：<span className="font-mono font-bold text-slate-700">{deletingStudent.studentNumber}</span>
              </div>
              <div className="text-slate-500">
                班級：{deletingStudent.className} • 國籍：{deletingStudent.nationality}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeletingStudent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs disabled:opacity-50 inline-flex items-center space-x-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                <span>確認刪除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
