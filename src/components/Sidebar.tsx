import React, { useState, useEffect } from 'react';
import { 
  CalendarCheck, 
  CalendarDays, 
  Users, 
  ClipboardList, 
  BarChart3, 
  GraduationCap, 
  RotateCcw,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  UserCheck,
  ArrowRightLeft,
  Calculator,
  Award,
  X,
  LayoutDashboard,
  UserPlus,
  BookOpen,
  Layers,
  FileText,
  CheckCircle2,
  Building2,
  LogOut
} from 'lucide-react';
import { Teacher, UserRole, AdminNavigationTab, UserProfile } from '../types';
import { TeacherAvatar } from './TeacherAvatar';

export type NavigationTab = 'today' | 'grades' | 'classes' | 'schedule' | 'history' | 'stats';

interface SidebarProps {
  currentRole: UserRole;
  onRoleChange?: (role: UserRole) => void;
  activeTab: NavigationTab;
  adminActiveTab: AdminNavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onAdminTabChange: (tab: AdminNavigationTab) => void;
  onResetData: () => void;
  pendingAttendanceCount: number;
  pendingLeaveCount?: number;
  currentTeacher?: Teacher | null;
  teachers?: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  adminProfile?: UserProfile | null;
  onLogout?: () => void;
}

interface MenuItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

