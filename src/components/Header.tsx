import React from 'react';
import { Menu, Calendar, Search, MessageSquare } from 'lucide-react';
import { useCommunications } from '../context/CommunicationsContext.tsx';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onOpenMobileMenu: () => void;
  onToggleDesktopCollapse?: () => void;
  isDesktopCollapsed?: boolean;
  activeTerm?: { sessionName: string; termName: string } | null;
  onOpenSearch?: () => void;
  showSearch?: boolean;
  onNavigateToMessages?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'School Management System',
  subtitle,
  onOpenMobileMenu,
  activeTerm,
  onOpenSearch,
  showSearch = false,
  onNavigateToMessages,
}) => {
  const { unreadCount } = useCommunications();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-violet-200 bg-[#efecf4]/95 px-3 shadow-sm shadow-violet-950/[0.04] backdrop-blur-xl transition-all sm:px-6 lg:px-8 xl:px-10">
      <div className="flex min-h-[72px] items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        {/* Mobile Hamburger Button (44x44px touch target) */}
        <button
          id="header-mobile-menu-btn"
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-violet-100 bg-white text-slate-600 shadow-sm transition-all hover:bg-violet-50 hover:text-violet-700 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-[9px] font-bold uppercase tracking-[0.18em] text-violet-600 sm:block">School workspace</p>
          <h2 className="truncate text-sm font-bold leading-snug tracking-tight text-slate-900 sm:text-base md:text-lg">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block sm:text-xs">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        {/* Universal Search Bar Trigger */}
        {showSearch && onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="group hidden h-11 w-[clamp(220px,30vw,390px)] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 text-left shadow-sm transition-all hover:border-violet-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:flex"
            title="Search students, classes, or teachers"
            aria-label="Open search for students, classes, or teachers"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 transition-colors group-hover:bg-violet-600 group-hover:text-white">
              <Search className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500 group-hover:text-slate-700">Search students, classes, teachers...</span>
            <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400">Search</span>
          </button>
        )}

        {/* Messages Nav Trigger with Banner Badge */}
        {onNavigateToMessages && (
          <button
            type="button"
            onClick={onNavigateToMessages}
            className={`flex h-11 min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 shadow-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 ${
              unreadCount > 0
                ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
            }`}
            title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Messages'}
            aria-label="Parent-Teacher Messages"
          >
            <div className="relative flex items-center justify-center">
              <MessageSquare className="h-[18px] w-[18px] text-violet-700" />
              {unreadCount > 0 && (
                <span className="sm:hidden absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            {unreadCount > 0 && (
              <span className="hidden rounded-full bg-violet-700 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm sm:inline-flex">
                {unreadCount > 9 ? '9+' : unreadCount} NEW
              </span>
            )}
          </button>
        )}

        {/* Active Academic Term */}
        {activeTerm && (
          <div className="hidden items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-2 text-xs font-semibold text-violet-900 xl:flex">
            <Calendar className="h-3.5 w-3.5 text-violet-700" />
            <span>
              {activeTerm.sessionName} • {activeTerm.termName}
            </span>
          </div>
        )}
      </div>
      </div>
      {showSearch && onOpenSearch && (
        <button
          type="button"
          onClick={onOpenSearch}
          className="group mb-3 flex h-11 w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 text-left shadow-sm transition-all hover:border-violet-300 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:hidden"
          aria-label="Search students, classes, or teachers"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700"><Search className="h-3.5 w-3.5" /></span>
          <span className="flex-1 text-xs font-medium text-slate-500">Search students, classes, or teachers</span>
          <span className="text-xs font-semibold text-violet-700">Search</span>
        </button>
      )}
    </header>
  );
};
