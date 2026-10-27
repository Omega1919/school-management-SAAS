import React, { useState } from 'react';
import {
  Shield,
  GraduationCap,
  Users,
  BookOpen,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
  Award,
  DollarSign,
  AlertCircle,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { UserRole } from '../types.ts';

interface DemoSandboxViewProps {
  onOpenLiveLogin: () => void;
  onOpenAdmissions?: () => void;
}

interface SandboxPortal {
  role: UserRole;
  badgeLabel: string;
  title: string;
  subtitle: string;
  email: string;
  pass: string;
  accentColor: string;
  bgGradient: string;
  icon: React.ElementType;
  highlights: string[];
}

const SANDBOX_PORTALS: Record<UserRole, SandboxPortal> = {
  super_admin: {
    role: 'super_admin',
    badgeLabel: 'Super Admin Portal',
    title: 'Executive Administration & Operations',
    subtitle: 'Full institution authority: manage classes, timetable engines, fee billing, and system audit logs.',
    email: 'admin@school.com',
    pass: 'admin123',
    accentColor: '#9333EA',
    bgGradient: 'from-purple-950/60 via-slate-900 to-slate-950',
    icon: Shield,
    highlights: [
      'Interactive Timetable Schedule Engine with Conflict Resolution',
      'Student Admissions CMS & Visual Landing Page Editor',
      'Tuition Fee Structure, Billing Ledger, and Audit Logs',
      'Staff & Teacher Class Subject Allocations',
    ],
  },
  teacher: {
    role: 'teacher',
    badgeLabel: 'Teacher / Faculty Portal',
    title: 'Classroom & Academic Instruction',
    subtitle: 'Daily classroom workflow: record attendance, submit grading batches, and assign coursework.',
    email: 'teacher.adewale@school.com',
    pass: 'teacher123',
    accentColor: '#2563EB',
    bgGradient: 'from-blue-950/60 via-slate-900 to-slate-950',
    icon: GraduationCap,
    highlights: [
      'Daily Class Attendance Register with Quick Status Markers',
      'Batch Examination & Continuous Assessment Grade Entry',
      'Homework Assignment Publishing & Student Work Submissions',
      'Teacher Timetable Schedule & Classroom Workstations',
    ],
  },
  parent: {
    role: 'parent',
    badgeLabel: 'Parent & Guardian Portal',
    title: 'Family & Student Guardian Hub',
    subtitle: 'Stay connected with your child\'s real-time school attendance, term report cards, and tuition invoices.',
    email: 'parent.ibrahim@school.com',
    pass: 'parent123',
    accentColor: '#059669',
    bgGradient: 'from-emerald-950/60 via-slate-900 to-slate-950',
    icon: Users,
    highlights: [
      'Child Attendance Telemetry & Daily Academic Presence Records',
      'End-of-Term Report Card Summaries & GPA Tracking',
      'Fee Statements, Payment Receipts, and Balance Tracking',
      'Direct Two-Way Communication with Assigned Subject Teachers',
    ],
  },
  student: {
    role: 'student',
    badgeLabel: 'Student Portal',
    title: 'Scholar Learning & Timetable Space',
    subtitle: 'Personal student desk: check weekly lecture periods, submit coursework, and view exam results.',
    email: 'student.chinedu@school.com',
    pass: 'student123',
    accentColor: '#4F46E5',
    bgGradient: 'from-indigo-950/60 via-slate-900 to-slate-950',
    icon: BookOpen,
    highlights: [
      'Personal Weekly Timetable & Room Allocation Schedule',
      'Continuous Assessment Scores & Cumulative Term Grades',
      'Homework Task Tracker with Online Submission Tools',
      'School Bulletin Board, Announcements, and Academic Events',
    ],
  },
};

export const DemoSandboxView: React.FC<DemoSandboxViewProps> = ({
  onOpenLiveLogin,
  onOpenAdmissions,
}) => {
  const { login, demoLogin } = useAuth();
  const { schoolName } = useSettings();

  const [activeRole, setActiveRole] = useState<UserRole>('super_admin');
  const [identifier, setIdentifier] = useState(SANDBOX_PORTALS.super_admin.email);
  const [password, setPassword] = useState(SANDBOX_PORTALS.super_admin.pass);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePortal = SANDBOX_PORTALS[activeRole];

  const handleRoleSelect = (role: UserRole) => {
    setActiveRole(role);
    setIdentifier(SANDBOX_PORTALS[role].email);
    setPassword(SANDBOX_PORTALS[role].pass);
    setError(null);
  };

  const handleLaunchPortal = async (_customId?: string, _customPass?: string) => {
    setLoading(true);
    setError(null);
    try {
      await demoLogin(activeRole);
    } catch (err: any) {
      setError(err.message || 'Sandbox login failed. Please ensure demo credentials match.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-purple-500 selection:text-white">
      {/* ========================================================================= */}
      {/* 1. TOP SANDBOX MODE NOTIFICATION BAR                                      */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-purple-900/90 via-slate-900 to-indigo-900/90 border-b border-purple-500/30 px-4 py-2.5 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold uppercase tracking-wider text-purple-200">
              Interactive Demo Sandbox
            </span>
            <span className="text-slate-400 hidden sm:inline">·</span>
            <span className="text-slate-300 hidden sm:inline">
              Pre-seeded multi-user evaluation environment with bypassed 2FA
            </span>
          </div>

          <div className="flex items-center gap-3">
            {onOpenAdmissions && (
              <button
                type="button"
                onClick={onOpenAdmissions}
                className="text-purple-300 hover:text-white transition-colors cursor-pointer font-medium flex items-center gap-1"
              >
                <span>Admissions Page</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenLiveLogin}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all border border-white/20 cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Go to Live Institutional Login</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. HERO INTRO & PORTAL SELECTOR                                           */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{schoolName || 'Greenwood School Management'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            Explore All 4 Portals in the Sandbox
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-400">
            Select a school persona below to test complete real-world workflows without configuring real phone numbers or emails.
          </p>

          {/* 4 Persona Segmented Switcher */}
          <div className="mt-6 sm:mt-8 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl grid grid-cols-2 lg:grid-cols-4 gap-1.5 shadow-xl">
            {(Object.keys(SANDBOX_PORTALS) as UserRole[]).map((r) => {
              const p = SANDBOX_PORTALS[r];
              const Icon = p.icon;
              const isActive = r === activeRole;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRoleSelect(r)}
                  className={`px-3.5 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{p.badgeLabel.replace(' Portal', '')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 3. ACTIVE PERSONA SPOTLIGHT & 1-CLICK LAUNCH CRADLE                     */}
        {/* ======================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Persona Overview & Key Capabilities */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-80 h-80 bg-gradient-to-br ${activePortal.bgGradient} rounded-full blur-3xl opacity-40 pointer-events-none`} />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
                  style={{ backgroundColor: activePortal.accentColor }}
                >
                  <activePortal.icon className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-mono font-bold tracking-wider text-purple-400 uppercase">
                    {activePortal.badgeLabel}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    {activePortal.title}
                  </h2>
                </div>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                {activePortal.subtitle}
              </p>

              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Included Sandbox Workflows & Features:
                </h3>
                <ul className="space-y-2.5">
                  {activePortal.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative z-10 pt-8 mt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-300">Default Demo Credentials:</span>
                <span className="font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-800/40">
                  {activePortal.email}
                </span>
                <span className="font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">
                  {activePortal.pass}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Launch & Credential Panel */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">
                  Launch {activePortal.badgeLabel}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Click the instant launch button below to enter this portal immediately.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1-Click Launch Button */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleLaunchPortal(activePortal.email, activePortal.pass)}
                className="w-full py-4 px-6 rounded-2xl text-white font-black text-base shadow-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                style={{ backgroundColor: activePortal.accentColor }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>1-Click Launch as {activePortal.badgeLabel.replace(' Portal', '')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-bold">
                  <span className="bg-slate-900 px-3 text-slate-500">
                    Or Enter Test Credentials
                  </span>
                </div>
              </div>

              {/* Manual Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLaunchPortal();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Demo Identifier / Email
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-hidden focus:border-purple-500 font-mono transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Demo Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white focus:outline-hidden focus:border-purple-500 font-mono transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700 cursor-pointer"
                >
                  Sign In with Entered Credentials
                </button>
              </form>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-800/80 text-center">
              <button
                type="button"
                onClick={onOpenLiveLogin}
                className="text-xs text-slate-400 hover:text-white font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ready for live school usage? Switch to Live Login</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. SANDBOX FOOTER                                                         */}
      {/* ========================================================================= */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        <p>
          Greenwood School Management Platform · Sandbox Evaluation Mode · All accounts and data in this view are synthetic.
        </p>
      </footer>
    </div>
  );
};
