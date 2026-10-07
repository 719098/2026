import React from 'react';
import { CheckSquare, Square, X } from 'lucide-react';

export interface BatchActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'success';
  onClick: () => void;
  disabled?: boolean;
}

interface BatchActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onClearSelection: () => void;
  onSelectAllCurrentPage?: () => void;
  isAllSelected?: boolean;
  actions: BatchActionItem[];
  className?: string;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAllCurrentPage,
  isAllSelected = false,
  actions,
  className = '',
}) => {
  if (selectedCount <= 0) return null;

  const getButtonClass = (variant: BatchActionItem['variant'] = 'secondary') => {
    switch (variant) {
      case 'primary':
        return 'bg-[#536B7A] hover:bg-[#455865] text-white border-transparent';
      case 'danger':
        return 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200';
      case 'warning':
        return 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent';
      case 'secondary':
      default:
        return 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <>
      {/* Responsive Sticky Toolbar */}
      <div
        className={`sticky top-2 z-40 my-3 p-2.5 sm:p-3 bg-white/95 backdrop-blur-md rounded-xl border border-slate-300 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150 ${className}`}
      >
        <div className="flex items-center justify-between sm:justify-start space-x-3">
          <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span>
              已選取 <strong className="text-teal-700 font-mono tabular-nums">{selectedCount}</strong> 筆
              {totalCount !== undefined && <span className="text-slate-500 font-normal"> / 共 {totalCount} 筆</span>}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {onSelectAllCurrentPage && (
              <button
                type="button"
                onClick={onSelectAllCurrentPage}
                className="inline-flex items-center space-x-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
              >
                {isAllSelected ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                    <span>取消全選</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>全選</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClearSelection}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors sm:hidden"
              title="取消選取"
              aria-label="取消選取"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-0.5 sm:pb-0">
          {actions.map((act) => (
            <button
              key={act.key}
              type="button"
              onClick={act.onClick}
              disabled={act.disabled}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors shadow-2xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${getButtonClass(
                act.variant
              )}`}
            >
              {act.icon && <span className="shrink-0">{act.icon}</span>}
              <span>{act.label}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={onClearSelection}
            className="hidden sm:inline-flex p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            title="取消選取"
            aria-label="取消選取"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};