interface AdminMenuItem {
  id: AdminNavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  onRoleChange,
  activeTab,
  adminActiveTab,
  onTabChange,
  onAdminTabChange,
  onResetData,
  pendingAttendanceCount,
  pendingLeaveCount = 0,
  currentTeacher,
  teachers = [],
  onSelectTeacher,
  isOpenMobile = false,
  onCloseMobile,
  adminProfile,
  onLogout,
}) => {
  // Teacher core navigation items (授課核心)
  const coreMenuItems: MenuItem[] = [
    {
      id: 'today',
      label: '今日點名與日程',
      icon: CalendarCheck,
      badge: pendingAttendanceCount > 0 ? `${pendingAttendanceCount} 待點` : undefined,
      badgeColor: 'bg-zinc-800 text-zinc-200 border-zinc-700',
    },
    {
      id: 'grades',
      label: '學生成績管理',
      icon: Calculator,
      badge: '100%',
      badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    },
  ];

  // Teacher tracking and history items (追蹤與紀錄 - 下拉收合選單)
  const trackingMenuItems: MenuItem[] = [
    {
      id: 'classes',
      label: '個別學生出席統計',
      icon: Users,
    },
    {
      id: 'stats',
      label: '出席率預警',
      icon: BarChart3,
    },
    {
      id: 'schedule',
      label: '全季排程與調課',
      icon: CalendarDays,
      badge: '課表',
      badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    },
    {
      id: 'history',
      label: '點名總覽與補點',
      icon: ClipboardList,
    },
  ];

  const isTrackingTabActive = ['classes', 'stats', 'schedule', 'history'].includes(activeTab);
  const [isTrackingOpen, setIsTrackingOpen] = useState<boolean>(() => isTrackingTabActive);

  // Auto-expand if the active tab switches to one of the tracking items
  useEffect(() => {
    if (isTrackingTabActive) {
      setIsTrackingOpen(true);
    }
  }, [isTrackingTabActive]);

  // Admin navigation items
  const adminMenuItems: AdminMenuItem[] = [
    {
      id: 'admin_dashboard',
      label: '行政總覽看板',
      icon: LayoutDashboard,
    },
    {
      id: 'admin_students',
      label: '學生基本資料管理',
      icon: Users,
    },
    {
      id: 'admin_assignments',
      label: '學生分班與轉班',
      icon: ArrowRightLeft,
    },
    {
      id: 'admin_materials',
      label: '教材與班級進度',
      icon: Layers,
    },
    {
      id: 'admin_terms',
      label: '學期期別管理',
      icon: CalendarDays,
    },
    {
      id: 'admin_classes',
      label: '開設班級管理',
      icon: Layers,
    },
    {
      id: 'admin_teachers',
      label: '全校教師管理',
      icon: GraduationCap,
    },
    {
      id: 'admin_schedule',
      label: '全校排課與調課',
      icon: CalendarDays,
    },
    {
      id: 'admin_attendance',
      label: '全校點名監控',
      icon: CheckCircle2,
    },
    {
      id: 'admin_grades',
      label: '全校成績管理',
      icon: Award,
    },
    {
      id: 'admin_reports',
      label: '報表與結業證書',
      icon: BarChart3,
    },
  ];

  const handleTabSelect = (tab: NavigationTab) => {
    onTabChange(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const handleAdminTabSelect = (tab: AdminNavigationTab) => {
    onAdminTabChange(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const handleTeacherSelect = (teacher: Teacher) => {
    if (onSelectTeacher) onSelectTeacher(teacher);
    if (onCloseMobile) onCloseMobile();
  };

  const isRoleAdmin = currentRole === 'ADMIN';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div 
          id="sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Responsive Sidebar Drawer */}
      <aside 
        id="main-sidebar"
        className={`
          fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] h-full bg-white text-slate-800 flex flex-col shrink-0 border-r border-[#DCE2E6] shadow-lg lg:shadow-none transition-transform duration-300 ease-in-out
          ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:z-auto lg:h-screen
        `}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[#DCE2E6] bg-[#F8FAFC]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-[#536B7A] font-bold text-sm tracking-tight shadow-2xs shrink-0">
                PU
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {isRoleAdmin ? '行政管理中樞' : '教師教學系統'}
                </div>
                <h1 className="text-xs font-bold text-slate-800 leading-tight tracking-wide">
                  靜宜大學華語中心
                </h1>
              </div>
            </div>
            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                title="關閉選單"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation List */}
        <div className="px-2.5 py-3 flex-1 overflow-y-auto space-y-4 bg-white">
          {isRoleAdmin ? (
            <div className="space-y-4">
              {/* Category 1: Overview */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 px-3 mb-1.5 tracking-wider uppercase">
                  概覽
                </div>
                <nav className="space-y-0.5">
                  {adminMenuItems.slice(0, 1).map((item) => {
                    const Icon = item.icon;
                    const isActive = adminActiveTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`admin-nav-${item.id}`}
                        onClick={() => handleAdminTabSelect(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#E8EEF2] text-[#26313B] font-bold border-l-3 border-[#536B7A] shadow-2xs pl-2.5'
                            : 'text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#536B7A]' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Category 2: Administrative Management */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 px-3 mb-1.5 tracking-wider uppercase">
                  教務管理
                </div>
                <nav className="space-y-0.5">
                  {adminMenuItems.slice(1, 7).map((item) => {
                    const Icon = item.icon;
                    const isActive = adminActiveTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`admin-nav-${item.id}`}
                        onClick={() => handleAdminTabSelect(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#E8EEF2] text-[#26313B] font-bold border-l-3 border-[#536B7A] shadow-2xs pl-2.5'
                            : 'text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#536B7A]' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Category 3: Monitoring & Reports */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 px-3 mb-1.5 tracking-wider uppercase">
                  監控與報表
                </div>
                <nav className="space-y-0.5">
                  {adminMenuItems.slice(7).map((item) => {
                    const Icon = item.icon;
                    const isActive = adminActiveTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`admin-nav-${item.id}`}
                        onClick={() => handleAdminTabSelect(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#E8EEF2] text-[#26313B] font-bold border-l-3 border-[#536B7A] shadow-2xs pl-2.5'
                            : 'text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#536B7A]' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Category 1: Teaching Core (授課核心) */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 px-3 mb-1.5 tracking-wider uppercase">
                  授課核心
                </div>
                <nav className="space-y-0.5">
                  {coreMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`nav-${item.id}`}
                        onClick={() => handleTabSelect(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#E8EEF2] text-[#26313B] font-bold border-l-3 border-[#536B7A] shadow-2xs pl-2.5'
                            : 'text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#536B7A]' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Category 2: Tracking & History (追蹤與紀錄 - 可展開/收合選單) */}
              <div>
                <button
                  type="button"
                  id="teacher-nav-tracking-toggle"
                  onClick={() => setIsTrackingOpen((prev) => !prev)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                    isTrackingTabActive && !isTrackingOpen
                      ? 'bg-slate-100 text-[#26313B]'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                  title={isTrackingOpen ? '點擊收合選單' : '點擊展開選單'}
                >
                  <span className="flex items-center space-x-1.5">
                    <span>追蹤與紀錄</span>
                    {isTrackingTabActive && !isTrackingOpen && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#536B7A]" title="目前頁面在此分組中" />
                    )}
                  </span>
                  <div className="flex items-center space-x-1">
                    <span className="text-[9px] font-normal normal-case opacity-75">
                      {isTrackingOpen ? '收合' : '展開'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isTrackingOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {isTrackingOpen && (
                  <nav className="space-y-0.5 mt-1">
                    {trackingMenuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`nav-${item.id}`}
                          onClick={() => handleTabSelect(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                            isActive
                              ? 'bg-[#E8EEF2] text-[#26313B] font-bold border-l-3 border-[#536B7A] shadow-2xs pl-2.5'
                              : 'text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900 font-medium'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <Icon className={`w-4 h-4 ${isActive ? 'text-[#536B7A]' : 'text-slate-400'}`} />
                            <span>{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Footer */}
        <div className="p-3.5 border-t border-[#DCE2E6] bg-[#F8FAFC] shrink-0">
          <div className="flex items-center space-x-3">
            <TeacherAvatar
              avatarUrl={isRoleAdmin ? adminProfile?.avatarUrl : currentTeacher?.avatarUrl}
              name={isRoleAdmin ? (adminProfile?.fullName || '系統管理員') : (currentTeacher?.name || '教師')}
              sizeClassName="w-9 h-9"
              className="border border-slate-200 shadow-2xs"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 truncate">
                  {isRoleAdmin ? (adminProfile?.fullName || '系統管理員') : `${currentTeacher?.name || '教師'} 老師`}
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">
                  {isRoleAdmin ? 'ADMIN' : 'TEACHER'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {isRoleAdmin ? (adminProfile?.email || 'admin@test.com') : (currentTeacher?.email || currentTeacher?.department || '靜宜大學華語中心')}
              </div>
            </div>
          </div>

          <div className="mt-2.5 pt-2.5 border-t border-[#DCE2E6] flex items-center justify-between">
            <button
              id="btn-reset-demo"
              onClick={onResetData}
              className="flex items-center space-x-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
              title="重設全季所有點名、排班與成績資料"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>重設狀態</span>
            </button>
            {onLogout && (
              <button
                id="btn-sidebar-logout"
                type="button"
                onClick={onLogout}
                className="flex items-center space-x-1 text-[11px] text-slate-600 hover:text-rose-600 font-semibold transition-colors cursor-pointer"
                title="登出系統"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                <span>登出系統</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
