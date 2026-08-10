import React from 'react';
import { 
  FileText, 
  CalendarCheck, 
  Info, 
  UserCheck, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { LeaveRecord } from '../types';

interface LeaveNoticeBannerProps {
  leaves: LeaveRecord[];
  onStartAttendanceWithCourse?: (courseId: string) => void;
}

export const LeaveNoticeBanner: React.FC<LeaveNoticeBannerProps> = ({
  leaves,
}) => {
  if (leaves.length === 0) return null;

  return (
    <div className="mb-6 bg-blue-50/70 border border-blue-200 rounded-xl p-4 shadow-2xs">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-900 flex items-center space-x-2">
              <span>今日學生請假提醒</span>
              <span className="bg-blue-200/80 text-blue-800 text-xs px-2 py-0.5 rounded-full font-semibold">
                共 {leaves.length} 位學生事前核准
              </span>
            </h3>
            <p className="text-xs text-blue-700 mt-0.5">
              以下學生已向中心行政完成請假申請。點名時點擊「<strong>依請假名單套用</strong>」即可自動代入假別與時數。
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {leaves.map((leave, idx) => (
          <div
            key={idx}
            className="bg-white/90 border border-blue-100 rounded-lg p-2.5 flex items-start justify-between shadow-2xs text-xs"
          >
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-800">{leave.studentName}</span>
                <span className="text-slate-500 font-mono text-[11px]">({leave.studentEnglishName})</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                  {leave.typeName}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 flex items-center space-x-1">
                <span className="text-blue-700 font-medium">{leave.className}</span>
                <span>•</span>
                <span>{leave.timeSlot}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 italic" title={leave.reason}>
                事由：{leave.reason}
              </p>
            </div>
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0 font-medium">
              已核准
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
