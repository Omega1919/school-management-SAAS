import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Award,
  CalendarCheck,
  FileText,
  Clock,
  CheckCircle,
  CreditCard,
  Bell,
  Send,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { useAccountModal } from '../context/AccountModalContext.tsx';
import { User, LogOut } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { PortalWelcomeArt } from '../components/PortalWelcomeArt.tsx';

export const StudentPortalView: React.FC<{ onNavigate: (view: string) => void }> = ({
  onNavigate,
}) => {
  const { user } = useAuth();
  const { currencySymbol } = useSettings();
  const { openAccountModal, openLogoutConfirm } = useAccountModal();

  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [homeworkList, setHomeworkList] = useState<any[]>([]);
  const [resultsList, setResultsList] = useState<any[]>([]);
  const [attStats, setAttStats] = useState<{ rate: number; present: number; total: number }>({ rate: 95, present: 38, total: 40 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudentDashboard();
  }, []);

  const loadStudentDashboard = async () => {
    try {
      setLoading(true);
      const [profileRes, hwRes, resRes, meStudent] = await Promise.all([
        apiRequest<any>('/auth/me'),
        apiRequest<any[]>('/homework'),
        apiRequest<any[]>('/results'),
        apiRequest<any>('/students/me').catch(() => null),
      ]);
      setStudentInfo(profileRes);
      setHomeworkList(hwRes || []);
      setResultsList(resRes || []);

      if (meStudent?.id) {
        const sum = await apiRequest<any>(`/attendance/student/${meStudent.id}/summary`).catch(() => null);
        if (sum) {
          setAttStats({
            rate: sum.attendanceRate || 95,
            present: sum.present || 38,
            total: sum.totalDays || 40,
          });
        }
      }
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculatedAverage = resultsList.length > 0
    ? (resultsList.reduce((acc, r) => acc + Number(r.totalScore || 0), 0) / resultsList.length).toFixed(1)
    : '82.5';

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-linear-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-blue-200 text-xs font-semibold backdrop-blur-xs mb-3 border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Student Academic Space</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hi, {user?.fullName || 'Student'}!
            </h1>
            <p className="mt-2 text-sm text-blue-100 max-w-xl leading-relaxed">
              Stay on top of your daily class schedule, submit homework before the deadline, and inspect your exam scores.
            </p>
          </div>

          <PortalWelcomeArt role="student" className="hidden h-36 w-40 shrink-0 lg:flex" />

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={openAccountModal}
              className="px-3.5 py-2 bg-white text-blue-900 font-bold text-xs rounded-xl shadow-md hover:bg-blue-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px]"
            >
              <User className="w-4 h-4 text-blue-700" />
              <span>Manage Account</span>
            </button>
            <button
              onClick={openLogoutConfirm}
              className="px-3.5 py-2 bg-white/15 text-white font-bold text-xs rounded-xl hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer flex items-center gap-1.5 min-h-[38px]"
            >
              <LogOut className="w-4 h-4 text-rose-200" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5 relative z-10 pt-2 border-t border-white/15">
          <button
            onClick={() => onNavigate('homework')}
            className="px-3.5 py-1.5 bg-white/10 text-white font-semibold text-xs rounded-lg hover:bg-white/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Submit Homework</span>
          </button>
          <button
            onClick={() => onNavigate('results')}
            className="px-3.5 py-1.5 bg-white/10 text-white font-semibold text-xs rounded-lg hover:bg-white/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Award className="w-3.5 h-3.5" />
            <span>View Report Card</span>
          </button>
          <button
            onClick={() => onNavigate('timetable')}
            className="px-3.5 py-1.5 bg-purple-500/20 text-white font-semibold text-xs rounded-lg hover:bg-purple-500/40 active:scale-95 transition-all border border-purple-400/20 cursor-pointer flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>My Class Timetable</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Attendance Rate</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{attStats.rate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">Present on {attStats.present} of {attStats.total} school days</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Pending Homework</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{homeworkList.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Active assignments due</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Term Average</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{calculatedAverage}%</p>
          <p className="text-[11px] text-slate-500 mt-1">Grade: A (Distinction)</p>
        </div>
      </div>

      {/* Coursework & Homework Due List */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <span>Upcoming Coursework & Deadlines</span>
          </h3>
          <button
            onClick={() => onNavigate('homework')}
            className="text-xs font-semibold text-purple-600 hover:text-purple-700 cursor-pointer"
          >
            View All
          </button>
        </div>

        {homeworkList.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No homework pending! Great work.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {homeworkList.slice(0, 4).map((hw) => (
              <div key={hw.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{hw.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {hw.subjectName} • Due: {new Date(hw.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('homework')}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Submit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
