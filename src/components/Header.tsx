import React from 'react';
import { Menu, Calendar, PanelLeftClose, PanelLeft, Search, MessageSquare } from 'lucide-react';
import { UserRole } from '../types.ts';
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
  onToggleDesktopCollapse,
  isDesktopCollapsed = false,
  activeTerm,
  onOpenSearch,
  showSearch = false,
  onNavigateToMessages,
}) => {
  const { unreadCount } = useCommunications();
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 xl:px-10 py-3 flex items-center justify-between shadow-2xs transition-all gap-3 w-full">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Button */}
        <button
          id="header-mobile-menu-btn"
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-xl text-slate-700 hover:text-purple-600 hover:bg-purple-50 active:scale-95 transition-all border border-slate-200/80 shadow-2xs cursor-pointer"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop Collapse / Expand Toggle Button */}
        {onToggleDesktopCollapse && (
          <button
            id="header-desktop-collapse-btn"
            type="button"
            onClick={onToggleDesktopCollapse}
            className="hidden md:flex p-2 rounded-xl text-slate-600 hover:text-purple-600 hover:bg-purple-50 active:scale-95 transition-all border border-slate-200/80 shadow-2xs cursor-pointer"
            title={isDesktopCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isDesktopCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isDesktopCollapsed ? (
              <PanelLeft className="w-4 h-4 text-purple-600" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}

        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {/* Universal Search Bar Trigger */}
        {showSearch && onOpenSearch && (
          <>
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-100/90 hover:bg-slate-200/80 text-slate-500 hover:text-slate-900 rounded-xl border border-slate-200 text-xs transition-all cursor-pointer shadow-2xs group"
              title="Search student, class, teacher by name or ID (Ctrl+K or Cmd+K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <span className="font-medium">Search student, class, teacher...</span>
              <kbd className="ml-1 font-mono text-[10px] bg-white border border-slate-300 px-1.5 py-0.5 rounded text-slate-500 shadow-2xs">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={onOpenSearch}
              className="sm:hidden p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-slate-200 shadow-2xs cursor-pointer"
              title="Search"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Messages Nav Trigger with Banner Badge */}
        {onNavigateToMessages && (
          <button
            type="button"
            onClick={onNavigateToMessages}
            className={`p-2 rounded-xl transition-all border shadow-2xs cursor-pointer flex items-center gap-1.5 ${
              unreadCount > 0
                ? 'bg-purple-50/80 border-purple-200 text-purple-700 hover:bg-purple-100'
                : 'text-slate-600 hover:text-purple-600 hover:bg-purple-50 border-slate-200/80'
            }`}
            title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Messages'}
            aria-label="Parent-Teacher Messages"
          >
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-purple-600" />
              {unreadCount > 0 && (
                <span className="sm:hidden absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            {unreadCount > 0 && (
              <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-xs animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount} NEW
              </span>
            )}
          </button>
        )}

        {/* Active Academic Term */}
        {activeTerm && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-800 text-xs font-medium">
            <Calendar className="w-3.5 h-3.5 text-purple-600" />
            <span>
              {activeTerm.sessionName} • {activeTerm.termName}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
