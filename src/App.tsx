import React, { useState, useEffect } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext.tsx';
import { SettingsProvider, useSettings } from './context/SettingsContext.tsx';
import { ProfileModalProvider } from './context/ProfileModalContext.tsx';
import { AccountModalProvider, useAccountModal } from './context/AccountModalContext.tsx';
import { CommunicationsProvider, useCommunications } from './context/CommunicationsContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { GlobalSearchModal } from './components/GlobalSearchModal.tsx';
import { MessageNotificationToast } from './components/MessageNotificationToast.tsx';

// Views
import { LoginView } from './views/LoginView.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { StudentsView } from './views/StudentsView.tsx';
import { TeachersView } from './views/TeachersView.tsx';
import { ClassesView } from './views/ClassesView.tsx';
import { HomeworkView } from './views/HomeworkView.tsx';
import { CommunicationsView } from './views/CommunicationsView.tsx';
import { AttendanceView } from './views/AttendanceView.tsx';
import { ResultsView } from './views/ResultsView.tsx';
import { FeesView } from './views/FeesView.tsx';
import { AnnouncementsView } from './views/AnnouncementsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { AuditLogsView } from './views/AuditLogsView.tsx';
import { ParentPortalView } from './views/ParentPortalView.tsx';
import { StudentPortalView } from './views/StudentPortalView.tsx';
import { TimetableView } from './views/TimetableView.tsx';
import { AdmissionsAdminView } from './views/AdmissionsAdminView.tsx';
import { AdmissionsPublicView } from './views/AdmissionsPublicView.tsx';
import { PublicPortalAdminView } from './views/PublicPortalAdminView.tsx';
import { AdmissionsVisualEditorView } from './views/AdmissionsVisualEditorView.tsx';
import { ResetPasswordView } from './views/ResetPasswordView.tsx';

