import React from 'react';
import { 
  AlertCircle, 
  Clock, 
  ArrowRight, 
  Lock, 
  CheckCircle2, 
  ShieldAlert
} from 'lucide-react';
import { CourseSession } from '../types';

interface PendingMakeupAlertProps {
  pendingCourses: CourseSession[];
  onSelectCourseDate: (date: string) => void;
}

export const PendingMakeupAlert: React.FC<PendingMakeupAlertProps> = ({
  pendingCourses,
  onSelectCourseDate,
}) => {
  if (pendingCourses.length === 0) return null;

  return (
    <div className="mb-6 bg-amber-50/80 border border-amber-300 rounded-xl p-4 shadow-2xs">
      <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
        <span>待補點名提醒（過去一週尚有未完成點名堂次）</span>
      </div>
      <p className="text-xs text-amber-800 mt-1">
        依華語中心規定，教師可在課程結束後 <strong>一週內</strong> 補填點名紀錄；超過一週系統將自動鎖定並轉送教務組備查。
      </p>

      <div className="mt-3 space-y-2">
        {pendingCourses.map((c) => (
          <div
            key={c.id}
            className="bg-white/90 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between shadow-2xs text-xs"
          >
            <div className="flex items-center space-x-3">
              <span className="font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                {c.date}
              </span>
              <div>
                <span className="font-bold text-slate-800">{c.courseName}</span>
                <span className="text-slate-500 ml-2">({c.className} • {c.timeSlot})</span>
              </div>
            </div>

            <button
              onClick={() => onSelectCourseDate(c.date)}
              className="flex items-center space-x-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md text-xs transition-colors shadow-2xs"
            >
              <span>前往該日補點名</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
