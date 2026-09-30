import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface InfoTooltipProps {
  title?: string;
  content: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  variant?: 'light' | 'dark';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  title,
  content,
  className = '',
  align = 'left',
  variant = 'light',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close mobile popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        tooltipRef.current &&
        buttonRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsHovered(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const showDesktopTooltip = isHovered && !isOpen;

  // Alignment classes for desktop popover
  const alignmentClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  return (
    <div className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400/50"
        aria-label={title ? `${title} 功能說明` : '功能說明資訊'}
        title="查看功能說明"
      >
        <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 transition-colors" />
      </button>

      {/* Desktop Hover Tooltip (hidden on small touch screens) */}
      {showDesktopTooltip && (
        <div
          className={`hidden md:block absolute bottom-full mb-2 z-50 w-72 p-3 text-xs rounded-xl shadow-lg border pointer-events-none transition-all duration-150 ${alignmentClass} ${
            variant === 'dark'
              ? 'bg-slate-900 text-slate-100 border-slate-800'
              : 'bg-white text-slate-700 border-slate-200'
          }`}
        >
          {title && <div className="font-bold mb-1 text-slate-900 dark:text-white">{title}</div>}
          <div className="leading-relaxed text-slate-600 dark:text-slate-300">{content}</div>
          <div
            className={`absolute top-full -mt-1 w-2 h-2 rotate-45 border-r border-b ${
              align === 'right' ? 'right-4' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-4'
            } ${variant === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
          />
        </div>
      )}

      {/* Mobile / Click Popover Modal (Works on touch devices & click) */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-50 backdrop-blur-2xs transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Dialog Container */}
          <div
            ref={tooltipRef}
            className="fixed md:absolute md:bottom-full md:mb-2 z-50 inset-x-4 bottom-6 md:inset-auto md:w-80 p-4 bg-white rounded-2xl md:rounded-xl shadow-2xl md:shadow-lg border border-slate-200 text-slate-700 text-xs animate-in fade-in zoom-in-95 duration-150"
            style={{
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-2 border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-1.5 font-bold text-sm text-slate-900">
                <Info className="w-4 h-4 text-teal-600 shrink-0" />
                <span>{title || '功能說明'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="關閉說明"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="leading-relaxed text-slate-600 text-xs space-y-1.5">{content}</div>
          </div>
        </>
      )}
    </div>
  );
};
