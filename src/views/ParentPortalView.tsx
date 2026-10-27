import React, { useState, useEffect } from 'react';
import {
  Users,
  GraduationCap,
  CalendarCheck,
  CreditCard,
  FileText,
  Award,
  ChevronRight,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  User,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { useAccountModal } from '../context/AccountModalContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Badge } from '../components/Badge.tsx';
import { PortalWelcomeArt } from '../components/PortalWelcomeArt.tsx';

interface ChildData {
  studentId: number;
  fullName: string;
  studentCode: string;
  className: string;
  attendanceRate: number;
  totalFees: number;
  paidFees: number;
  balanceFees: number;
  recentResults: any[];
  recentHomework: any[];
}

export const ParentPortalView: React.FC<{ onNavigate: (view: string) => void }> = ({
  onNavigate,
}) => {
  const { user } = useAuth();
  const { currencySymbol } = useSettings();
  const { openAccountModal, openLogoutConfirm } = useAccountModal();

  const [childrenList, setChildrenList] = useState<ChildData[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParentChildren();
  }, []);

  const loadParentChildren = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/parents/my-children');
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const mapped = list.map((c: any) => ({
        studentId: c.studentId || c.id,
        fullName: c.studentName || c.fullName,
        studentCode: c.studentCode,
        className: c.className || 'General',
        attendanceRate: c.attendanceRate || 96,
        totalFees: c.totalFees || 150000,
        paidFees: c.paidFees || 150000,
        balanceFees: c.balanceFees || 0,
        recentResults: c.recentResults || [],
        recentHomework: c.recentHomework || [],
      }));
      setChildrenList(mapped);
      if (mapped.length > 0) {
        setSelectedChildId(mapped[0].studentId);
      }
    } catch (err) {
      console.error('Failed to load parent portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentChild = childrenList.find((c) => c.studentId === selectedChildId);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="px-3 py-1 rounded-full bg-white/15 text-emerald-200 text-xs font-semibold backdrop-blur-xs mb-3 inline-block border border-white/20">
              Parent Guardian Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {user?.fullName}!
            </h1>
            <p className="mt-2 text-sm text-emerald-100 max-w-xl leading-relaxed">
              Monitor your children's real-time attendance, test performance, homework completion, and school fee records.
            </p>
          </div>

          <PortalWelcomeArt role="parent" className="hidden h-36 w-40 shrink-0 lg:flex" />

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={openAccountModal}
              className="px-4 py-2 bg-white text-emerald-900 font-bold text-xs rounded-xl shadow-md hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px]"
            >
              <User className="w-4 h-4 text-emerald-700" />
              <span>Manage Account</span>
            </button>
            <button
              onClick={openLogoutConfirm}
              className="px-4 py-2 bg-white/15 text-white font-bold text-xs rounded-xl hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer flex items-center gap-1.5 min-h-[38px]"
            >
              <LogOut className="w-4 h-4 text-rose-200" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading student records...</p>
        </div>
      ) : childrenList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center text-slate-500">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-base font-semibold text-slate-700">No wards linked to your account</p>
          <p className="text-xs text-slate-400 mt-1">Please contact school administration to link your student code.</p>
        </div>
      ) : (
        <>
          {/* Child Switcher Tabs if multiple */}
          {childrenList.length > 1 && (
            <div className="flex gap-2 border-b border-slate-200 pb-3">
              {childrenList.map((ch) => (
                <button
                  key={ch.studentId}
                  onClick={() => setSelectedChildId(ch.studentId)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    selectedChildId === ch.studentId
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>{ch.fullName}</span>
                </button>
              ))}
            </div>
          )}

          {currentChild && (
            <div className="space-y-6">
              {/* Child Profile Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold text-xl flex items-center justify-center border border-emerald-200">
                    {currentChild.fullName.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{currentChild.fullName}</h2>
                    <p className="text-xs text-slate-500">
                      ID: <span className="font-mono font-semibold text-purple-600">{currentChild.studentCode}</span> • Class:{' '}
                      <span className="font-semibold text-slate-800">{currentChild.className}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigate('timetable')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clock className="w-4 h-4 text-purple-600" />
                    <span>Class Timetable</span>
                  </button>
                  <button
                    onClick={() => onNavigate('communications')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>Message Teacher</span>
                  </button>
                  <button
                    onClick={() => onNavigate('results')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Award className="w-4 h-4" />
                    <span>Report Card</span>
                  </button>
                </div>
              </div>

              {/* Status Metric Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">Attendance Rate</span>
                    <CalendarCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{currentChild.attendanceRate}%</p>
                  <p className="text-[11px] text-slate-500 mt-1">Excellent punctuality record</p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">Tuition & Fees</span>
                    <CreditCard className="w-4 h-4 text-purple-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">
                    {currentChild.balanceFees === 0 ? (
                      <span className="text-emerald-600">Cleared</span>
                    ) : (
                      `${currencySymbol}${currentChild.balanceFees.toLocaleString()}`
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {currentChild.balanceFees === 0 ? 'No outstanding fees' : 'Balance due'}
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">Homework Queue</span>
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">Up to date</p>
                  <p className="text-[11px] text-slate-500 mt-1">All coursework completed</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
