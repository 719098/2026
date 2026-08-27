import React, { useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Search, 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Sparkles, 
  X, 
  CheckCircle,
  GraduationCap,
  Layers,
  ArrowRight,
  Trash2,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Power
} from 'lucide-react';
import { ClassEntity, CourseDefinition, Teacher, Student, Term } from '../../types';

interface AdminClassManagementViewProps {
  classes: ClassEntity[];
  courses: CourseDefinition[];
  teachers: Teacher[];
  students: Student[];
  terms?: Term[];
  onAddClass: (newClass: Partial<ClassEntity>) => Promise<boolean | void> | void;
  onUpdateClass: (updatedClass: ClassEntity) => Promise<boolean | void> | void;
  onToggleClassStatus?: (classId: string, currentStatus: string) => Promise<boolean | void> | void;
  onDeleteClass?: (classId: string) => Promise<boolean | void> | void;
  onViewClassStudents: (classEntity: ClassEntity) => void;
}

export const AdminClassManagementView: React.FC<AdminClassManagementViewProps> = ({
  classes,
  courses,
  teachers,
  students,
  terms = [],
  onAddClass,
  onUpdateClass,
  onToggleClassStatus,
  onDeleteClass,
  onViewClassStudents,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTermFilter, setSelectedTermFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassEntity | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassEntity | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Class Form State
  const defaultTerm = terms.find((t) => t.isActive) || terms[0];

  const getInitialAddForm = () => {
    const activeTerm = terms.find((t) => t.isActive) || terms[0];
    const existingCodes = new Set(classes.map((c) => c.classCode));
    const yearStr = new Date().getFullYear();
    let candidateCode = `${yearStr}S-CLS-01`;
    let count = 1;
    while (existingCodes.has(candidateCode)) {
      count++;
      candidateCode = `${yearStr}S-CLS-${count < 10 ? '0' + count : count}`;
    }

    return {
      name: `2026 夏季 華語研習班 (${candidateCode})`,
      classCode: candidateCode,
      courseId: courses[0]?.id || '',
      teacherId: teachers[0]?.id || '',
      classroom: '華語中心 308 教室',
      termId: activeTerm?.id || '',
      term: activeTerm?.name || '2026 夏季密集班',
      startDate: activeTerm?.startDate || '2026-07-01',
      endDate: activeTerm?.endDate || '2026-10-31',
      dailyHours: 3,
      weeklyDays: [1, 2, 3, 4, 5],
      timeSlot: '09:00 - 12:00',
      totalTargetHours: courses[0]?.suggestedHours || 110,
      maxCapacity: 15,
      status: 'OPEN',
    };
  };

  const [newForm, setNewForm] = useState(getInitialAddForm);

  const filteredClasses = classes.filter((c) => {
    const matchSearch =
      c.name.includes(searchTerm) ||
      c.courseName.includes(searchTerm) ||
      c.teacherName.includes(searchTerm) ||
      c.classroom.includes(searchTerm);
    const matchTerm =
      selectedTermFilter === 'ALL' ||
      c.termId === selectedTermFilter ||
      c.term.includes(selectedTermFilter);
    return matchSearch && matchTerm;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    try {
      const course = courses.find((crs) => crs.id === newForm.courseId) || courses[0];
      const teacher = teachers.find((t) => t.id === newForm.teacherId) || teachers[0];
      const selectedTermObj = terms.find((t) => t.id === newForm.termId) || defaultTerm;

      const newClassPayload: Partial<ClassEntity> = {
        classCode: newForm.classCode || `CLS-${Date.now().toString().slice(-4)}`,
        name: newForm.name,
        courseId: course?.id || '',
        courseName: course?.name || newForm.name,
        teacherId: teacher?.id || '',
        teacherName: teacher?.name || '未指定教師',
        classroom: newForm.classroom,
        termId: selectedTermObj?.id || newForm.termId,
        term: selectedTermObj?.name || newForm.term,
        startDate: selectedTermObj?.startDate || newForm.startDate,
        endDate: selectedTermObj?.endDate || newForm.endDate,
        dailyHours: Number(newForm.dailyHours) || 3,
        weeklyDays: newForm.weeklyDays,
        timeSlot: newForm.timeSlot,
        totalTargetHours: Number(newForm.totalTargetHours) || course?.suggestedHours || 0,
        maxCapacity: Number(newForm.maxCapacity) || 15,
        status: newForm.status || 'OPEN',
      };

      await onAddClass(newClassPayload);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setActionError(err.message || '新增班級失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const course = courses.find((crs) => crs.id === editingClass.courseId);
      const teacher = teachers.find((t) => t.id === editingClass.teacherId);
      const selectedTermObj = terms.find((t) => t.id === editingClass.termId);

      const updated: ClassEntity = {
        ...editingClass,
        courseName: course ? course.name : editingClass.courseName,
        teacherName: teacher ? teacher.name : editingClass.teacherName,
        termId: selectedTermObj ? selectedTermObj.id : editingClass.termId,
        term: selectedTermObj ? selectedTermObj.name : editingClass.term,
        maxCapacity: Number(editingClass.maxCapacity) || 15,
        totalTargetHours: Number(editingClass.totalTargetHours) || course?.suggestedHours || 0,
      };

      await onUpdateClass(updated);
      setEditingClass(null);
    } catch (err: any) {
      setActionError(err.message || '更新班級失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (cls: ClassEntity) => {
    if (!onToggleClassStatus) return;
    const current = cls.status === 'OPEN' || !cls.status || cls.status === 'ongoing' ? 'OPEN' : 'CLOSED';
    const nextStatus = current === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      await onToggleClassStatus(cls.id, nextStatus);
    } catch (err: any) {
      alert(`更新班級狀態失敗: ${err.message || String(err)}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingClass || !onDeleteClass) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await onDeleteClass(deletingClass.id);
      setDeletingClass(null);
    } catch (err: any) {
      setActionError(err.message || '刪除班級失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">開設班級管理</h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">
              共開設 {classes.length} 個班級
            </span>
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            綁定官方教材（Course）、指派授課教師、排定教室、設定每日時數（2H/3H）與全季開課時程。
          </p>
        </div>

        <button
          onClick={() => {
            setActionError(null);
            setNewForm(getInitialAddForm());
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>開設新班級</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋班級名稱 / 所屬課程 / 授課教師 / 教室..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={selectedTermFilter}
            onChange={(e) => setSelectedTermFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部學期梯次</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.termCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Classes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredClasses.map((cls) => {
          const enrolledCount = students.filter(
            (s) => s.className === cls.name || s.classId === cls.id
          ).length;
          const isCapacityFull = enrolledCount >= cls.maxCapacity;
          const isOpen = cls.status === 'OPEN' || !cls.status || cls.status === 'ongoing';

          return (
            <div
              key={cls.id}
              className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs hover:border-[#536B7A]/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Top Badge & Title */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono font-bold bg-[#E8EEF2] text-[#536B7A] px-2 py-0.5 rounded-md border border-[#DCE2E6]">
                        {cls.classCode}
                      </span>
                      {isOpen ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          招生中 (OPEN)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E8EEF2] text-slate-600 border border-[#DCE2E6]">
                          已關閉 (CLOSED)
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#26313B] mt-2">{cls.name}</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 bg-[#F5F7F9] border border-[#DCE2E6] px-2.5 py-1 rounded-md shrink-0">
                    {cls.dailyHours} 小時制/天
                  </span>
                </div>

                {/* Info specs */}
                <div className="mt-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7]">
                    <span className="text-[#66717C] font-semibold">綁定教材定義：</span>
                    <span className="font-bold text-[#536B7A]">{cls.courseName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7]">
                      <span className="text-slate-400 block text-[10px]">授課教師</span>
                      <span className="font-bold text-[#26313B]">{cls.teacherName} 老師</span>
                    </div>
                    <div className="p-2 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7]">
                      <span className="text-slate-400 block text-[10px]">上課教室</span>
                      <span className="font-bold text-[#26313B]">{cls.classroom}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#F0F4F7] text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-[#66717C]">
                      <span>上課時段：</span>
                      <span className="font-mono font-bold text-[#26313B]">{cls.timeSlot}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#66717C]">
                      <span>開課期程：</span>
                      <span className="font-mono text-slate-700">{cls.startDate} ~ {cls.endDate}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#66717C]">
                      <span>規劃總時數：</span>
                      <span className="font-bold text-[#536B7A]">{cls.totalTargetHours} 小時</span>
                    </div>
                  </div>

                  {/* Student capacity */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#66717C] font-bold">在班人數 / 名額上限</span>
                      <span className={`font-bold ${isCapacityFull ? 'text-amber-700' : 'text-[#26313B]'}`}>
                        {enrolledCount} / {cls.maxCapacity} 人
                      </span>
                    </div>
                    <div className="w-full bg-[#E8EEF2] h-2 rounded-full overflow-hidden border border-[#DCE2E6]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCapacityFull ? 'bg-amber-500' : 'bg-[#536B7A]'
                        }`}
                        style={{ width: `${Math.min(100, (enrolledCount / cls.maxCapacity) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-[#F0F4F7] flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={() => onViewClassStudents(cls)}
                  className="text-xs text-[#536B7A] hover:text-[#26313B] font-semibold inline-flex items-center space-x-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>學生名單 ({enrolledCount})</span>
                </button>

                <div className="flex items-center space-x-1.5">
                  {onToggleClassStatus && (
                    <button
                      onClick={() => handleToggleStatus(cls)}
                      title={isOpen ? '點擊關閉此班級' : '點擊開放此班級'}
                      className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center space-x-1 border ${
                        isOpen
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-[#E8EEF2] text-slate-700 border-[#C9D1D7] hover:bg-[#DCE2E6]'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{isOpen ? '開放中' : '已關閉'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setActionError(null);
                      setEditingClass(cls);
                    }}
                    className="px-2.5 py-1.5 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] font-semibold border border-[#DCE2E6] rounded-md text-xs transition-colors flex items-center space-x-1"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>編輯</span>
                  </button>

                  {onDeleteClass && (
                    <button
                      onClick={() => {
                        setActionError(null);
                        setDeletingClass(cls);
                      }}
                      title={enrolledCount > 0 ? `尚有 ${enrolledCount} 名學生在班，無法刪除` : '刪除空班級'}
                      className={`p-1.5 rounded-md border transition-colors ${
                        enrolledCount > 0
                          ? 'bg-[#F5F7F9] text-slate-300 border-[#DCE2E6] cursor-not-allowed'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Class Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-teal-600" />
                <span>開設全新實體班級 (Class)</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">所屬學期期別 (Term) *</label>
                  <select
                    value={newForm.termId}
                    onChange={(e) => {
                      const selTerm = terms.find((t) => t.id === e.target.value);
                      setNewForm({
                        ...newForm,
                        termId: e.target.value,
                        term: selTerm?.name || newForm.term,
                        startDate: selTerm?.startDate || newForm.startDate,
                        endDate: selTerm?.endDate || newForm.endDate,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-emerald-700"
                  >
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.termCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">班級代碼 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：2026S-LV1-B"
                    value={newForm.classCode}
                    onChange={(e) => setNewForm({ ...newForm, classCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">班級全名 *</label>
                  <input
                    type="text"
                    required
                    placeholder="例：2026 夏季 初級華語一 B班"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">所屬教材課程 (Course) *</label>
                  <select
                    value={newForm.courseId}
                    onChange={(e) => setNewForm({ ...newForm, courseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-indigo-700"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.level})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">指派授課教師 *</label>
                  <select
                    value={newForm.teacherId}
                    onChange={(e) => setNewForm({ ...newForm, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} 老師 ({t.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">上課教室</label>
                  <input
                    type="text"
                    required
                    placeholder="例：華語中心 308 教室"
                    value={newForm.classroom}
                    onChange={(e) => setNewForm({ ...newForm, classroom: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">開班初始狀態</label>
                  <select
                    value={newForm.status}
                    onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-emerald-700"
                  >
                    <option value="OPEN">開放招生中 (OPEN)</option>
                    <option value="CLOSED">已關閉/額滿 (CLOSED)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">每日上課時段</label>
                  <input
                    type="text"
                    placeholder="例：09:00 - 12:00"
                    value={newForm.timeSlot}
                    onChange={(e) => setNewForm({ ...newForm, timeSlot: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">招生名額上限</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newForm.maxCapacity}
                    onChange={(e) => setNewForm({ ...newForm, maxCapacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">每日上課時數</label>
                  <select
                    value={newForm.dailyHours}
                    onChange={(e) => setNewForm({ ...newForm, dailyHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value={3}>3 小時（每日 3 節課）</option>
                    <option value={2}>2 小時（每日 2 節課）</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">規劃總目標時數</label>
                  <input
                    type="number"
                    value={newForm.totalTargetHours}
                    onChange={(e) => setNewForm({ ...newForm, totalTargetHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
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
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '正在寫入 Supabase...' : '確認開設此班級'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {editingClass && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Edit className="w-5 h-5 text-teal-600" />
                <span>編輯開班資訊：{editingClass.name}</span>
              </h2>
              <button
                onClick={() => setEditingClass(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">所屬學期期別 (Term)</label>
                  <select
                    value={editingClass.termId || ''}
                    onChange={(e) => {
                      const selTerm = terms.find((t) => t.id === e.target.value);
                      setEditingClass({
                        ...editingClass,
                        termId: e.target.value,
                        term: selTerm?.name || editingClass.term,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-emerald-700"
                  >
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.termCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">班級代碼</label>
                  <input
                    type="text"
                    required
                    value={editingClass.classCode}
                    onChange={(e) => setEditingClass({ ...editingClass, classCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">班級名稱</label>
                  <input
                    type="text"
                    required
                    value={editingClass.name}
                    onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">更換授課教師</label>
                  <select
                    value={editingClass.teacherId}
                    onChange={(e) => setEditingClass({ ...editingClass, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} 老師 ({t.department})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">所屬教材規格 (Course)</label>
                  <select
                    value={editingClass.courseId}
                    onChange={(e) => setEditingClass({ ...editingClass, courseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-indigo-700"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.level})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">教室地點</label>
                  <input
                    type="text"
                    required
                    value={editingClass.classroom}
                    onChange={(e) => setEditingClass({ ...editingClass, classroom: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">班級狀態</label>
                  <select
                    value={editingClass.status === 'CLOSED' || editingClass.status === 'completed' ? 'CLOSED' : 'OPEN'}
                    onChange={(e) => setEditingClass({ ...editingClass, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-emerald-700"
                  >
                    <option value="OPEN">開放招生中 (OPEN)</option>
                    <option value="CLOSED">已關閉/額滿 (CLOSED)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">上課時段</label>
                  <input
                    type="text"
                    value={editingClass.timeSlot}
                    onChange={(e) => setEditingClass({ ...editingClass, timeSlot: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">名額上限</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editingClass.maxCapacity}
                    onChange={(e) => setEditingClass({ ...editingClass, maxCapacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '正在儲存至 Supabase...' : '儲存開班變更'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {deletingClass && (() => {
        const enrolledStudents = students.filter(
          (s) => s.className === deletingClass.name || s.classId === deletingClass.id
        );
        const hasStudents = enrolledStudents.length > 0;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
              <div className="flex items-center space-x-3 text-rose-600 pb-3 border-b border-slate-100">
                <div className="p-2.5 bg-rose-50 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">刪除班級確認</h3>
                  <p className="text-xs text-slate-500 font-mono">{deletingClass.classCode}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">班級名稱：</span>
                    <span className="font-bold text-slate-800">{deletingClass.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">在班學生人數：</span>
                    <span className={`font-bold ${hasStudents ? 'text-amber-600' : 'text-slate-700'}`}>
                      {enrolledStudents.length} 人
                    </span>
                  </div>
                </div>

                {hasStudents ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-2">
                    <div className="flex items-center space-x-1.5 font-bold text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>此班級尚有學生在班，嚴格禁止刪除！</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      此班級尚有 <strong>{enrolledStudents.length} 名學生</strong>（例如：{enrolledStudents.map((s) => s.name).slice(0, 3).join('、')}{enrolledStudents.length > 3 ? ' 等' : ''}）。請先前往【學生管理】將學生轉班或移出此班級後，方可刪除此班級。
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-600 leading-relaxed">
                    確定要從 Supabase 正式刪除空班級【<strong>{deletingClass.name}</strong>】嗎？此操作將永久移除該班級紀錄，且無法復原。
                  </p>
                )}

                {actionError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                    {actionError}
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setDeletingClass(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  {hasStudents ? '我知道了（關閉）' : '取消'}
                </button>

                {!hasStudents && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleDeleteConfirm}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? '正在刪除...' : '確認永久刪除'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

