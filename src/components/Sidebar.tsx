import React from 'react';
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
  ShieldCheck,
  UserCheck,
  ArrowRightLeft,
  Calculator,
  Award
} from 'lucide-react';
import { Teacher } from '../types';

export type NavigationTab = 'today' | 'grades' | 'classes' | 'schedule' | 'history' | 'stats';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onResetData: () => void;
  pendingAttendanceCount: number;
  currentTeacher: Teacher;
  teachers?: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
}

interface MenuItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onResetData,
  pendingAttendanceCount,
  currentTeacher,
  teachers = [],
  onSelectTeacher,
}) => {
  const menuItems: MenuItem[] = [
    {
      id: 'today',
      label: '今日點名與日程',
      icon: CalendarCheck,
      badge: pendingAttendanceCount > 0 ? `${pendingAttendanceCount} 待點` : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      id: 'grades',
      label: '學生成績管理',
      icon: Calculator,
      badge: '佔比100%',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    {
      id: 'classes',
      label: '個別學生出席統計',
      icon: Users,
    },
    {
      id: 'stats',
      label: '出席率與簽證預警',
      icon: BarChart3,
    },
    {
      id: 'schedule',
      label: '全季排程與調課',
      icon: CalendarDays,
      badge: '165小時',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    },
    {
      id: 'history',
      label: '點名總覽與補點',
      icon: ClipboardList,
    },
  ];

  const otherTeacher = teachers.find((t) => t.id !== currentTeacher.id);

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0 min-h-screen border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-teal-900/30">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-teal-400 tracking-wider">CLC ATTENDANCE</div>
            <h1 className="text-base font-bold text-white leading-tight">華語中心教師系統</h1>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 w-full justify-between">
          <span className="truncate">{currentTeacher.term} (165小時)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-3 py-4 flex-1">
        <div className="text-xs font-semibold text-slate-400 px-3 mb-2 tracking-wider">
          教師管理介面
        </div>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-900/40'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      isActive
                        ? 'bg-white text-teal-800 border-white'
                        : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Switch Teacher Quick Selector */}
      {teachers.length > 1 && onSelectTeacher && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="text-[11px] font-semibold text-slate-400 px-1 mb-2 flex items-center justify-between">
            <span>切換授課教師視角</span>
            <ArrowRightLeft className="w-3 h-3 text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {teachers.map((teacher) => {
              const isCurrent = teacher.id === currentTeacher.id;
              return (
                <button
                  key={teacher.id}
                  id={`btn-switch-teacher-${teacher.id}`}
                  onClick={() => onSelectTeacher(teacher)}
                  className={`flex items-center space-x-2 p-2 rounded-lg text-xs font-semibold transition-all ${
                    isCurrent
                      ? 'bg-teal-700 text-white ring-1 ring-teal-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <img
                    src={teacher.avatarUrl}
                    alt={teacher.name}
                    className="w-6 h-6 rounded-full object-cover border border-slate-600 shrink-0"
                  />
                  <span className="truncate">{teacher.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Teacher Profile Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/80">
        <div className="flex items-center space-x-3">
          <img
            src={currentTeacher.avatarUrl}
            alt={currentTeacher.name}
            className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-white truncate">{currentTeacher.name} 老師</div>
              <span className="text-[10px] font-semibold bg-teal-500/20 text-teal-300 px-1.5 py-0.2 rounded">
                授課中
              </span>
            </div>
            <div className="text-xs text-slate-400 truncate">{currentTeacher.department}</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <button
            id="btn-reset-demo"
            onClick={onResetData}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors"
            title="重設全季所有點名與成績資料"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重設全季 Demo 資料</span>
          </button>
          <span className="text-[10px] text-slate-600 font-mono">v2.6 Quarter</span>
        </div>
      </div>
    </aside>
  );
};
