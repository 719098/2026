import React, { useState, useMemo } from 'react';
import { 
  ArrowRightLeft, 
  Users, 
  BookOpen, 
  Search, 
  CheckCircle, 
  Clock, 
  History, 
  Plus, 
  UserCheck, 
  X,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  Layers,
  GraduationCap
} from 'lucide-react';
import { Student, ClassEntity, TransferClassRecord } from '../../types';
import { StudentAvatar } from '../StudentAvatar';

interface AdminClassAssignmentViewProps {
  students: Student[];
  classes: ClassEntity[];
  transferRecords: TransferClassRecord[];
  onTransferStudent: (record: TransferClassRecord) => void;
  onSelectStudentDetail: (student: Student) => void;
}

export const AdminClassAssignmentView: React.FC<AdminClassAssignmentViewProps> = ({
  students,
  classes,
  transferRecords,
  onTransferStudent,
  onSelectStudentDetail,
}) => {
  // Active Tab: 'ALL' | 'UNASSIGNED' | classId
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [assigningStudent, setAssigningStudent] = useState<Student | null>(null);
  const [assignTargetClassId, setAssignTargetClassId] = useState<string>(classes?.[0]?.id || '');

  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState<string>('');
  const [transferReason, setTransferReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [operatorName, setOperatorName] = useState('教務行政組');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Unassigned students count
  const unassignedStudents = useMemo(() => {
    return students.filter(
      (s) => !s.className || s.className === '尚未分班' || s.className.trim() === ''
    );
  }, [students]);

  // Tab students
  const tabStudents = useMemo(() => {
    if (activeTab === 'ALL') {
      return students;
    }
    if (activeTab === 'UNASSIGNED') {
      return unassignedStudents;
    }
    const currentClass = classes.find(
      (c) => String(c.id) === String(activeTab) || c.name === activeTab
    );
    return students.filter(
      (s) =>
        s.className === currentClass?.name ||
        String(s.classId) === String(activeTab) ||
        (currentClass && String(s.classId) === String(currentClass.id))
    );
  }, [students, unassignedStudents, activeTab, classes]);

  // Filtered by search
  const filteredStudents = useMemo(() => {
    return tabStudents.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.studentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.passportNumber && s.passportNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.nationality.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [tabStudents, searchTerm]);

  // Open Assign Modal (for unassigned student)
  const openAssignModal = (student: Student) => {
    setAssigningStudent(student);
    setAssignTargetClassId(classes[0]?.id || '');
  };

  // Submit Assign Class
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningStudent) return;
    const targetClass = classes.find(
      (c) => String(c.id) === String(assignTargetClassId) || c.name === assignTargetClassId
    );
    if (!targetClass) {
      alert('請選擇目標班級！');
      return;
    }

    const newRecord: TransferClassRecord = {
      id: `ASSIGN-${Date.now().toString().slice(-6)}`,
      studentId: assigningStudent.id,
      studentName: assigningStudent.name,
      fromClassId: '',
      fromClassName: '尚未分班',
      toClassId: targetClass.id,
      toClassName: targetClass.name,
      transferDate: effectiveDate,
      reason: '期初學員分班指派入班',
      operator: operatorName,
      effectiveImmediately: true,
    };

    setIsSubmitting(true);
    try {
      await onTransferStudent(newRecord);
      setAssigningStudent(null);
    } catch (err) {
      console.error('Error assigning student to class:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Transfer Modal (for already assigned student)
  const openTransferModal = (student?: Student) => {
    if (student) {
      setTransferringStudent(student);
      const available = classes.filter(
        (c) => c.name !== student.className && String(c.id) !== String(student.classId)
      );
      setTransferTargetClassId(available?.[0]?.id || classes?.[0]?.id || '');
    } else {
      // Pick first student with a class if called generically
      const assignedOne = students.find((s) => s.className && s.className !== '尚未分班');
      if (assignedOne) {
        setTransferringStudent(assignedOne);
        const available = classes.filter(
          (c) => c.name !== assignedOne.className && String(c.id) !== String(assignedOne.classId)
        );
        setTransferTargetClassId(available?.[0]?.id || classes?.[0]?.id || '');
      } else if (students && students.length > 0 && students[0]) {
        openAssignModal(students[0]);
        return;
      }
    }
    setTransferReason('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
  };

  // Submit Transfer Class
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringStudent) return;
    const targetClass = classes.find(
      (c) => String(c.id) === String(transferTargetClassId) || c.name === transferTargetClassId
    );

    if (!targetClass) {
      alert('請選擇轉往之目標班級！');
      return;
    }

    if (transferringStudent.className === targetClass.name) {
      alert('目標班級與目前所屬班級相同，無需轉班！');
      return;
    }

    const currentClass = classes.find(
      (c) => c.name === transferringStudent.className || String(c.id) === String(transferringStudent.classId)
    );

    const newRecord: TransferClassRecord = {
      id: `TRF-${Date.now().toString().slice(-6)}`,
      studentId: transferringStudent.id,
      studentName: transferringStudent.name,
      fromClassId: currentClass?.id || '',
      fromClassName: transferringStudent.className || '尚未分班',
      toClassId: targetClass.id,
      toClassName: targetClass.name,
      transferDate: effectiveDate,
      reason: transferReason || '依分班測驗或學員學習進度申請轉班核定。',
      operator: operatorName,
      effectiveImmediately: true,
    };

    setIsSubmitting(true);
    try {
      await onTransferStudent(newRecord);
      setTransferringStudent(null);
      setTransferReason('');
    } catch (err) {
      console.error('Error transferring student to class:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedClassInfo = classes.find(
    (c) => String(c.id) === String(activeTab) || c.name === activeTab
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <ArrowRightLeft className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-black text-slate-800">學生分班與轉班作業中樞</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            透過 <code>public.class_students</code> 資料庫關聯表精確管理學員分班、調班派令與歷史異動稽核。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {unassignedStudents.length > 0 && (
            <button
              onClick={() => setActiveTab('UNASSIGNED')}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 transition-colors"
            >
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>待分班學員 ({unassignedStudents.length})</span>
            </button>
          )}

          <button
            onClick={() => openTransferModal()}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>辦理學員轉班調派</span>
          </button>
        </div>
      </div>

      {/* Class Selector Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
        <div className="flex items-center space-x-2 min-w-max">
          {/* All Students Tab */}
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeTab === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>全體學員名冊</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {students.length}人
            </span>
          </button>

          {/* Unassigned Tab */}
          <button
            onClick={() => setActiveTab('UNASSIGNED')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeTab === 'UNASSIGNED'
                ? 'bg-amber-600 text-white shadow-xs'
                : unassignedStudents.length > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>尚未分班</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'UNASSIGNED'
                  ? 'bg-white/20 text-white'
                  : unassignedStudents.length > 0
                  ? 'bg-amber-200 text-amber-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {unassignedStudents.length}人
            </span>
          </button>

          <div className="h-6 w-[1px] bg-slate-200 mx-1" />

          {/* Individual Class Tabs */}
          {classes.map((cls) => {
            const count = students.filter(
              (s) => s.className === cls.name || s.classId === cls.id
            ).length;
            const isSelected = cls.id === activeTab;
            return (
              <button
                key={cls.id}
                onClick={() => setActiveTab(cls.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{cls.name}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}人
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-Column Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Student List in Selected Tab */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  {activeTab === 'ALL' && <Users className="w-4 h-4 text-slate-700" />}
                  {activeTab === 'UNASSIGNED' && <UserPlus className="w-4 h-4 text-amber-600" />}
                  {activeTab !== 'ALL' && activeTab !== 'UNASSIGNED' && (
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  )}
                  <span>
                    {activeTab === 'ALL' && `全體學員名冊 (${filteredStudents.length} 人)`}
                    {activeTab === 'UNASSIGNED' && `尚未分班學員名單 (${filteredStudents.length} 人)`}
                    {selectedClassInfo && `${selectedClassInfo.name} • 在班學員名冊 (${filteredStudents.length} 人)`}
                  </span>
                </h2>
                {selectedClassInfo && (
                  <div className="text-xs text-slate-500 mt-1 flex items-center space-x-3">
                    <span>授課教師：<strong>{selectedClassInfo.teacherName}</strong></span>
                    <span>•</span>
                    <span>教室：{selectedClassInfo.classroom}</span>
                    <span>•</span>
                    <span>時段：{selectedClassInfo.timeSlot}</span>
                  </div>
                )}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋學號 / 姓名 / 國籍..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Students Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">學號 / 姓名</th>
                    <th className="py-2.5 px-3">國籍 / 性別</th>
                    <th className="py-2.5 px-3">目前班級</th>
                    <th className="py-2.5 px-3 text-center">分班／轉班操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 text-xs">
                        {activeTab === 'UNASSIGNED'
                          ? '🎉 太棒了！目前所有學員均已完成分班！'
                          : '目前無符合條件之學員'}
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => {
                      const isUnassigned =
                        !student.className ||
                        student.className === '尚未分班' ||
                        student.className.trim() === '';

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-2.5">
                              <StudentAvatar
                                avatarUrl={student.avatarUrl}
                                name={student.name}
                                sizeClassName="w-8 h-8"
                              />
                              <div>
                                <div className="font-bold text-slate-800">{student.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {student.studentNumber} • {student.englishName}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-700">{student.nationality}</div>
                            <div className="text-[10px] text-slate-400">{student.gender === 'M' ? '男' : '女'}</div>
                          </td>

                          <td className="py-3 px-3">
                            {isUnassigned ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                尚未分班
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {student.className}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center">
                            {isUnassigned ? (
                              <button
                                onClick={() => openAssignModal(student)}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors text-xs shadow-xs"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>分配班級</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => openTransferModal(student)}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition-colors text-xs"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>轉班</span>
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
        </div>

        {/* Right Column (1 Col): Transfer History Records */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <History className="w-4 h-4 text-purple-600" />
                <span>分班／轉班異動紀錄 ({transferRecords.length} 筆)</span>
              </h3>
            </div>

            <div className="mt-3 space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {transferRecords.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  尚無轉班異動紀錄
                </div>
              ) : (
                transferRecords.map((rec) => (
                  <div key={rec.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="text-blue-700 font-bold">{rec.studentName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{rec.transferDate}</span>
                    </div>

                    <div className="mt-2 flex items-center space-x-1.5 text-[11px] font-semibold">
                      <span className="text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 truncate max-w-[110px]">
                        {rec.fromClassName || '尚未分班'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 truncate max-w-[110px]">
                        {rec.toClassName}
                      </span>
                    </div>

                    <div className="text-slate-600 text-[11px] mt-2 bg-white p-2 rounded-lg border border-slate-100">
                      事由：{rec.reason}
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
                      <span>經辦：{rec.operator}</span>
                      <span className="text-emerald-600 font-bold">已生效</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal A: 分配班級 (Assign Class Modal for unassigned student) */}
      {assigningStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <span>學員分班指派：{assigningStudent.name}</span>
              </h2>
              <button
                onClick={() => setAssigningStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4 text-xs">
              {/* Student Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-3">
                <StudentAvatar
                  avatarUrl={assigningStudent.avatarUrl}
                  name={assigningStudent.name}
                  sizeClassName="w-10 h-10"
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {assigningStudent.name} ({assigningStudent.englishName})
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    學號: {assigningStudent.studentNumber} • 國籍: {assigningStudent.nationality}
                  </div>
                  <div className="mt-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      目前狀態：尚未分班
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  目標指派班級 *
                </label>
                <select
                  value={assignTargetClassId}
                  onChange={(e) => setAssignTargetClassId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-emerald-900 text-xs"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.teacherName}老師 • {c.timeSlot})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] leading-relaxed">
                💡 <strong>分班說明：</strong> 點擊「確認分班」後，系統將直接在 <code>public.class_students</code> 建立關聯，該學員即時歸入目標班級名冊與出缺席課表。
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAssigningStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '處理中...' : '確認分班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal B: 轉班 (Transfer Modal for assigned student) */}
      {transferringStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                <span>辦理學員轉班調派：{transferringStudent.name}</span>
              </h2>
              <button
                onClick={() => setTransferringStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">目前班級</label>
                  <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 truncate">
                    {transferringStudent.className || '尚未分班'}
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">轉往目標班級 *</label>
                  <select
                    value={transferTargetClassId}
                    onChange={(e) => setTransferTargetClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-blue-800"
                  >
                    {classes
                      .filter((c) => c.name !== transferringStudent.className && c.id !== transferringStudent.classId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.teacherName}老師)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">生效日期</label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">行政經辦人員</label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">轉班申請原因與評估備註 *</label>
                <textarea
                  rows={3}
                  required
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="例：經分班測驗與授課老師訪談，建議轉至適合程度之班級。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-[11px] leading-relaxed">
                💡 <strong>轉班提醒：</strong> 執行轉班後，系統將安全更新 <code>public.class_students</code> 關聯，並記錄異動歷史。
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setTransferringStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? '處理中...' : '確認轉班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
