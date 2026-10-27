import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Award,
  CreditCard,
  Bell,
  ShieldAlert,
  LogOut,
  School,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
  MessageSquare,
  UserCheck,
  Globe,
  Sparkles,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { UserRole } from '../types.ts';
import { useSettings } from '../context/SettingsContext.tsx';
import { useCommunications } from '../context/CommunicationsContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useAccountModal } from '../context/AccountModalContext.tsx';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  userRole: UserRole;
  userFullName: string;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  id: string;
  groupTitle?: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  userRole,
  userFullName,
  onLogout,
  isOpenMobile,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { schoolName, settings } = useSettings();
  const { unreadCount } = useCommunications();
  const { user } = useAuth();
  const { openAccountModal, openLogoutConfirm } = useAccountModal();
  const [filterQuery, setFilterQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpenMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpenMobile, onCloseMobile]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpenMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpenMobile]);

  // Re-arranged and grouped navigation for intuitive admin workflows
  const adminNavGroups: NavGroup[] = [
    {
      id: 'core',
      groupTitle: 'Dashboard',
      items: [
        { id: 'overview', label: 'Executive Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'people',
      groupTitle: 'Students & Faculty',
      items: [
        { id: 'students', label: 'Student Directory', icon: Users },
        { id: 'teachers', label: 'Faculty & Staff', icon: GraduationCap },
        { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck },
      ],
    },
    {
      id: 'academics',
      groupTitle: 'Academic Engine',
      items: [
        { id: 'classes', label: 'Classes & Subjects', icon: BookOpen },
        { id: 'timetable', label: 'Class Timetables', icon: CalendarDays },
        { id: 'homework', label: 'Homework & Coursework', icon: FileText },
        { id: 'results', label: 'Academic Scores & Reports', icon: Award },
      ],
    },
    {
      id: 'admissions-cms',
      groupTitle: 'Admissions & Website',
      items: [
        { id: 'admissions', label: 'Admissions & Applicants', icon: UserCheck },
        { id: 'public-portal', label: 'Public Website & CMS', icon: Globe },
        { id: 'public-portal-editor', label: 'Visual Page Editor', icon: Sparkles },
      ],
    },
    {
      id: 'finance-comms',
      groupTitle: 'Finance & Engagement',
      items: [
        { id: 'fees', label: 'Fees & Invoicing', icon: CreditCard },
        { id: 'communications', label: 'Messages & Chats', icon: MessageSquare },
        { id: 'announcements', label: 'Announcements', icon: Bell },
      ],
    },
    {
      id: 'system',
      groupTitle: 'Administration & Security',
      items: [
        { id: 'settings', label: 'School Settings', icon: Settings },
        { id: 'audit-logs', label: 'Audit Trail & Logs', icon: ShieldAlert },
      ],
    },
  ];

  const teacherNavGroups: NavGroup[] = [
    {
      id: 'teacher-overview',
      groupTitle: 'Overview',
      items: [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'teacher-academics',
      groupTitle: 'Academics',
      items: [
        { id: 'classes', label: 'My Classes & Subjects', icon: BookOpen },
        { id: 'timetable', label: 'Class Timetable', icon: CalendarDays },
        { id: 'homework', label: 'Homework & Assignments', icon: FileText },
        { id: 'results', label: 'Enter Results', icon: Award },
      ],
    },
    {
      id: 'teacher-ops',
      groupTitle: 'Daily Operations',
      items: [
        { id: 'attendance', label: 'Record Attendance', icon: CalendarCheck },
      ],
    },
    {
      id: 'teacher-comms',
      groupTitle: 'Connect',
      items: [
        { id: 'communications', label: 'Parent Messages', icon: MessageSquare },
        { id: 'announcements', label: 'Announcements', icon: Bell },
      ],
    },
    {
      id: 'teacher-account',
      groupTitle: 'Account & Preferences',
      items: [
        { id: 'settings', label: 'My Account & Settings', icon: Settings },
      ],
    },
  ];

  const parentNavGroups: NavGroup[] = [
    {
      id: 'parent-core',
      groupTitle: 'Family Portal',
      items: [
        { id: 'parent-portal', label: 'My Children', icon: LayoutDashboard },
      ],
    },
    {
      id: 'parent-academics',
      groupTitle: 'Academic Progress',
      items: [
        { id: 'timetable', label: 'Class Timetable', icon: CalendarDays },
        { id: 'homework', label: 'Children Homework', icon: FileText },
        { id: 'results', label: 'Report Cards', icon: Award },
        { id: 'attendance', label: 'Attendance Logs', icon: CalendarCheck },
      ],
    },
    {
      id: 'parent-finance',
      groupTitle: 'Finance & Notices',
      items: [
        { id: 'fees', label: 'Fees & Invoices', icon: CreditCard },
        { id: 'communications', label: 'Teacher Messages', icon: MessageSquare },
        { id: 'announcements', label: 'Announcements', icon: Bell },
      ],
    },
    {
      id: 'parent-account',
      groupTitle: 'Account & Preferences',
      items: [
        { id: 'settings', label: 'My Account & Settings', icon: Settings },
      ],
    },
  ];

  const studentNavGroups: NavGroup[] = [
    {
      id: 'student-core',
      groupTitle: 'Student Portal',
      items: [
        { id: 'student-portal', label: 'My Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'student-academics',
      groupTitle: 'Academics',
      items: [
        { id: 'timetable', label: 'My Timetable', icon: CalendarDays },
        { id: 'homework', label: 'My Homework', icon: FileText },
        { id: 'results', label: 'My Report Card', icon: Award },
        { id: 'attendance', label: 'My Attendance', icon: CalendarCheck },
      ],
    },
    {
      id: 'student-finance',
      groupTitle: 'Billing & Notices',
      items: [
        { id: 'fees', label: 'Fee Invoices', icon: CreditCard },
        { id: 'announcements', label: 'Announcements', icon: Bell },
      ],
    },
    {
      id: 'student-account',
      groupTitle: 'Account & Preferences',
      items: [
        { id: 'settings', label: 'My Account & Settings', icon: Settings },
      ],
    },
  ];

  // Dynamically attach delegated admin permissions for staff / teachers
  const dynamicTeacherNavGroups = useMemo(() => {
    if (userRole !== 'teacher') return teacherNavGroups;
    const perms = (user?.permissions || []) as string[];

    const delegatedItems: NavItem[] = [];

    if (perms.includes('fee_management')) {
      delegatedItems.push({ id: 'fees', label: 'Fees & Billing', icon: CreditCard });
    }
    if (perms.includes('admissions_management')) {
      delegatedItems.push({ id: 'admissions', label: 'Admissions & Applicants', icon: UserCheck });
    }
    if (perms.includes('public_portal_management')) {
      delegatedItems.push({ id: 'public-portal', label: 'Public Portal & CMS', icon: Globe });
    }
    if (perms.includes('visual_page_editor')) {
      delegatedItems.push({ id: 'public-portal-editor', label: 'Visual Page Editor', icon: Sparkles });
    }
    if (perms.includes('class_management')) {
      delegatedItems.push({ id: 'classes', label: 'Classes & Departments', icon: BookOpen });
    }
    if (perms.includes('attendance_management')) {
      delegatedItems.push({ id: 'attendance', label: 'All School Attendance', icon: CalendarCheck });
    }

    if (delegatedItems.length === 0) {
      return teacherNavGroups;
    }

    return [
      ...teacherNavGroups,
      {
        id: 'teacher-delegated-admin',
        groupTitle: 'Delegated Admin Privileges',
        items: delegatedItems,
      },
    ];
  }, [userRole, user?.permissions, teacherNavGroups]);

  let navGroups = adminNavGroups;
  if (userRole === 'teacher') navGroups = dynamicTeacherNavGroups;
  if (userRole === 'parent') navGroups = parentNavGroups;
  if (userRole === 'student') navGroups = studentNavGroups;

  // Filter groups when searching
  const filteredNavGroups = useMemo(() => {
    if (!filterQuery.trim()) return navGroups;
    const q = filterQuery.toLowerCase().trim();
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            group.groupTitle?.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, filterQuery]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const roleLabels: Record<UserRole, { title: string; color: string }> = {
    super_admin: { title: 'Super Administrator', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    teacher: { title: 'Academic Staff', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    parent: { title: 'Parent / Guardian', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    student: { title: 'Enrolled Student', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  };

  const handleNavClick = (id: string) => {
    onSelectView(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Animated Backdrop with smooth fade in/out */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden transition-opacity duration-300 ease-in-out ${
          isOpenMobile ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseMobile}
        aria-hidden={!isOpenMobile}
      />

      {/* Main Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed left-0 top-0 z-40 flex h-screen select-none flex-col justify-between border-r border-violet-200 bg-[#efecf4] text-slate-700 shadow-xl shadow-violet-950/[0.08] transition-all duration-300 ease-in-out md:sticky ${
          /* Mobile slide in / out */
          isOpenMobile
            ? 'translate-x-0 w-72 md:w-auto'
            : '-translate-x-full md:translate-x-0'
        } ${
          /* Desktop collapsed vs expanded widths */
          isCollapsed ? 'md:w-20' : 'md:w-68'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header Brand & Mobile Close / Desktop Collapse Toggle */}
          <div className={`relative flex min-h-[72px] items-center justify-between border-b border-violet-100 bg-white px-4 py-4 ${isCollapsed ? 'md:justify-center' : ''}`}>
            <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'md:justify-center' : ''}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-sm">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt={`${schoolName} logo`} className="h-full w-full object-contain p-1" />
                ) : (
                  <School className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              {/* School title (hidden when collapsed on desktop) */}
              <div
                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                  isCollapsed ? 'md:w-0 md:opacity-0' : 'w-auto opacity-100'
                }`}
              >
                <h1 className="max-w-[150px] truncate text-sm font-bold tracking-tight text-slate-900">
                  {schoolName}
                </h1>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-600">School workspace</p>
              </div>
            </div>

            {/* Close Button on Mobile */}
            <button
              type="button"
              id="sidebar-mobile-close-btn"
              onClick={onCloseMobile}
              className="flex h-10 w-10 min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700 md:hidden"
              aria-label="Close sidebar menu"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Desktop Collapse Toggle (inside header) */}
            <button
              type="button"
              id="sidebar-desktop-collapse-btn"
              onClick={onToggleCollapse}
              className={`hidden cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700 md:flex ${
                isCollapsed ? 'absolute right-2 top-1/2 -translate-y-1/2' : ''
              }`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* User Role Indicator (hidden when collapsed on desktop) */}
          <div
            className={`overflow-hidden border-b border-violet-100 bg-violet-50/60 transition-all duration-300 ${
              isCollapsed ? 'md:h-0 md:p-0 md:opacity-0 border-none' : 'px-4 py-2.5 opacity-100'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-medium text-slate-500">Signed in as</span>
              <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-violet-800">
                {roleLabels[userRole]?.title || userRole}
              </span>
            </div>
          </div>

          {/* Quick Navigation Filter for Admin (when expanded) */}
          {!isCollapsed && userRole === 'super_admin' && (
            <div className="px-3 pt-3 pb-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Quick find page..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-7 text-xs text-slate-700 placeholder:text-slate-400 transition-colors focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-violet-700"
                    aria-label="Clear filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Navigation Items Organized in Groups */}
          <nav className="flex-1 px-2.5 py-3 space-y-3 overflow-y-auto overflow-x-hidden">
            {filteredNavGroups.map((group, groupIdx) => {
              const hasActiveChild = group.items.some((item) => item.id === currentView);
              const isGroupCollapsed = !hasActiveChild && collapsedGroups[group.id] && !filterQuery;

              return (
                <div key={group.id || groupIdx} className="space-y-1">
                  {/* Group Header Label with Collapsible Toggle */}
                  {group.groupTitle && (
                    <div
                      className={`transition-all duration-300 ${
                        isCollapsed ? 'md:hidden' : 'block'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="group/header flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 transition-colors hover:text-violet-800"
                      >
                        <span className="truncate">{group.groupTitle}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover/header:text-violet-700 ${
                            isGroupCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Collapsed divider separator between groups */}
                  {isCollapsed && groupIdx > 0 && (
                    <div className="my-2 mx-2 hidden border-t border-violet-100 md:block" />
                  )}

                  {/* Group Items */}
                  {!isGroupCollapsed && (
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;
                        const isCommunications = item.id === 'communications';
                        const hasUnread = isCommunications && unreadCount > 0;

                        return (
                          <div key={item.id} className="relative group">
                            <button
                              id={`nav-item-${item.id}`}
                              type="button"
                              onClick={() => handleNavClick(item.id)}
                              className={`relative flex min-h-10 w-full cursor-pointer items-center rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:text-sm ${
                                isCollapsed
                                  ? 'justify-center p-3'
                                  : 'gap-3 px-3 py-2'
                              } ${
                                isActive
                                  ? 'bg-violet-100 font-semibold text-violet-900 shadow-sm shadow-violet-900/[0.04] before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-violet-600'
                                  : 'text-slate-600 hover:bg-white hover:text-violet-800'
                              }`}
                              title={isCollapsed ? (hasUnread ? `${item.label} (${unreadCount} new)` : item.label) : undefined}
                            >
                              <div className="relative shrink-0">
                                <Icon
                                  className={`transition-transform ${
                                    isCollapsed ? 'w-5 h-5' : 'w-4 h-4'
                                  } ${isActive ? 'text-violet-700' : 'text-slate-400 group-hover:text-violet-700'}`}
                                />
                                {/* Pulse notification dot when collapsed */}
                                {isCollapsed && hasUnread && (
                                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#fbfaff] animate-pulse" />
                                )}
                              </div>

                              {/* Nav Label */}
                              <span
                                className={`truncate text-left transition-all duration-300 whitespace-nowrap ${
                                  isCollapsed ? 'md:hidden' : 'block'
                                }`}
                              >
                                {item.label}
                              </span>

                              {/* Prominent Banner Badge on Message Nav Item when expanded */}
                              {!isCollapsed && hasUnread && (
                                  <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                                  {unreadCount > 9 ? '9+' : unreadCount} NEW
                                </span>
                              )}
                            </button>

                            {/* Tooltip on Hover when Collapsed in Desktop */}
                            {isCollapsed && (
                              <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3.5 hidden -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-xl animate-in fade-in zoom-in-95 duration-150 md:group-hover:flex">
                                {group.groupTitle && (
                                    <span className="border-r border-slate-200 pr-1.5 text-[10px] font-bold uppercase text-slate-400">
                                    {group.groupTitle}
                                  </span>
                                )}
                                <span>{item.label}</span>
                                {hasUnread && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-500 text-white">
                                    {unreadCount} new
                                  </span>
                                )}
                                <div className="absolute right-full top-1/2 -mr-1 -translate-y-1/2 border-4 border-transparent border-r-white" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Profile & Logout */}
        <div className="border-t border-violet-100 bg-white p-3">
          <div
            className={`flex items-center rounded-2xl border border-violet-100 bg-violet-50/70 transition-all ${
              isCollapsed ? 'justify-center p-2' : 'justify-between p-2.5'
            }`}
          >
            {/* Avatar & User Details - Clickable to Manage Account */}
            <button
              type="button"
              onClick={() => onSelectView('settings')}
              title="Manage My Account Settings"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 overflow-hidden text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-xs font-bold text-violet-800 shadow-sm"
              >
                {userFullName?.charAt(0) || 'U'}
              </div>
              <div
                className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${
                  isCollapsed ? 'md:w-0 md:opacity-0' : 'w-auto opacity-100'
                }`}
              >
                <p className="max-w-[120px] truncate text-xs font-semibold text-slate-800">{userFullName}</p>
                <p className="truncate text-[10px] capitalize text-slate-500">
                  {userRole.replace('_', ' ')}
                </p>
              </div>
            </button>

            {/* Logout action */}
            <button
              id="sidebar-logout-btn"
              type="button"
              onClick={openLogoutConfirm}
              title="Sign out of school portal"
              className={`shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 ${
                isCollapsed ? 'hidden md:hidden' : 'block'
              }`}
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Collapsed view logout button */}
          {isCollapsed && (
            <div className="hidden md:flex justify-center mt-2 relative group">
              <button
                type="button"
                onClick={openLogoutConfirm}
                className="flex w-full cursor-pointer items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3.5 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-rose-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 shadow-xl md:group-hover:flex">
                Sign Out
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

