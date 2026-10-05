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
  const { currencySymbol } = useSettings();

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
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-purple-700 via-indigo-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-purple-200 text-xs font-semibold backdrop-blur-xs mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Academic Session 2025/2026 • First Term</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName || 'User'}!
          </h1>
          <p className="mt-2 text-sm text-purple-100 leading-relaxed">
            {isSuperAdmin &&
              'System is fully operational. All academic departments, student registers, and fee reconciliation modules are in sync.'}
            {isTeacher &&
              'Your class schedules, homework grading queue, and attendance registers are ready for review.'}
            {!isSuperAdmin &&
              !isTeacher &&
              'Here is a quick summary of academic progress, communications, and upcoming events.'}
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              onClick={() => onNavigate('attendance')}
              className="px-4 py-2 bg-white text-purple-900 font-semibold text-xs sm:text-sm rounded-xl shadow-md hover:bg-purple-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CalendarCheck className="w-4 h-4 text-purple-700" />
              <span>{isTeacher ? 'Mark Today Attendance' : 'Attendance Register'}</span>
            </button>
            <button
              onClick={() => onNavigate('announcements')}
              className="px-4 py-2 bg-white/15 text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer flex items-center gap-1.5"
            >
              <Bell className="w-4 h-4" />
              <span>Announcements</span>
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => onNavigate('students')}
                className="px-4 py-2 bg-white/15 text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Enroll New Student</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Operations & Recent Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Operations Strip */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span>Core Academic Workstations</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    className="p-3.5 rounded-xl border border-slate-200/80 hover:border-purple-300 hover:shadow-md transition-all text-left bg-slate-50/50 hover:bg-white group cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 border ${op.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors">
                      {op.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{op.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Audit / System Activities */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Recent System Activities</span>
              </h3>
              {isSuperAdmin && (
                <button
                  onClick={() => onNavigate('audit-logs')}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
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
          </div>
        </div>

        {/* Right Col: Announcements & Notice Board */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-600" />
                <span>Notice Board</span>
              </h3>
              <button
                onClick={() => onNavigate('announcements')}
                className="text-xs font-semibold text-purple-600 hover:text-purple-700 cursor-pointer"
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
          </div>

          {/* School Information Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/30 flex items-center justify-center border border-purple-500/30">
                <BookOpen className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Academic Calendar</h4>
                <p className="text-xs text-slate-400">First Term • In Session</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Continuous assessment tests are scheduled for Week 6. Make sure all subject teachers record homework
              assignments and test scores promptly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
