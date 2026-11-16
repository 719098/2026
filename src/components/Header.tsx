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
  Sparkles,
  Menu,
  ShieldCheck,
  ArrowRightLeft,
  LogOut
} from 'lucide-react';
import { Teacher, UserRole, UserProfile } from '../types';
import { TeacherAvatar } from './TeacherAvatar';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange?: (role: UserRole) => void;
  title: string;
  subtitle?: string;
  selectedDate: string;
  onJumpToDate: (date: string) => void;
  pendingAttendanceCount: number;
  teacherTodayTotalCount?: number;
  teacherTodayActiveCount?: number;
  isTeacherDataLoading?: boolean;
  hasTeacherDataLoaded?: boolean;
  teacherDataError?: string | null;
  isViewingToday?: boolean;
  currentTeacher?: Teacher | null;
  teachers?: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
  onOpenMobileMenu?: () => void;
  adminProfile?: UserProfile | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  title,
  subtitle,
  pendingAttendanceCount,
  teacherTodayTotalCount = 0,
  teacherTodayActiveCount = 0,
  isTeacherDataLoading = false,
  hasTeacherDataLoaded = true,
  teacherDataError = null,
  isViewingToday = true,
  currentTeacher,
  onOpenMobileMenu,
  adminProfile,
  onLogout,
}) => {
  const isRoleAdmin = currentRole === 'ADMIN';

  const renderTeacherStatusBadge = () => {
    if (isRoleAdmin) return null;
    if (teacherDataError && !isTeacherDataLoading) {
      return (
        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
          載入失敗
        </span>
      );
    }
    if (!hasTeacherDataLoaded || (isTeacherDataLoading && teacherTodayTotalCount === 0)) {
      return (
        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
          課程載入中…
        </span>
      );
    }
    if (teacherTodayTotalCount === 0) {
      return (
        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
          {isViewingToday ? '今日未安排課程' : '該日未安排課程'}
        </span>
      );
    }
    if (teacherTodayActiveCount === 0) {
      return (
        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
          今日無需點名
        </span>
      );
    }
    if (pendingAttendanceCount > 0) {
      return (
        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-[#E8EEF2] text-[#26313B] border border-[#C9D1D7] shrink-0">
          <Clock className="w-3 h-3 mr-1 text-[#536B7A]" />
          待點名 {pendingAttendanceCount} 堂
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
        全部完成 ✓
      </span>
    );
  };

  return (
    <header className="min-h-16 py-1.5 sm:py-0 sm:h-16 bg-white border-b border-[#DCE2E6] px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-20 relative">
      {/* Left Title, Hamburger & Status */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
        {/* Mobile Hamburger Menu Button */}
        {onOpenMobileMenu && (
          <button
            id="btn-mobile-menu-toggle"
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none shrink-0 transition-colors"
            aria-label="開啟功能選單"
            title="開啟功能選單"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${
                isRoleAdmin
                  ? 'bg-[#536B7A] text-white border-[#536B7A]'
                  : 'bg-[#E8EEF2] text-[#26313B] border-[#C9D1D7]'
              }`}
            >
              {isRoleAdmin ? 'ADMIN 行政端' : 'TEACHER 教師端'}
            </span>
          </div>
          <h2 className="text-xs sm:text-base font-bold text-[#26313B] flex items-center flex-wrap gap-1 sm:gap-2 mt-0.5 min-w-0">
            <span className="truncate max-w-[140px] sm:max-w-none">{title}</span>
            {renderTeacherStatusBadge()}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-[#66717C] truncate hidden sm:block mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls: User Profile & Logout */}
      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
        {/* In Admin mode: Admin info pill & Logout */}
        {isRoleAdmin ? (
          <div className="flex items-center space-x-2 sm:space-x-2.5 pl-2 sm:pl-3 border-l border-[#DCE2E6]">
            <TeacherAvatar
              avatarUrl={adminProfile?.avatarUrl}
              name={adminProfile?.fullName || '系統管理員'}
              sizeClassName="w-8 h-8"
              className="border border-[#C9D1D7] shadow-2xs shrink-0"
            />
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-[#26313B] flex items-center space-x-1">
                <span>{adminProfile?.fullName || '系統管理員'}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#E8EEF2] text-[#536B7A] font-bold border border-[#DCE2E6]">
                  ADMIN
                </span>
              </div>
              <div className="text-[10px] text-[#66717C] truncate max-w-[120px]">{adminProfile?.email || ''}</div>
            </div>
            {onLogout && (
              <button
                id="btn-admin-header-logout"
                type="button"
                onClick={onLogout}
                className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center space-x-1 text-xs font-bold border border-[#DCE2E6] cursor-pointer shrink-0"
                title="登出管理員系統"
                aria-label="登出管理員系統"
              >
                <LogOut className="w-3.5 h-3.5 text-[#536B7A]" />
                <span>登出</span>
              </button>
            )}
          </div>
        ) : (
          /* In Teacher mode: Teacher profile badge & Logout */
          <div className="flex items-center space-x-2 sm:space-x-2.5 pl-2 sm:pl-3 border-l border-[#DCE2E6]">
            <div className="flex items-center space-x-2">
              <TeacherAvatar
                avatarUrl={currentTeacher?.avatarUrl}
                name={currentTeacher?.name || '教師'}
                sizeClassName="w-8 h-8"
                className="border border-[#C9D1D7] shadow-2xs shrink-0"
              />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-[#26313B] flex items-center space-x-1">
                  <span>{currentTeacher?.name || adminProfile?.fullName || '教師'} 老師</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#E8EEF2] text-[#536B7A] font-bold border border-[#DCE2E6]">
                    TEACHER
                  </span>
                </div>
                <div className="text-[11px] text-[#66717C] truncate max-w-[120px]">
                  {currentTeacher?.title || currentTeacher?.email || '專任教師'}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                id="btn-teacher-header-logout"
                type="button"
                onClick={onLogout}
                className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0 flex items-center space-x-1 text-xs font-bold border border-[#DCE2E6] cursor-pointer"
                title="登出教師系統"
                aria-label="登出教師系統"
              >
                <LogOut className="w-3.5 h-3.5 text-[#536B7A]" />
                <span>登出</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
