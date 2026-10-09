import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { useSettings } from './SettingsContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  X,
  User,
  GraduationCap,
  Calendar,
  Phone,
  Mail,
  Award,
  CheckCircle2,
  Clock,
  BookOpen,
  DollarSign,
  AlertCircle,
  Shield,
  ShieldCheck,
  Layers,
  ChevronRight,
  Copy,
  Check,
  Building,
  School,
  Activity,
  History,
  Info,
  ArrowLeft,
  UserX,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { Badge } from '../components/Badge.tsx';

type ProfileType = 'student' | 'teacher' | 'parent';

interface ProfileModalContextType {
  openStudentProfile: (studentId: number | string) => void;
  openTeacherProfile: (teacherId: number | string) => void;
  openParentProfile: (parentId: number | string) => void;
  closeProfile: () => void;
  canViewProfiles: boolean;
}

const ProfileModalContext = createContext<ProfileModalContextType | undefined>(undefined);

export const ProfileModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { currencySymbol } = useSettings();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [profileType, setProfileType] = useState<ProfileType>('student');
  const [targetId, setTargetId] = useState<number | string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isAdmin = user?.role === 'super_admin';
  const isTeacher = user?.role === 'teacher';
  const canViewProfiles = isAdmin || isTeacher;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const loadProfile = useCallback(async (type: ProfileType, id: number | string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setActiveTab('overview');
    setStatusMessage(null);
    try {
      let endpoint = '';
      if (type === 'student') endpoint = `/students/${id}`;
      else if (type === 'teacher') endpoint = `/teachers/${id}`;
      else if (type === 'parent') endpoint = `/parents/${id}`;

      const res = await apiRequest<any>(endpoint);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      setError(err.message || 'Failed to retrieve profile details or access is restricted.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openStudentProfile = useCallback((studentId: number | string) => {
    setProfileType('student');
    setTargetId(studentId);
    setIsOpen(true);
    setShowDeactivateConfirm(false);
    loadProfile('student', studentId);
  }, [loadProfile]);

  const openTeacherProfile = useCallback((teacherId: number | string) => {
    setProfileType('teacher');
    setTargetId(teacherId);
    setIsOpen(true);
    setShowDeactivateConfirm(false);
    loadProfile('teacher', teacherId);
  }, [loadProfile]);

  const openParentProfile = useCallback((parentId: number | string) => {
    setProfileType('parent');
    setTargetId(parentId);
    setIsOpen(true);
    setShowDeactivateConfirm(false);
    loadProfile('parent', parentId);
  }, [loadProfile]);

  const closeProfile = useCallback(() => {
    setIsOpen(false);
    setData(null);
    setTargetId(null);
    setError(null);
    setShowDeactivateConfirm(false);
    setStatusMessage(null);
  }, []);

  const handleToggleAccountStatus = async () => {
    if (!targetId || !data) return;
    setIsTogglingStatus(true);
    setStatusMessage(null);
    try {
      let endpoint = '';
      let targetEntityId = targetId;
      if (profileType === 'student') {
        targetEntityId = data.student?.id || targetId;
        endpoint = `/students/${targetEntityId}/toggle-status`;
      } else if (profileType === 'teacher') {
        targetEntityId = data.id || targetId;
        endpoint = `/teachers/${targetEntityId}/toggle-status`;
      } else if (profileType === 'parent') {
        targetEntityId = data.parent?.id || targetId;
        endpoint = `/parents/${targetEntityId}/toggle-status`;
      }

      const response = await apiRequest<{ message: string; status: string; student?: any; teacher?: any }>(
        endpoint,
        { method: 'POST' }
      );

      // Update local state smoothly
      if (profileType === 'student' && data.student) {
        setData({
          ...data,
          student: {
            ...data.student,
            status: response.status,
          },
        });
      } else if (profileType === 'teacher') {
        setData({
          ...data,
          status: response.status,
        });
      } else if (profileType === 'parent' && data.parent) {
        setData({
          ...data,
          parent: {
            ...data.parent,
            status: response.status,
          },
        });
      }

      setStatusMessage(response.message || `Account successfully ${response.status === 'suspended' ? 'deactivated' : 'activated'}.`);
      setShowDeactivateConfirm(false);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to toggle status:', err);
      alert(err.message || 'Failed to toggle account status');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Determine current profile entity status
  const currentStatus =
    profileType === 'student'
      ? data?.student?.status || 'active'
      : profileType === 'teacher'
      ? data?.status || 'active'
      : data?.parent?.status || 'active';
  const isActive = currentStatus === 'active';

  return (
    <ProfileModalContext.Provider
      value={{
        openStudentProfile,
        openTeacherProfile,
        openParentProfile,
        closeProfile,
        canViewProfiles: !!canViewProfiles,
      }}
    >
      {children}

      {/* Global Full-Page Profile View */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto overflow-x-hidden flex flex-col min-h-screen text-slate-800 animate-in fade-in duration-150">
          {/* Top Sticky Navigation Bar */}
          <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-2xs">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4">
              {/* Back Button & Title */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={closeProfile}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 shrink-0 min-h-[38px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hidden sm:inline-flex shrink-0">
                    {profileType === 'student' && <GraduationCap className="w-4 h-4 text-indigo-600" />}
                    {profileType === 'teacher' && <User className="w-4 h-4 text-emerald-600" />}
                    {profileType === 'parent' && <Shield className="w-4 h-4 text-purple-600" />}
                  </span>
                  <div>
                    <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                      {profileType === 'student' && 'Student Profile'}
                      {profileType === 'teacher' && 'Faculty Member Profile'}
                      {profileType === 'parent' && 'Parent & Guardian Profile'}
                    </h1>
                    <p className="text-[11px] text-slate-500 hidden sm:block">
                      {isAdmin ? 'Administrative View (Bio & Overview)' : 'Authorized Academic & Institutional Profile'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Deactivate Account for Super Admin & Close Button */}
              <div className="flex items-center gap-2.5">
                {/* Deactivate / Reactivate Button (Visible to Admin) */}
                {isAdmin && data && !loading && (
                  <button
                    type="button"
                    onClick={() => setShowDeactivateConfirm(true)}
                    disabled={isTogglingStatus}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      isActive
                        ? 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100'
                        : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                  >
                    {isTogglingStatus ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : isActive ? (
                      <UserX className="w-3.5 h-3.5" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    <span>{isActive ? 'Deactivate Account' : 'Reactivate Account'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeProfile}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Close Profile Page"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </header>

          {/* Deactivation Confirmation Modal */}
          {showDeactivateConfirm && (
            <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isActive ? <AlertTriangle className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {isActive ? 'Deactivate Account Confirmation' : 'Reactivate Account Confirmation'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isActive ? 'Suspend login access and mark account inactive' : 'Restore active status and portal access'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isActive ? (
                    <>
                      Are you sure you want to <strong>deactivate</strong> this account? The user will not be able to log in to the school portal until reactivated by an administrator.
                    </>
                  ) : (
                    <>
                      Are you sure you want to <strong>reactivate</strong> this account? The user will immediately regain access to the portal.
                    </>
                  )}
                </p>
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDeactivateConfirm(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleAccountStatus}
                    disabled={isTogglingStatus}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors ${
                      isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {isTogglingStatus ? 'Updating...' : isActive ? 'Yes, Deactivate' : 'Yes, Reactivate'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status Message Notification */}
          {statusMessage && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full">
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {statusMessage}
                </span>
                <button onClick={() => setStatusMessage(null)} className="text-emerald-600 hover:text-emerald-900">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Full Page Content Container */}
          <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 w-full max-w-full flex-1 space-y-6 min-w-0">
            {loading && (
              <div className="py-24 flex flex-col items-center justify-center gap-3">
                <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-500">Loading comprehensive institutional profile...</p>
              </div>
            )}

            {error && (
              <div className="py-16 px-6 bg-white border border-slate-200 rounded-xl text-center max-w-lg mx-auto shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-900 mb-1">Access Restricted or Record Not Found</h2>
                <p className="text-xs text-slate-500 leading-relaxed mb-5">{error}</p>
                <button
                  type="button"
                  onClick={closeProfile}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* ========================================================================= */}
                {/* STUDENT FULL PAGE PROFILE */}
                {/* ========================================================================= */}
                {profileType === 'student' && (
                  <div className="w-full max-w-full min-w-0 space-y-6">
                    {/* Hero Header Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sm:gap-5 w-full max-w-full min-w-0 overflow-hidden">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-xl bg-indigo-600 text-white font-bold text-xl sm:text-2xl flex items-center justify-center shrink-0 shadow-xs">
                          {data.student?.firstName?.[0] || 'S'}
                          {data.student?.lastName?.[0] || ''}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 break-words leading-tight">
                              {data.student?.firstName} {data.student?.lastName}
                            </h2>
                            <Badge variant={data.student?.status === 'active' ? 'success' : 'danger'}>
                              {data.student?.status === 'active' ? 'Active' : 'Deactivated / Suspended'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 mt-1.5 flex-wrap min-w-0">
                            <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 shrink-0">
                              {data.student?.studentId}
                              <button
                                type="button"
                                onClick={() => copyToClipboard(data.student?.studentId, 'code')}
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Copy Student ID"
                              >
                                {copiedText === 'code' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                              </button>
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-800 truncate">
                              {data.student?.className || 'Unassigned Class'} {data.student?.classSection ? `(${data.student.classSection})` : ''}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="truncate">{data.student?.sessionName || 'Academic Session'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Summary KPIs */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-2 sm:gap-3 w-full md:w-auto shrink-0">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-center min-w-0 flex-1 md:flex-initial md:min-w-[105px]">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Attendance</span>
                          <span className="text-sm sm:text-base font-bold text-emerald-600 block mt-0.5">
                            {data.attendanceSummary?.attendancePercentage ?? 100}%
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-center min-w-0 flex-1 md:flex-initial md:min-w-[105px]">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Guardians</span>
                          <span className="text-sm sm:text-base font-bold text-slate-800 block mt-0.5">
                            {data.guardians?.length || 0} Linked
                          </span>
                        </div>
                        {/* Admin-only Financial Balance KPI */}
                        {isAdmin && data.feesSummary && (
                          <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-center min-w-0 flex-1 md:flex-initial md:min-w-[105px]">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Balance Due</span>
                            <span className={`text-sm sm:text-base font-bold font-mono block mt-0.5 ${parseFloat(data.feesSummary.outstandingBalance || '0') > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {currencySymbol}{data.feesSummary.outstandingBalance}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Navigation Tabs */}
                    {isAdmin ? (
                      /* Admin sees single page Bio & Overview directly with Payment & Billing Information */
                      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6 shadow-2xs w-full max-w-full min-w-0 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                            <User className="w-4 h-4 text-indigo-600" />
                            Bio & Overview (Administrative Record)
                          </h3>
                          <span className="text-xs text-slate-500">Identity & Demographic Information</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full min-w-0">
                          {/* Personal & Academic Details */}
                          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50 min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                              Personal & Academic Placement
                            </h4>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Full Name:</span>
                                <span className="font-semibold text-slate-900 text-right break-words min-w-0">{data.student?.firstName} {data.student?.lastName}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Student ID / Code:</span>
                                <span className="font-mono font-semibold text-slate-800 text-right truncate">{data.student?.studentId}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Gender:</span>
                                <span className="font-medium text-slate-800 text-right">{data.student?.gender || 'Not specified'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Date of Birth:</span>
                                <span className="font-medium text-slate-800 text-right">{data.student?.dateOfBirth || 'Not specified'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Admission Date:</span>
                                <span className="font-medium text-slate-800 text-right">{data.student?.admissionDate || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Current Class:</span>
                                <span className="font-semibold text-indigo-700 text-right truncate">{data.student?.className || 'Unassigned'}</span>
                              </div>
                              <div className="flex justify-between py-1.5 items-start gap-2 min-w-0">
                                <span className="text-slate-500 shrink-0">Home Address:</span>
                                <span className="font-medium text-slate-800 text-right break-words min-w-0">{data.student?.address || 'Residential Address on file'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Account & Emergency Contact */}
                          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50 min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-emerald-600" />
                              Account & Emergency Contact
                            </h4>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Portal Account Status:</span>
                                <span className="font-medium text-slate-800 text-right break-words min-w-0">
                                  {data.student?.hasAccount ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Registered ({data.student?.accountEmail || 'Active'})
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Pending First Registration</span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Emergency Phone / Info:</span>
                                <span className="font-semibold text-slate-900 text-right truncate">{data.student?.emergencyContact || 'None listed'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                <span className="text-slate-500 shrink-0">Academic Session:</span>
                                <span className="font-medium text-slate-800 text-right truncate">{data.student?.sessionName || 'Current Session'}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 py-1.5 min-w-0">
                                <span className="text-slate-500 shrink-0">Account Operational State:</span>
                                <span className="font-semibold text-right">
                                  {data.student?.status === 'active' ? (
                                    <span className="text-emerald-600">Active</span>
                                  ) : (
                                    <span className="text-rose-600">Deactivated</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Payment & Bill Information - ONLY FOR ADMIN */}
                        {data.feesSummary && (
                          <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                Payment & Billing Information (Administrative Record)
                              </h4>
                              <Badge variant={parseFloat(data.feesSummary.outstandingBalance || '0') > 0 ? 'warning' : 'success'}>
                                {parseFloat(data.feesSummary.outstandingBalance || '0') > 0 ? 'Balance Outstanding' : 'Fully Paid'}
                              </Badge>
                            </div>

                            {/* Financial Metric KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Total Billed / Invoiced</span>
                                <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
                                  {currencySymbol}{data.feesSummary.totalBilled}
                                </span>
                              </div>
                              <div className="bg-white border border-emerald-200 rounded-xl p-3.5 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Total Collected / Paid</span>
                                <span className="text-base font-bold text-emerald-700 font-mono mt-0.5 block">
                                  {currencySymbol}{data.feesSummary.totalPaid}
                                </span>
                              </div>
                              <div className="bg-white border border-rose-200 rounded-xl p-3.5 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-rose-700 block tracking-wider">Outstanding Balance</span>
                                <span className="text-base font-bold text-rose-700 font-mono mt-0.5 block">
                                  {currencySymbol}{data.feesSummary.outstandingBalance}
                                </span>
                              </div>
                            </div>

                            {/* Invoices and Fee Breakdown Table */}
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                                <span>Invoices & Fee Statements</span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                  {data.feesSummary.invoices?.length || 0} Invoice Records
                                </span>
                              </div>
                              {(!data.feesSummary.invoices || data.feesSummary.invoices.length === 0) ? (
                                <div className="p-6 text-center text-xs text-slate-400">
                                  No invoices or billing statements recorded for this student.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[640px] text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                      <tr>
                                        <th className="px-3.5 py-2.5">Invoice #</th>
                                        <th className="px-3.5 py-2.5">Fee Title</th>
                                        <th className="px-3.5 py-2.5">Academic Term</th>
                                        <th className="px-3.5 py-2.5 text-right">Billed Amount</th>
                                        <th className="px-3.5 py-2.5 text-right">Paid</th>
                                        <th className="px-3.5 py-2.5 text-right font-bold">Outstanding</th>
                                        <th className="px-3.5 py-2.5 text-center">Status</th>
                                        <th className="px-3.5 py-2.5">Due Date</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {data.feesSummary.invoices.map((inv: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="px-3.5 py-2.5 font-mono font-medium text-slate-800">{inv.invoiceNumber || '—'}</td>
                                          <td className="px-3.5 py-2.5">
                                            <div className="font-semibold text-slate-900">{inv.feeTitle}</div>
                                            {inv.feeCategory && <div className="text-[10px] text-slate-400">{inv.feeCategory}</div>}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-slate-600">{inv.termName || '—'}</td>
                                          <td className="px-3.5 py-2.5 text-right font-mono text-slate-800">{currencySymbol}{inv.amount}</td>
                                          <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600">{currencySymbol}{inv.amountPaid}</td>
                                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600">{currencySymbol}{inv.outstandingBalance}</td>
                                          <td className="px-3.5 py-2.5 text-center">
                                            <Badge
                                              variant={
                                                inv.paymentStatus === 'paid'
                                                  ? 'success'
                                                  : inv.paymentStatus === 'partially_paid'
                                                  ? 'warning'
                                                  : 'danger'
                                              }
                                            >
                                              {inv.paymentStatus}
                                            </Badge>
                                          </td>
                                          <td className="px-3.5 py-2.5 text-slate-500 font-mono text-[11px]">{inv.dueDate || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Enrollment History & Attendance Progression */}
                        {data.enrollmentHistory && data.enrollmentHistory.length > 0 && (
                          <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <History className="w-4 h-4 text-indigo-600" />
                                Enrollment History & Attendance Progression (Since Enrollment Day)
                              </h4>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Initial Enrollment: {data.enrollmentHistory[0]?.enrollmentDate || data.student?.admissionDate || 'N/A'}
                              </span>
                            </div>

                            {/* Attendance KPI Summary Since Enrollment */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Date Enrolled</span>
                                <span className="text-xs font-bold text-slate-900 font-mono mt-0.5 block">
                                  {data.enrollmentHistory[0]?.enrollmentDate || data.student?.admissionDate || 'N/A'}
                                </span>
                              </div>
                              <div className="bg-white border border-emerald-200 rounded-xl p-3 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Present Since Enrollment</span>
                                <span className="text-base font-bold text-emerald-700 font-mono mt-0.5 block">
                                  {data.enrollmentHistory[0]?.daysPresent ?? data.attendanceSummary?.presentDays ?? 0} Times
                                </span>
                              </div>
                              <div className="bg-white border border-rose-200 rounded-xl p-3 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-rose-700 block tracking-wider">Absent Since Enrollment</span>
                                <span className="text-base font-bold text-rose-700 font-mono mt-0.5 block">
                                  {data.enrollmentHistory[0]?.daysAbsent ?? data.attendanceSummary?.absentDays ?? 0} Times
                                </span>
                              </div>
                              <div className="bg-white border border-indigo-200 rounded-xl p-3 text-center shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">Total Days Since Enrollment</span>
                                <span className="text-base font-bold text-indigo-700 font-mono mt-0.5 block">
                                  {data.enrollmentHistory[0]?.totalDaysSinceEnrollment || data.attendanceSummary?.totalDaysSinceAdmission || 0} Days
                                </span>
                              </div>
                            </div>

                            {/* Detailed Enrollment Table */}
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                                <span>Academic Session & Placement Progression</span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                  {data.enrollmentHistory.length} Recorded Term/Session(s)
                                </span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                      <th className="px-3.5 py-2.5">Academic Session</th>
                                      <th className="px-3.5 py-2.5">Class Placement</th>
                                      <th className="px-3.5 py-2.5">Date Enrolled</th>
                                      <th className="px-3.5 py-2.5 text-right">Present (Times)</th>
                                      <th className="px-3.5 py-2.5 text-right">Absent (Times)</th>
                                      <th className="px-3.5 py-2.5 text-right font-bold">Total Days</th>
                                      <th className="px-3.5 py-2.5 text-center">Attendance Rate</th>
                                      <th className="px-3.5 py-2.5">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {data.enrollmentHistory.map((h: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-3.5 py-2.5 font-medium text-slate-900">{h.sessionName}</td>
                                        <td className="px-3.5 py-2.5 font-semibold text-indigo-700">{h.className}</td>
                                        <td className="px-3.5 py-2.5 font-mono text-slate-700">{h.enrollmentDate || '—'}</td>
                                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-emerald-600">
                                          {h.daysPresent ?? 0}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-rose-600">
                                          {h.daysAbsent ?? 0}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono text-slate-800">
                                          {h.totalDaysSinceEnrollment ? `${h.totalDaysSinceEnrollment}d` : `${h.totalAttendanceDays || 0} sessions`}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-center">
                                          <span className="font-mono font-bold text-slate-800">
                                            {h.calculatedAttendanceRate ?? h.attendanceRate ?? 100}%
                                          </span>
                                        </td>
                                        <td className="px-3.5 py-2.5">
                                          <Badge variant={h.status === 'enrolled' || h.status === 'active' ? 'success' : 'info'}>
                                            {h.status}
                                          </Badge>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Linked Guardians Overview */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-purple-600" />
                            Linked Guardians ({data.guardians?.length || 0})
                          </h4>
                          {(!data.guardians || data.guardians.length === 0) ? (
                            <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400">
                              No guardians linked to this student record.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {data.guardians.map((g: any, idx: number) => (
                                <div
                                  key={idx}
                                  onClick={() => openParentProfile(g.id)}
                                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 hover:border-indigo-400 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                                        {g.fullName?.[0] || 'G'}
                                      </div>
                                      <div>
                                        <h5 className="text-xs font-bold text-slate-900">{g.fullName}</h5>
                                        <span className="text-[10px] text-slate-500 font-medium">{g.relationship || 'Guardian'}</span>
                                      </div>
                                    </div>
                                    {g.isPrimary && <Badge variant="info">Primary</Badge>}
                                  </div>
                                  <div className="text-xs space-y-1 pt-1 border-t border-slate-100 text-slate-600">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{g.email || 'No email'}</span>
                                    </div>
                                    {g.phone && (
                                      <div className="flex items-center gap-1.5">
                                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>{g.phone}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* TEACHER / STAFF VIEW: Full tabbed interface with Homework, Attendance, Results */
                      <div className="space-y-6">
                        {/* Tab Headers */}
                        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto pb-px bg-white px-4 pt-2 rounded-t-xl">
                          {[
                            { id: 'overview', label: 'Bio & Overview', icon: User },
                            { id: 'guardians', label: `Guardians (${data.guardians?.length || 0})`, icon: Shield },
                            { id: 'attendance', label: 'Attendance History', icon: Calendar },
                            { id: 'results', label: `Academic Results (${data.academicResults?.length || 0})`, icon: Award },
                            ...(isTeacher ? [{ id: 'homework', label: `Homework (${data.homeworkList?.length || 0})`, icon: BookOpen }] : []),
                            { id: 'enrollment', label: 'Enrollment History', icon: History },
                          ].map((tab) => {
                            const Icon = tab.icon;
                            const isTabActive = activeTab === tab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
                                  isTabActive
                                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Tab Contents */}
                        <div className="bg-white border border-slate-200 rounded-b-xl rounded-t-none p-5 sm:p-6 shadow-2xs space-y-6">
                          {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-indigo-600" />
                                  Personal & Academic Information
                                </h4>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Full Name:</span>
                                    <span className="font-semibold text-slate-900 text-right break-words min-w-0">{data.student?.firstName} {data.student?.lastName}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Student ID / Code:</span>
                                    <span className="font-mono font-semibold text-slate-800 text-right truncate">{data.student?.studentId}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Gender:</span>
                                    <span className="font-medium text-slate-800 text-right">{data.student?.gender || 'Not specified'}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Date of Birth:</span>
                                    <span className="font-medium text-slate-800 text-right">{data.student?.dateOfBirth || 'Not specified'}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Admission Date:</span>
                                    <span className="font-medium text-slate-800 text-right">{data.student?.admissionDate || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Class Placement:</span>
                                    <span className="font-semibold text-indigo-700 text-right truncate">{data.student?.className || 'Unassigned'}</span>
                                  </div>
                                  <div className="flex justify-between py-1.5 items-start gap-2 min-w-0">
                                    <span className="text-slate-500 shrink-0">Home Address:</span>
                                    <span className="font-medium text-slate-800 text-right break-words min-w-0">{data.student?.address || 'Residential Address on file'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50 min-w-0">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                                  Account & Emergency Contact
                                </h4>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Portal Account:</span>
                                    <span className="font-medium text-slate-800 text-right break-words min-w-0">
                                      {data.student?.hasAccount ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Registered ({data.student?.accountEmail || 'Active'})
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Pending Registration</span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Emergency Contact:</span>
                                    <span className="font-semibold text-slate-900 text-right break-words min-w-0">{data.student?.emergencyContact || 'None listed'}</span>
                                  </div>
                                  <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-200/60 min-w-0">
                                    <span className="text-slate-500 shrink-0">Primary Guardian:</span>
                                    <span className="font-semibold text-slate-800 text-right break-words min-w-0">
                                      {data.guardians?.[0]?.fullName || 'No Guardian Linked'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 py-1.5 min-w-0">
                                    <span className="text-slate-500 shrink-0">Current Session:</span>
                                    <span className="font-medium text-slate-800 text-right truncate min-w-0">{data.student?.sessionName || 'Academic Session'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {activeTab === 'guardians' && (
                            <div className="space-y-3">
                              {(!data.guardians || data.guardians.length === 0) ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                                  <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <p className="text-xs text-slate-500">No guardians are linked to this student record.</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {data.guardians.map((g: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 hover:border-indigo-300 transition-colors cursor-pointer"
                                      onClick={() => openParentProfile(g.id)}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                                            {g.fullName?.[0] || 'G'}
                                          </div>
                                          <div>
                                            <h5 className="text-xs font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                                              {g.fullName}
                                            </h5>
                                            <span className="text-[10px] text-slate-500 font-medium">{g.relationship || 'Guardian'}</span>
                                          </div>
                                        </div>
                                        {g.isPrimary && <Badge variant="info">Primary</Badge>}
                                      </div>
                                      <div className="text-xs space-y-1 pt-1 border-t border-slate-100">
                                        <div className="flex items-center gap-1.5 text-slate-600">
                                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span className="truncate">{g.email || 'No email provided'}</span>
                                        </div>
                                        {g.phone && (
                                          <div className="flex items-center gap-1.5 text-slate-600">
                                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                            <span>{g.phone}</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-indigo-600 font-medium flex items-center gap-1 pt-1">
                                        View Guardian Profile <ChevronRight className="w-3 h-3" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {activeTab === 'attendance' && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Days</span>
                                  <span className="text-base font-bold text-slate-900">{data.attendanceSummary?.totalDays || 0}</span>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Present</span>
                                  <span className="text-base font-bold text-emerald-700">{data.attendanceSummary?.presentDays || 0}</span>
                                </div>
                                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center">
                                  <span className="text-[10px] font-bold text-rose-700 uppercase block">Absent</span>
                                  <span className="text-base font-bold text-rose-700">{data.attendanceSummary?.absentDays || 0}</span>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                  <span className="text-[10px] font-bold text-amber-700 uppercase block">Late</span>
                                  <span className="text-base font-bold text-amber-700">{data.attendanceSummary?.lateDays || 0}</span>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Rate</span>
                                  <span className="text-base font-bold text-indigo-700">{data.attendanceSummary?.attendancePercentage ?? 100}%</span>
                                </div>
                              </div>
                              <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700">
                                  Recent School Attendance Entries (Latest 15 Records)
                                </div>
                                {(!data.attendanceSummary?.recentLogs || data.attendanceSummary.recentLogs.length === 0) ? (
                                  <div className="p-6 text-center text-xs text-slate-400">No attendance records logged yet.</div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-100/60 text-slate-600 font-semibold">
                                        <tr>
                                          <th className="px-3.5 py-2">Date</th>
                                          <th className="px-3.5 py-2">Status</th>
                                          <th className="px-3.5 py-2">Punctuality</th>
                                          <th className="px-3.5 py-2">Remarks / Reason</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {data.attendanceSummary.recentLogs.map((log: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/80">
                                            <td className="px-3.5 py-2 font-mono font-medium text-slate-800">{log.date}</td>
                                            <td className="px-3.5 py-2">
                                              <Badge
                                                variant={
                                                  log.status === 'Present'
                                                    ? 'success'
                                                    : log.status === 'Absent'
                                                    ? 'danger'
                                                    : 'warning'
                                                }
                                              >
                                                {log.status}
                                              </Badge>
                                            </td>
                                            <td className="px-3.5 py-2">
                                              {log.isLate ? (
                                                <span className="text-amber-700 font-semibold flex items-center gap-1">
                                                  <Clock className="w-3 h-3" /> Late {log.arrivalTime ? `(${log.arrivalTime})` : ''}
                                                </span>
                                              ) : (
                                                <span className="text-slate-400">On Time</span>
                                              )}
                                            </td>
                                            <td className="px-3.5 py-2 text-slate-600">
                                              {log.lateReason || log.remarks || '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {activeTab === 'results' && (
                            <div className="space-y-3">
                              {(!data.academicResults || data.academicResults.length === 0) ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                                  <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <p className="text-xs text-slate-500">No published assessment results available for this student.</p>
                                </div>
                              ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="px-3.5 py-2.5">Subject</th>
                                          <th className="px-3.5 py-2.5">Assessment</th>
                                          <th className="px-3.5 py-2.5 text-right">CA (40)</th>
                                          <th className="px-3.5 py-2.5 text-right">Exam (60)</th>
                                          <th className="px-3.5 py-2.5 text-right font-bold">Total (100)</th>
                                          <th className="px-3.5 py-2.5 text-center">Grade</th>
                                          <th className="px-3.5 py-2.5">Remarks</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {data.academicResults.map((r: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/60">
                                            <td className="px-3.5 py-2 font-medium text-slate-900">
                                              <div className="font-semibold">{r.subjectName}</div>
                                              <div className="text-[10px] text-slate-400 font-mono">{r.subjectCode}</div>
                                            </td>
                                            <td className="px-3.5 py-2 text-slate-600">{r.assessmentType}</td>
                                            <td className="px-3.5 py-2 text-right font-mono text-slate-700">{r.testScore}</td>
                                            <td className="px-3.5 py-2 text-right font-mono text-slate-700">{r.examScore}</td>
                                            <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-900">{r.totalScore}</td>
                                            <td className="px-3.5 py-2 text-center">
                                              <Badge
                                                variant={
                                                  r.grade === 'A'
                                                    ? 'success'
                                                    : r.grade === 'B'
                                                    ? 'info'
                                                    : r.grade === 'C'
                                                    ? 'warning'
                                                    : 'danger'
                                                }
                                              >
                                                {r.grade}
                                              </Badge>
                                            </td>
                                            <td className="px-3.5 py-2 text-slate-500 italic">{r.remarks || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {isTeacher && activeTab === 'homework' && (
                            <div className="space-y-3">
                              {(!data.homeworkList || data.homeworkList.length === 0) ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <p className="text-xs text-slate-500">No active homework tasks assigned for this cohort.</p>
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  {data.homeworkList.map((hw: any, idx: number) => (
                                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-slate-900">{hw.title}</span>
                                          <Badge variant="neutral">{hw.subjectName}</Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{hw.description}</p>
                                        <span className="text-[10px] text-slate-400 mt-1 block">Due Date: {hw.dueDate}</span>
                                      </div>
                                      <div className="text-right shrink-0">
                                        {hw.submissionStatus ? (
                                          <div>
                                            <Badge variant={hw.submissionStatus === 'graded' ? 'success' : 'info'}>
                                              {hw.submissionStatus}
                                            </Badge>
                                            {hw.score !== null && (
                                              <div className="text-xs font-bold text-slate-800 font-mono mt-0.5">
                                                Score: {hw.score}/{hw.maxMarks}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <Badge variant="warning">Not Submitted</Badge>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {activeTab === 'enrollment' && (
                            <div className="space-y-4">
                              {(!data.enrollmentHistory || data.enrollmentHistory.length === 0) ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                                  <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <p className="text-xs text-slate-500">No prior multi-year enrollment history recorded.</p>
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Date Enrolled</span>
                                      <span className="text-xs font-bold text-slate-900 font-mono mt-0.5 block">
                                        {data.enrollmentHistory[0]?.enrollmentDate || data.student?.admissionDate || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                                      <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Present Since Enrollment</span>
                                      <span className="text-base font-bold text-emerald-700 font-mono mt-0.5 block">
                                        {data.enrollmentHistory[0]?.daysPresent ?? data.attendanceSummary?.presentDays ?? 0} Times
                                      </span>
                                    </div>
                                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                                      <span className="text-[10px] uppercase font-bold text-rose-700 block tracking-wider">Absent Since Enrollment</span>
                                      <span className="text-base font-bold text-rose-700 font-mono mt-0.5 block">
                                        {data.enrollmentHistory[0]?.daysAbsent ?? data.attendanceSummary?.absentDays ?? 0} Times
                                      </span>
                                    </div>
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                                      <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">Total Days Since Enrollment</span>
                                      <span className="text-base font-bold text-indigo-700 font-mono mt-0.5 block">
                                        {data.enrollmentHistory[0]?.totalDaysSinceEnrollment || data.attendanceSummary?.totalDaysSinceAdmission || 0} Days
                                      </span>
                                    </div>
                                  </div>

                                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="px-3.5 py-2.5">Academic Session</th>
                                          <th className="px-3.5 py-2.5">Class Placement</th>
                                          <th className="px-3.5 py-2.5">Date Enrolled</th>
                                          <th className="px-3.5 py-2.5 text-right">Present (Times)</th>
                                          <th className="px-3.5 py-2.5 text-right">Absent (Times)</th>
                                          <th className="px-3.5 py-2.5 text-right font-bold">Total Days</th>
                                          <th className="px-3.5 py-2.5 text-center">Attendance Rate</th>
                                          <th className="px-3.5 py-2.5">Status</th>
                                          <th className="px-3.5 py-2.5">Remarks</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {data.enrollmentHistory.map((h: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-3.5 py-2.5 font-medium text-slate-900">{h.sessionName}</td>
                                            <td className="px-3.5 py-2.5 font-semibold text-indigo-700">{h.className}</td>
                                            <td className="px-3.5 py-2.5 font-mono text-slate-700">{h.enrollmentDate || '—'}</td>
                                            <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-emerald-600">
                                              {h.daysPresent ?? 0}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-rose-600">
                                              {h.daysAbsent ?? 0}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono text-slate-800">
                                              {h.totalDaysSinceEnrollment ? `${h.totalDaysSinceEnrollment}d` : `${h.totalAttendanceDays || 0} sessions`}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-center">
                                              <span className="font-mono font-bold text-slate-800">
                                                {h.calculatedAttendanceRate ?? h.attendanceRate ?? 100}%
                                              </span>
                                            </td>
                                            <td className="px-3.5 py-2.5">
                                              <Badge variant={h.status === 'enrolled' || h.status === 'active' ? 'success' : 'info'}>
                                                {h.status}
                                              </Badge>
                                            </td>
                                            <td className="px-3.5 py-2.5 text-slate-500 italic">{h.remarks || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ========================================================================= */}
                {/* TEACHER FULL PAGE PROFILE */}
                {/* ========================================================================= */}
                {profileType === 'teacher' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-emerald-600 text-white font-bold text-2xl flex items-center justify-center shrink-0 shadow-xs">
                          {data.fullName?.[0] || 'T'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900">{data.fullName}</h2>
                            <Badge variant={data.status === 'active' ? 'success' : 'danger'}>
                              {data.status === 'active' ? 'Active Faculty' : 'Deactivated / Suspended'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold">
                              {data.employeeId}
                            </span>
                            <span>•</span>
                            <span className="font-medium text-slate-700">{data.specialization || 'General Faculty'}</span>
                            <span>•</span>
                            <span>{data.email}</span>
                          </div>
                        </div>
                      </div>
                      {data.phone && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Contact Phone</span>
                          <span className="font-semibold text-slate-800">{data.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      {data.headClasses && data.headClasses.length > 0 && (
                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5 space-y-3">
                          <h3 className="text-xs font-bold text-emerald-900 flex items-center gap-2 uppercase tracking-wide">
                            <Award className="w-4 h-4 text-emerald-700" />
                            Class Teacher Oversight Responsibility
                          </h3>
                          <div className="flex items-center gap-3 flex-wrap">
                            {data.headClasses.map((c: any, idx: number) => (
                              <div key={idx} className="bg-white border border-emerald-300 rounded-lg px-3.5 py-2 text-xs shadow-2xs">
                                <span className="font-bold text-emerald-800 text-sm">{c.name}</span>
                                {c.section && <span className="text-slate-500 ml-1.5">({c.section})</span>}
                                <span className="text-[10px] text-emerald-600 block mt-0.5">Designated Class Head & Register Overseer</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Delegated Admin Roles */}
                      {data.permissions && data.permissions.length > 0 && (
                        <div className="bg-purple-50/60 border border-purple-200/80 rounded-xl p-5 space-y-3">
                          <h3 className="text-xs font-bold text-purple-900 flex items-center gap-2 uppercase tracking-wide">
                            <ShieldCheck className="w-4 h-4 text-purple-700" />
                            Delegated Administrative Privileges & Access ({data.permissions.length})
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {data.permissions.map((pKey: string, idx: number) => (
                              <div key={idx} className="bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-xs shadow-2xs">
                                <span className="font-semibold text-purple-900 capitalize">{pKey.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] text-purple-600 block">Active Delegation</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                          <span>Assigned Teaching Roster & Syllabus Allocations</span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            {data.subjectAllocations?.length || 0} Subject Allocations
                          </span>
                        </div>
                        {(!data.subjectAllocations || data.subjectAllocations.length === 0) ? (
                          <div className="p-8 text-center text-xs text-slate-400">No active class-subject allocations assigned.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/60 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2.5">Class Cohort</th>
                                <th className="px-4 py-2.5">Subject</th>
                                <th className="px-4 py-2.5">Subject Code</th>
                                <th className="px-4 py-2.5 text-right">Periods / Week</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {data.subjectAllocations.map((alloc: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 font-semibold text-slate-900">
                                    {alloc.className} {alloc.section ? `(${alloc.section})` : ''}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-indigo-700">{alloc.subjectName}</td>
                                  <td className="px-4 py-3 font-mono text-slate-500">{alloc.subjectCode}</td>
                                  <td className="px-4 py-3 text-right font-bold text-slate-700">{alloc.periodsPerWeek}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs shadow-2xs">
                        <div>
                          <span className="text-slate-400 text-[11px] block font-medium uppercase tracking-wider">Academic Qualifications</span>
                          <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{data.qualification || 'B.Ed / M.Sc Professional Educator'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block font-medium uppercase tracking-wider">Appointment / Hire Date</span>
                          <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{data.hireDate || 'Active Faculty'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block font-medium uppercase tracking-wider">Residential Home Address</span>
                          <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{data.address || 'Faculty Residence on file'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================================= */}
                {/* PARENT FULL PAGE PROFILE */}
                {/* ========================================================================= */}
                {profileType === 'parent' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-purple-600 text-white font-bold text-2xl flex items-center justify-center shrink-0 shadow-xs">
                          {data.parent?.fullName?.[0] || 'P'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900">{data.parent?.fullName}</h2>
                            <Badge variant={data.parent?.status === 'active' ? 'success' : 'danger'}>
                              {data.parent?.status === 'active' ? 'Verified Guardian' : 'Deactivated'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span className="font-medium text-slate-700">{data.parent?.email}</span>
                            {data.parent?.phone && (
                              <>
                                <span>•</span>
                                <span className="font-semibold text-slate-800">{data.parent?.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xs space-y-4">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-indigo-600" />
                        Linked Children & Dependents ({data.children?.length || 0})
                      </h3>
                      {(!data.children || data.children.length === 0) ? (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400">
                          No children currently linked to this guardian record.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {data.children.map((ch: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 hover:border-indigo-400 hover:shadow-xs transition-all cursor-pointer"
                              onClick={() => openStudentProfile(ch.studentId)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                                    {ch.firstName?.[0]}{ch.lastName?.[0]}
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                                      {ch.firstName} {ch.lastName}
                                    </h5>
                                    <span className="text-[11px] text-slate-500 font-mono font-medium">{ch.studentCode}</span>
                                  </div>
                                </div>
                                {ch.isPrimary && <Badge variant="info">Primary Ward</Badge>}
                              </div>
                              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                                <span className="text-slate-500 font-medium">{ch.relationship || 'Child'}</span>
                                <span className="font-semibold text-indigo-700">{ch.className || 'Class Placement'}</span>
                              </div>
                              <div className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 pt-1">
                                Open Student Record <ChevronRight className="w-3 h-3" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </ProfileModalContext.Provider>
  );
};

export const useProfileModal = () => {
  const context = useContext(ProfileModalContext);
  if (!context) {
    throw new Error('useProfileModal must be used within a ProfileModalProvider');
  }
  return context;
};

/**
 * Reusable clickable Name Component for Students, Teachers, and Parents
 */
interface NameLinkProps {
  name: string;
  type: 'student' | 'teacher' | 'parent';
  id?: number | string;
  className?: string;
  badge?: React.ReactNode;
  subtitle?: string;
  showAvatar?: boolean;
}

export const NameLink: React.FC<NameLinkProps> = ({
  name,
  type,
  id,
  className = '',
  badge,
  subtitle,
  showAvatar = false,
}) => {
  const { openStudentProfile, openTeacherProfile, openParentProfile, canViewProfiles } = useProfileModal();
  const { user } = useAuth();

  if (!id) {
    return <span className={className}>{name}</span>;
  }

  const isClickable = canViewProfiles || (user?.role === 'parent' && type === 'student');

  const handleClick = (e: React.MouseEvent) => {
    if (!isClickable) return;
    e.stopPropagation();
    if (type === 'student') openStudentProfile(id);
    else if (type === 'teacher') openTeacherProfile(id);
    else if (type === 'parent') openParentProfile(id);
  };

  if (!isClickable) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {showAvatar && (
          <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
            {name?.[0] || 'U'}
          </div>
        )}
        <div>
          <span className="font-medium text-slate-900">{name}</span>
          {subtitle && <span className="text-[10px] text-slate-400 block">{subtitle}</span>}
        </div>
        {badge}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group inline-flex items-center gap-2 text-left cursor-pointer transition-colors ${className}`}
      title={`Click to view full ${type} profile`}
    >
      {showAvatar && (
        <div
          className={`w-6 h-6 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
            type === 'student'
              ? 'bg-indigo-100 text-indigo-700'
              : type === 'teacher'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-purple-100 text-purple-700'
          }`}
        >
          {name?.[0] || 'U'}
        </div>
      )}
      <div className="min-w-0">
        <span className="font-semibold text-slate-900 group-hover:text-indigo-600 group-hover:underline decoration-indigo-400 underline-offset-2 transition-colors">
          {name}
        </span>
        {subtitle && <span className="text-[10px] text-slate-500 block truncate">{subtitle}</span>}
      </div>
      {badge}
    </button>
  );
};
