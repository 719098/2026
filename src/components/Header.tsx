import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ChevronDown,
  UserCheck,
  GraduationCap,
  Building2,
  Check,
  Sparkles
} from 'lucide-react';
import { Teacher } from '../types';
import { TODAY_DATE } from '../utils/quarterScheduler';

interface HeaderProps {
  title: string;
  subtitle?: string;
  selectedDate: string;
  onJumpToDate: (date: string) => void;
  pendingAttendanceCount: number;
  currentTeacher: Teacher;
  teachers: Teacher[];
  onSelectTeacher: (teacher: Teacher) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  selectedDate,
  onJumpToDate,
  pendingAttendanceCount,
  currentTeacher,
  teachers,
  onSelectTeacher,
}) => {
  const [isTeacherMenuOpen, setIsTeacherMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTeacherMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-20 relative">
      {/* Left Title & Status */}
      <div className="flex items-center space-x-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <span>{title}</span>
            {pendingAttendanceCount > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3 h-3 mr-1 text-amber-500" />
                {pendingAttendanceCount} 堂課待點名
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                今日點名全數完成
              </span>
            )}
          </h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      {/* Right Quick Jump & Teacher Profile */}
      <div className="flex items-center space-x-3">
        {/* Quick Demo Date Shortcuts */}
        <div className="hidden xl:flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <span className="text-slate-500 px-2 font-medium">Demo 快捷：</span>
          <button
            onClick={() => onJumpToDate(TODAY_DATE)}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              selectedDate === TODAY_DATE
                ? 'bg-teal-700 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 bg-white'
            }`}
          >
            08/11 (今日基準日)
          </button>
          <button
            onClick={() => onJumpToDate('2026-08-04')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              selectedDate === '2026-08-04'
                ? 'bg-amber-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            08/04 (待補點名)
          </button>
          <button
            onClick={() => onJumpToDate('2026-07-30')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              selectedDate === '2026-07-30'
                ? 'bg-amber-700 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            07/30 (調課調出)
          </button>
          <button
            onClick={() => onJumpToDate('2026-07-31')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              selectedDate === '2026-07-31'
                ? 'bg-blue-700 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            07/31 (調課補課)
          </button>
          <button
            onClick={() => onJumpToDate('2026-10-09')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              selectedDate === '2026-10-09'
                ? 'bg-rose-700 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            10/09 (國慶連假停課)
          </button>
        </div>

        {/* Teacher Profile with Dropdown Switcher */}
        <div className="relative pl-3 border-l border-slate-200" ref={dropdownRef}>
          <button
            id="btn-teacher-switcher"
            onClick={() => setIsTeacherMenuOpen(!isTeacherMenuOpen)}
            className="flex items-center space-x-2 p-1 rounded-xl hover:bg-slate-100 transition-colors text-left group"
            title="點擊切換授課教師"
          >
            <div className="relative">
              <img
                src={currentTeacher.avatarUrl}
                alt={currentTeacher.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-teal-500 shadow-2xs"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-slate-800 group-hover:text-teal-700 transition-colors flex items-center space-x-1">
                <span>{currentTeacher.name} 老師</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 font-normal border border-teal-200">
                  {currentTeacher.department.includes('教學一組') ? '一組' : '二組'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate max-w-[120px]">
                {currentTeacher.title}
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isTeacherMenuOpen ? 'rotate-180 text-teal-600' : ''}`} />
          </button>

          {/* Teacher Dropdown Menu */}
          {isTeacherMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  切換授課教師
                </p>
              </div>

              <div className="p-1 space-y-1">
                {teachers.map((teacher) => {
                  const isSelected = teacher.id === currentTeacher.id;
                  return (
                    <button
                      key={teacher.id}
                      onClick={() => {
                        onSelectTeacher(teacher);
                        setIsTeacherMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors text-left ${
                        isSelected
                          ? 'bg-teal-50 text-teal-900 border border-teal-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={teacher.avatarUrl}
                          alt={teacher.name}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center space-x-1">
                            <span>{teacher.name} 老師</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({teacher.assignedClasses.length} 班級)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                            {teacher.department}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-teal-600" />}
                    </button>
                  );
                })}
              </div>

              <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
                切換教師將同步更新指派班級與點名課表
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