function MainApp() {
  const { user, loading } = useAuth();
  const { openLogoutConfirm } = useAccountModal();
  const { schoolName } = useSettings();
  const { setTargetThreadId } = useCommunications();

  const [currentView, setCurrentView] = useState<string>('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [showResetPassword, setShowResetPassword] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const search = window.location.search;
      return (
        path.includes('/reset-password') ||
        hash.startsWith('#/reset-password') ||
        search.includes('token=')
      );
    }
    return false;
  });
  const [showPublicAdmissions, setShowPublicAdmissions] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      return (
        hash.startsWith('#/apply') ||
        hash.startsWith('#/admissions') ||
        hash.startsWith('#/programs') ||
        hash.startsWith('#/news') ||
        hash.startsWith('#/track') ||
        hash.startsWith('#/requirements') ||
        hash.startsWith('#/dates') ||
        hash.startsWith('#/faqs')
      );
    }
    return false;
  });

  // Listen to hash and popstate changes for deep linking (e.g. #/apply, #/reset-password, or ?token=)
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const search = window.location.search;

      if (path.includes('/reset-password') || hash.startsWith('#/reset-password') || search.includes('token=')) {
        setShowResetPassword(true);
      }

      if (
        hash.startsWith('#/apply') ||
        hash.startsWith('#/admissions') ||
        hash.startsWith('#/programs') ||
        hash.startsWith('#/news') ||
        hash.startsWith('#/track') ||
        hash.startsWith('#/requirements') ||
        hash.startsWith('#/dates') ||
        hash.startsWith('#/faqs')
      ) {
        setShowPublicAdmissions(true);
      }
    };

    const handleAppNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setCurrentView(customEvent.detail);
      }
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('app-navigate', handleAppNavigate);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('app-navigate', handleAppNavigate);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-300">Loading School Management Portal...</p>
      </div>
    );
  }

  if (!user) {
    if (showResetPassword) {
      return (
        <ResetPasswordView
          onBackToLogin={() => {
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/');
            }
            setShowResetPassword(false);
          }}
        />
      );
    }

    if (showPublicAdmissions) {
      return (
        <AdmissionsPublicView
          onBackToLogin={() => {
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              window.location.hash = '';
            }
            setShowPublicAdmissions(false);
          }}
        />
      );
    }
    return (
      <LoginView
        onOpenAdmissions={() => {
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          }
          setShowPublicAdmissions(true);
        }}
      />
    );
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'overview':
        return <DashboardView onNavigate={(v) => setCurrentView(v)} />;
      case 'admissions':
        return <AdmissionsAdminView />;
      case 'public-portal':
        return <PublicPortalAdminView onOpenVisualEditor={() => setCurrentView('public-portal-editor')} />;
      case 'public-portal-editor':
        return <AdmissionsVisualEditorView onBack={() => setCurrentView('public-portal')} />;
      case 'students':
        return <StudentsView />;
      case 'teachers':
        return <TeachersView />;
      case 'classes':
        return <ClassesView />;
      case 'homework':
        return <HomeworkView />;
      case 'communications':
        return <CommunicationsView />;
      case 'attendance':
        return <AttendanceView />;
      case 'results':
        return <ResultsView />;
      case 'fees':
        return <FeesView />;
      case 'announcements':
        return <AnnouncementsView />;
      case 'settings':
        return <SettingsView />;
      case 'audit-logs':
        return <AuditLogsView />;
      case 'parent-portal':
        return <ParentPortalView onNavigate={(v) => setCurrentView(v)} />;
      case 'student-portal':
        return <StudentPortalView onNavigate={(v) => setCurrentView(v)} />;
      case 'timetable':
        return <TimetableView />;
      default:
        return <DashboardView onNavigate={(v) => setCurrentView(v)} />;
    }
  };

  const getViewTitle = () => {
    const titles: Record<string, string> = {
      overview: 'Executive Dashboard',
      admissions: 'Student Admissions & Applications',
      'public-portal': 'Public Portal & Admissions CMS',
      'public-portal-editor': 'Admissions Page Visual Editor',
      students: 'Student Directory',
      teachers: 'Faculty & Instructors',
      classes: 'Classes & Curriculum',
      timetable: 'Class Timetables & Schedules',
      homework: 'Homework & Coursework',
      communications: 'Parent-Teacher Messages',
      attendance: 'Attendance Register',
      results: 'Academic Scores & Report Cards',
      fees: 'Fees & Billing',
      announcements: 'School Announcements',
      settings: 'School Configuration',
      'audit-logs': 'Security Audit Trail',
      'parent-portal': 'Parent Guardian Portal',
      'student-portal': 'Student Academic Space',
    };
    return titles[currentView] || 'School Management System';
  };

  return (
    <div className="min-h-screen bg-[#e7e4ed] flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={(v) => setCurrentView(v)}
        userRole={user.role}
        userFullName={user.fullName}
        onLogout={openLogoutConfirm}
        isOpenMobile={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        isCollapsed={isDesktopCollapsed}
        onToggleCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={getViewTitle()}
          onOpenMobileMenu={() => setIsMobileNavOpen(true)}
          onToggleDesktopCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
          isDesktopCollapsed={isDesktopCollapsed}
          activeTerm={{ sessionName: '2025/2026', termName: 'First Term' }}
          showSearch={true}
          onOpenSearch={() => setIsSearchOpen(true)}
          onNavigateToMessages={() => setCurrentView('communications')}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderCurrentView()}
        </main>
      </div>

      {/* Real-time Message Notification Banner / Toast */}
      <MessageNotificationToast
        onNavigateToMessages={(threadId) => {
          setCurrentView('communications');
          if (threadId !== undefined) {
            const numId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
            setTargetThreadId(isNaN(numId) ? null : numId);
          }
        }}
      />

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={(view) => {
          setCurrentView(view);
          setIsSearchOpen(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <AccountModalProvider>
            <CommunicationsProvider>
              <ProfileModalProvider>
                <MainApp />
              </ProfileModalProvider>
            </CommunicationsProvider>
          </AccountModalProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
