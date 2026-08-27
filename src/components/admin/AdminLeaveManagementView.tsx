import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Edit, 
  Filter, 
  X, 
  Sparkles,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { LeaveRecord, Student, ClassEntity, LeaveType } from '../../types';

interface AdminLeaveManagementViewProps {
  leaves: LeaveRecord[];
  students: Student[];
  classes: ClassEntity[];
  onAddLeave: (leave: LeaveRecord) => void;
  onUpdateLeaveStatus: (leaveIdOrIndex: string | number, newStatus: 'approved' | 'rejected') => void;
}

export const AdminLeaveManagementView: React.FC<AdminLeaveManagementViewProps> = ({
  leaves,
  students,
  classes,
  onAddLeave,
  onUpdateLeaveStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'approved' | 'pending' | 'rejected'>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');

  // Add Leave Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [leaveDate, setLeaveDate] = useState('2026-08-04');
  const [leaveType, setLeaveType] = useState<LeaveType>('personal');
  const [leavePeriods, setLeavePeriods] = useState<number[]>([1, 2, 3]);
  const [leaveReason, setLeaveReason] = useState('因移民署辦理外僑居留證延期手續');

  const filteredLeaves = leaves.filter((l) => {
    const matchSearch =
      l.studentName.includes(searchTerm) ||
      l.studentEnglishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.reason.includes(searchTerm);
    const matchClass = selectedClassFilter === 'ALL' || l.className === selectedClassFilter;
    const matchStatus = selectedStatusFilter === 'ALL' || l.status === selectedStatusFilter;
    const matchType = selectedTypeFilter === 'ALL' || l.type === selectedTypeFilter;
    return matchSearch && matchClass && matchStatus && matchType;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find((s) => s.id === selectedStudentId);
    if (!student) {
      alert('請選擇請假學員！');
      return;
    }

    let typeName = '事假';
    if (leaveType === 'sick') typeName = '病假';
    if (leaveType === 'official') typeName = '公假';
    if (leaveType === 'bereavement') typeName = '喪假';

    const newRecord: LeaveRecord = {
      id: `LV-ADM-${Date.now().toString().slice(-6)}`,
      studentId: student.id,
      studentName: student.name,
      studentEnglishName: student.englishName,
      className: student.className,
      date: leaveDate,
      timeSlot: '09:00 - 12:00',
      periods: leavePeriods,
      type: leaveType,
      typeName,
      reason: leaveReason || '行政代登錄請假',
      approvedAt: '2026-08-18 10:00',
      status: 'approved',
      approver: '行政主管',
    };

    onAddLeave(newRecord);
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-black text-slate-800">全校外籍學員請假管理與簽核中心</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
              共 {leaves.length} 筆請假申請
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            因為學生端無帳號登入，所有外籍生之病假、事假、公假均由中心行政人員或導師登錄審核，請假課節將依規定折算 50% 出席成績。
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>行政代登錄請假單</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋姓名 / 事由..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div>
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">全部班級</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">全部審核狀態</option>
            <option value="approved">已核准 (Approved)</option>
            <option value="pending">待審核 (Pending)</option>
            <option value="rejected">已拒絕 (Rejected)</option>
          </select>
        </div>

        <div>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">全部請假假別</option>
            <option value="personal">事假</option>
            <option value="sick">病假</option>
            <option value="official">公假</option>
            <option value="bereavement">喪假</option>
          </select>
        </div>
      </div>

      {/* Leaves Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-3 px-4">請假學員</th>
                <th className="py-3 px-3">所屬班級</th>
                <th className="py-3 px-3">請假日期 / 節次</th>
                <th className="py-3 px-3">假別項目</th>
                <th className="py-3 px-3">請假事由</th>
                <th className="py-3 px-3">審核狀態</th>
                <th className="py-3 px-4 text-center">簽核審批</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    查無請假紀錄
                  </td>
                </tr>
              ) : (
                filteredLeaves.map((leave, idx) => {
                  const isApproved = leave.status === 'approved';
                  const isPending = leave.status === 'pending';
                  const isRejected = leave.status === 'rejected';

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      {/* Student */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{leave.studentName}</div>
                        <div className="text-[10px] text-slate-500">{leave.studentEnglishName}</div>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {leave.className}
                      </td>

                      {/* Date & Periods */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-800">{leave.date}</div>
                        <div className="text-[10px] text-slate-400">
                          第 {leave.periods.join(', ')} 節 ({leave.periods.length} 小時)
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                          {leave.typeName}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-3 text-slate-600 max-w-[220px] truncate" title={leave.reason}>
                        {leave.reason}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isApproved && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" />
                            已核准
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 mr-1 text-amber-500" />
                            待審核
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 mr-1 text-rose-500" />
                            已退回
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center space-x-1.5">
                          {!isApproved && (
                            <button
                              onClick={() => onUpdateLeaveStatus(leave.id || idx, 'approved')}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg transition-colors text-[11px]"
                            >
                              核准
                            </button>
                          )}
                          {!isRejected && (
                            <button
                              onClick={() => onUpdateLeaveStatus(leave.id || idx, 'rejected')}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg transition-colors text-[11px]"
                            >
                              退回
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

      {/* Add Leave Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>行政代登錄外籍學生請假單</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">請假學員 *</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.englishName}) - {s.className} [{s.studentNumber}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">請假日期 *</label>
                  <input
                    type="date"
                    required
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">請假假別 *</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold text-blue-700"
                  >
                    <option value="personal">事假</option>
                    <option value="sick">病假</option>
                    <option value="official">公假</option>
                    <option value="bereavement">喪假</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">請假節次</label>
                <div className="flex items-center space-x-4 p-2 bg-slate-50 rounded-xl">
                  {[1, 2, 3].map((period) => (
                    <label key={period} className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leavePeriods.includes(period)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLeavePeriods([...leavePeriods, period].sort());
                          } else {
                            setLeavePeriods(leavePeriods.filter((p) => p !== period));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span className="font-bold text-slate-700">第 {period} 節</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">請假詳細事由與證明文件說明 *</label>
                <textarea
                  rows={2}
                  required
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="例：身體不適就醫，附診所收據備查。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-[11px] leading-relaxed">
                💡 <strong>計分規範：</strong> 審核核准之請假節次，在點名簿與成績計算中自動計為 <strong>50% 出席成績</strong>，未請假之缺課則為 0 分。
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs"
                >
                  確認建立請假單
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
