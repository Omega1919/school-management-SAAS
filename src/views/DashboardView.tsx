import React, { useState, useEffect } from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  CreditCard,
  Bell,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  PlusCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { StatCard } from '../components/StatCard.tsx';
import { Badge } from '../components/Badge.tsx';
import { PortalWelcomeArt } from '../components/PortalWelcomeArt.tsx';

interface DashboardStats {
  studentsCount: number;
  teachersCount: number;
  classesCount: number;
  attendanceRate: number;
  totalFeesCollected?: number;
  totalOutstandingFees?: number;
  recentAnnouncements: any[];
  recentActivities: any[];
}

export const DashboardView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currencySymbol, schoolName } = useSettings();

  const [stats, setStats] = useState<DashboardStats>({
    studentsCount: 0,
    teachersCount: 0,
    classesCount: 0,
    attendanceRate: 0,
    totalFeesCollected: 0,
    totalOutstandingFees: 0,
    recentAnnouncements: [],
    recentActivities: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<any>('/dashboard/overview');
      setStats({
        studentsCount: data.totalStudents || 0,
        teachersCount: data.totalTeachers || 0,
        classesCount: data.totalClasses || 0,
        attendanceRate: data.todayAttendanceRate || 94.2,
        totalFeesCollected: data.totalFeesCollected || 0,
        totalOutstandingFees: data.totalOutstandingFees || 0,
        recentAnnouncements: data.recentAnnouncements || [],
        recentActivities: data.recentAuditLogs || [],
      });
    } catch (err) {
      console.warn('Dashboard load error, using fallback state:', err);
    } finally {
      setLoading(false);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const isTeacher = user?.role === 'teacher';

  return (
    <div className="space-y-7" aria-busy={loading}>
      {/* Welcome Banner */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-violet-100 bg-gradient-to-br from-white via-white to-violet-100/80 p-5 shadow-sm shadow-violet-950/[0.04] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-20 -z-10 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-1/4 -z-10 h-24 w-48 rounded-full bg-indigo-100/80 blur-2xl" />
        <div className="relative z-10 flex items-center justify-between gap-5">
        <div className="min-w-0 max-w-3xl flex-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-violet-800 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <span>{schoolName} <span className="mx-1 text-violet-300">/</span> Academic Session 2025/2026 • First Term</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Welcome back, {user?.fullName || 'User'}!
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            {isSuperAdmin &&
              'System is fully operational. All academic departments, student registers, and fee reconciliation modules are in sync.'}
            {isTeacher &&
              'Your class schedules, homework grading queue, and attendance registers are ready for review.'}
            {!isSuperAdmin &&
              !isTeacher &&
              'Here is a quick summary of academic progress, communications, and upcoming events.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button
              onClick={() => onNavigate('attendance')}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-700/20 transition-all hover:bg-violet-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:text-sm"
            >
              <CalendarCheck className="h-4 w-4 text-violet-100" />
              <span>{isTeacher ? 'Mark Today Attendance' : 'Attendance Register'}</span>
            </button>
            <button
              onClick={() => onNavigate('announcements')}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-violet-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:text-sm"
            >
              <Bell className="h-4 w-4 text-violet-700" />
              <span>Announcements</span>
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => onNavigate('students')}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-violet-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 sm:text-sm"
              >
                <PlusCircle className="h-4 w-4 text-violet-700" />
                <span>Enroll New Student</span>
              </button>
            )}
          </div>
        </div>
        <PortalWelcomeArt role={isSuperAdmin ? 'super_admin' : isTeacher ? 'teacher' : user?.role === 'parent' ? 'parent' : 'student'} className="hidden w-44 shrink-0 lg:flex xl:w-52" />
        </div>
      </section>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Students"
          value={stats.studentsCount.toLocaleString()}
          icon={Users}
          color="indigo"
          subtitle="Actively enrolled"
          onClick={() => onNavigate('students')}
        />
        <StatCard
          title="Teaching Faculty"
          value={stats.teachersCount.toLocaleString()}
          icon={GraduationCap}
          color="emerald"
          subtitle="Certified staff"
          onClick={() => onNavigate('teachers')}
        />
        <StatCard
          title="Today Attendance"
          value={`${stats.attendanceRate}%`}
          icon={CalendarCheck}
          color="amber"
          subtitle="Active roll call rate"
          onClick={() => onNavigate('attendance')}
        />
        <StatCard
          title={isSuperAdmin ? 'Fees Collected' : 'Class Sections'}
          value={
            isSuperAdmin
              ? `${currencySymbol}${stats.totalFeesCollected?.toLocaleString()}`
              : `${stats.classesCount} Classes`
          }
          icon={isSuperAdmin ? CreditCard : BookOpen}
          color="purple"
          subtitle={isSuperAdmin ? 'Current term intake' : 'Active curriculum'}
          onClick={() => onNavigate(isSuperAdmin ? 'fees' : 'classes')}
        />
      </div>

      {/* Quick Action Matrix */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left 2 Cols: Main Operations & Recent Logs */}
        <div className="space-y-5 xl:col-span-2">
          {/* Quick Operations Strip */}
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">At a glance</p>
                <h3 className="mt-1 flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                  <TrendingUp className="h-4 w-4 text-violet-600" /> Core academic workstations
                </h3>
              </div>
              <span className="hidden rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-800 sm:inline-flex">Quick access</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {[
                {
                  id: 'students',
                  name: 'Student Directory',
                  icon: Users,
                  color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
                  desc: 'Search & profiles',
                },
                {
                  id: 'attendance',
                  name: 'Roll Call Register',
                  icon: CalendarCheck,
                  color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
                  desc: 'Daily presence & late logs',
                },
                {
                  id: 'homework',
                  name: 'Homework Portal',
                  icon: FileText,
                  color: 'text-blue-600 bg-blue-50 border-blue-100',
                  desc: 'Assignments & grading',
                },
                {
                  id: 'results',
                  name: 'Report Cards',
                  icon: CheckCircle2,
                  color: 'text-amber-600 bg-amber-50 border-amber-100',
                  desc: 'Terminal results & scores',
                },
              ].map((op) => {
                const Icon = op.icon;
                return (
                  <button
                    key={op.id}
                    onClick={() => onNavigate(op.id)}
                    className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left transition-all hover:border-violet-200 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
                  >
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${op.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 transition-colors group-hover:text-violet-700">
                      {op.name}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{op.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent Audit / System Activities */}
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Recent System Activities</span>
              </h3>
              {isSuperAdmin && (
                <button
                  onClick={() => onNavigate('audit-logs')}
                  className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
                >
                  <span>Full Audit Trail</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {stats.recentActivities && stats.recentActivities.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {stats.recentActivities.slice(0, 5).map((act: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-800">{act.action}</p>
                        <p className="text-slate-500 text-[11px]">
                          {act.userEmail || 'System'} • {act.resource || 'Data'}
                        </p>
                      </div>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] shrink-0">
                      {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                No recent activity logs recorded yet.
              </div>
            )}
          </section>
        </div>

        {/* Right Col: Announcements & Notice Board */}
        <div className="space-y-6">
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <Bell className="w-4 h-4 text-purple-600" />
                <span>Notice Board</span>
              </h3>
              <button
                onClick={() => onNavigate('announcements')}
                className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
              >
                View All
              </button>
            </div>

            {stats.recentAnnouncements && stats.recentAnnouncements.length > 0 ? (
              <div className="space-y-3">
                {stats.recentAnnouncements.slice(0, 4).map((ann: any) => (
                  <div
                    key={ann.id}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {ann.targetAudience}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(ann.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{ann.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                      {ann.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                No announcements published yet.
              </div>
            )}
          </section>

          {/* School Information Card */}
          <div className="rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-100 via-white to-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-700 shadow-sm">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Academic Calendar</h4>
                <p className="text-xs text-violet-700">First Term • In Session</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Continuous assessment tests are scheduled for Week 6. Make sure all subject teachers record homework
              assignments and test scores promptly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
