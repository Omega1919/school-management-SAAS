import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Calendar,
  Save,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Check,
  AlertTriangle,
  UserCheck,
  ChevronRight,
  Info,
  Lock,
  Edit3,
  User,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { ClassItem, AttendanceRecord, ClassAttendanceStatus } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Badge, getStatusBadge } from '../components/Badge.tsx';
import { NameLink, useProfileModal } from '../context/ProfileModalContext.tsx';

interface RollCallEntry {
  studentId: number;
  studentName: string;
  studentCode: string;
  status: 'Present' | 'Absent' | 'Excused';
  isLate: boolean;
  arrivalTime: string;
  lateReason: string;
  lateApproved: boolean;
  remarks: string;
  attendanceId?: number;
}

interface AttendanceWindowInfo {
  startTime: string;
  cutoffTime: string;
  policy: string;
  currentTime: string;
  isWindowActive: boolean;
}

export const AttendanceView: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.permissions?.includes('attendance_management');
  const isTeacher = user?.role === 'teacher';
  const isStaff = isSuperAdmin || isTeacher;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [activeTab, setActiveTab] = useState<'rollcall' | 'classes-status' | 'history'>('rollcall');

  const [rollCallEntries, setRollCallEntries] = useState<RollCallEntry[]>([]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [classStatuses, setClassStatuses] = useState<ClassAttendanceStatus[]>([]);
  const [windowInfo, setWindowInfo] = useState<AttendanceWindowInfo | null>(null);
  const [currentClassDetail, setCurrentClassDetail] = useState<any>(null);
  const [isClassSubmitted, setIsClassSubmitted] = useState<boolean>(false);
  const [submissionMeta, setSubmissionMeta] = useState<{ submittedAt?: string; submittedByName?: string } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState<boolean>(false);

  // Helper functions for 24h <input type="time"> time picker compatibility
  const ensureTime24h = (timeStr: string | null | undefined): string => {
    if (!timeStr) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    const trimmed = timeStr.trim();
    const hhmmMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)/);
    if (hhmmMatch) {
      let hours = parseInt(hhmmMatch[1], 10);
      const minutes = hhmmMatch[2];
      const isPM = trimmed.toLowerCase().includes('pm');
      const isAM = trimmed.toLowerCase().includes('am');
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // Late Arrival Modal state
  const [lateModalStudent, setLateModalStudent] = useState<RollCallEntry | null>(null);
  const [lateArrivalTime, setLateArrivalTime] = useState<string>('');
  const [lateReason, setLateReason] = useState<string>('');
  const [lateApproved, setLateApproved] = useState<boolean>(true);
  const [lateSubmitting, setLateSubmitting] = useState<boolean>(false);

  // Correction Modal state
  const [correctionEntry, setCorrectionEntry] = useState<RollCallEntry | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<'Present' | 'Absent' | 'Excused'>('Present');
  const [correctionIsLate, setCorrectionIsLate] = useState<boolean>(false);
  const [correctionArrivalTime, setCorrectionArrivalTime] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState<boolean>(false);

  // Load classes and window info on mount
  useEffect(() => {
    apiRequest<ClassItem[]>('/classes')
      .then((data) => {
        setClasses(data);
        if (data.length > 0 && !selectedClassId) {
          setSelectedClassId(data[0].id.toString());
        }
      })
      .catch((err) => console.error('Failed to load classes', err));

    apiRequest<AttendanceWindowInfo>('/attendance/window')
      .then((info) => setWindowInfo(info))
      .catch((err) => console.error('Failed to load window info', err));
  }, []);

  // When class or date changes, load roll call roster
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id.toString());
      return;
    }
    if (!selectedClassId) return;

    if (activeTab === 'rollcall') {
      loadRoster();
    } else if (activeTab === 'classes-status') {
      loadClassStatuses();
    } else {
      loadHistory();
    }
  }, [selectedClassId, selectedDate, activeTab]);

  const loadRoster = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      // Fetch class detail
      const classDetail = await apiRequest(`/classes/${selectedClassId}`);
      setCurrentClassDetail(classDetail);
      const students = classDetail.students || [];

      // Fetch class status for this date to know submission state
      const statuses = await apiRequest<ClassAttendanceStatus[]>(
        `/attendance/class-status?date=${selectedDate}`
      );
      setClassStatuses(statuses);
      const matchedStatus = statuses.find((s) => s.classId.toString() === selectedClassId.toString());
      if (matchedStatus && matchedStatus.isSubmitted) {
        setIsClassSubmitted(true);
        setSubmissionMeta({
          submittedAt: matchedStatus.submittedAt || undefined,
          submittedByName: matchedStatus.submittedByName || undefined,
        });
      } else {
        setIsClassSubmitted(false);
        setSubmissionMeta(null);
      }

      // Fetch any existing attendance for this class and date
      const existingAttendance = await apiRequest<AttendanceRecord[]>(
        `/attendance?classId=${selectedClassId}&date=${selectedDate}`
      );
      const existingMap = new Map(existingAttendance.map((a) => [a.studentId, a]));

      // Build roster
      const entries: RollCallEntry[] = students.map((s: any) => {
        const existing = existingMap.get(s.id);
        return {
          studentId: s.id,
          studentName: `${s.firstName} ${s.lastName}`,
          studentCode: s.studentId,
          status: existing ? existing.status : 'Present',
          isLate: Boolean(existing?.isLate),
          arrivalTime: existing?.arrivalTime || '08:35 AM',
          lateReason: existing?.lateReason || '',
          lateApproved: existing?.lateApproved ?? true,
          remarks: existing?.remarks || '',
          attendanceId: existing?.id,
        };
      });

      setRollCallEntries(entries);
    } catch (err: any) {
      console.error('Failed to load attendance roster:', err);
      setErrorMessage(err.message || 'Failed to load attendance roster');
    } finally {
      setLoading(false);
    }
  };

  const loadClassStatuses = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<ClassAttendanceStatus[]>(
        `/attendance/class-status?date=${selectedDate}`
      );
      setClassStatuses(data);
    } catch (err: any) {
      console.error('Failed to load class statuses', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const url = selectedClassId
        ? `/attendance?classId=${selectedClassId}`
        : '/attendance';
      const records = await apiRequest<AttendanceRecord[]>(url);
      setHistoryRecords(records);
    } catch (err: any) {
      console.error('Failed to load attendance history', err);
    } finally {
      setLoading(false);
    }
  };

  // Determine user permissions for currently selected class
  const selectedClassObj = classes.find((c) => c.id.toString() === selectedClassId);
  const classInfo = currentClassDetail?.class || currentClassDetail;
  const isClassTeacherForCurrentClass =
    isSuperAdmin ||
    Boolean(classInfo?.isClassTeacher ?? selectedClassObj?.isClassTeacher);
  const isAttendanceRecorderForCurrentClass =
    isSuperAdmin ||
    Boolean(classInfo?.isAttendanceRecorder ?? selectedClassObj?.isAttendanceRecorder);
  const canRecordDailyAttendance =
    isSuperAdmin ||
    isClassTeacherForCurrentClass ||
    isAttendanceRecorderForCurrentClass ||
    Boolean(classInfo?.canRecordAttendance ?? selectedClassObj?.canRecordAttendance);

  const canEditRegister = canRecordDailyAttendance && (!isClassSubmitted || isSuperAdmin || isClassTeacherForCurrentClass);
  const classTeacherDisplayName = classInfo?.classTeacherName || selectedClassObj?.classTeacherName || 'Unassigned';
  const attendanceRecorderDisplayName = classInfo?.attendanceRecorderName || selectedClassObj?.attendanceRecorderName || classTeacherDisplayName;

  const handleStatusChange = (studentId: number, status: RollCallEntry['status']) => {
    if (!canRecordDailyAttendance) {
      setErrorMessage('View-Only Mode: Only the Class Teacher or designated Attendance Recorder can record attendance.');
      return;
    }
    if (!canEditRegister) {
      setErrorMessage('This register is submitted. Only the Class Teacher or Administrator can record changes.');
      return;
    }
    setErrorMessage(null);
    setRollCallEntries((prev) =>
      prev.map((e) =>
        e.studentId === studentId
          ? {
              ...e,
              status,
              isLate: status === 'Present' ? e.isLate : false,
            }
          : e
      )
    );
  };

  const handleToggleLate = (studentId: number) => {
    if (!canRecordDailyAttendance) {
      setErrorMessage('View-Only Mode: Only the Class Teacher or designated Attendance Recorder can record attendance.');
      return;
    }
    if (!canEditRegister) {
      setErrorMessage('This register is submitted. Only the Class Teacher or Administrator can record changes.');
      return;
    }
    setErrorMessage(null);
    setRollCallEntries((prev) =>
      prev.map((e) => {
        if (e.studentId === studentId) {
          const nextLate = !e.isLate;
          const now = new Date();
          const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          return {
            ...e,
            isLate: nextLate,
            status: 'Present',
            arrivalTime: nextLate ? ensureTime24h(e.arrivalTime || defaultTime) : '',
          };
        }
        return e;
      })
    );
  };

  const handleRemarksChange = (studentId: number, remarks: string) => {
    if (!canEditRegister) return;
    setRollCallEntries((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, remarks } : e))
    );
  };

  const markAllPresent = () => {
    if (!canRecordDailyAttendance) {
      setErrorMessage('View-Only Mode: Only the Class Teacher or designated Attendance Recorder can record attendance.');
      return;
    }
    if (!canEditRegister) {
      setErrorMessage('This register is submitted. Only the Class Teacher or Administrator can record changes.');
      return;
    }
    setErrorMessage(null);
    setRollCallEntries((prev) =>
      prev.map((e) => ({
        ...e,
        status: 'Present',
        isLate: false,
      }))
    );
  };

  const handleSaveAttendance = async (submitClass = false) => {
    try {
      setSaving(true);
      setErrorMessage(null);
      await apiRequest('/attendance/batch', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          date: selectedDate,
          submitClass,
          entries: rollCallEntries.map((e) => ({
            studentId: e.studentId,
            status: e.status,
            isLate: e.isLate,
            arrivalTime: e.isLate ? e.arrivalTime : null,
            lateReason: e.lateReason || null,
            lateApproved: e.lateApproved,
            remarks: e.remarks || null,
          })),
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadRoster();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const openLateArrivalModal = (entry: RollCallEntry) => {
    setLateModalStudent(entry);
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    setLateArrivalTime(`${hours}:${mins}`);
    setLateReason(entry.lateReason || '');
    setLateApproved(true);
  };

  const handleLateArrivalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lateModalStudent) return;
    try {
      setLateSubmitting(true);
      await apiRequest('/attendance/late-arrival', {
        method: 'POST',
        body: JSON.stringify({
          studentId: lateModalStudent.studentId,
          classId: selectedClassId,
          date: selectedDate,
          arrivalTime: lateArrivalTime,
          lateReason,
          lateApproved,
        }),
      });
      setLateModalStudent(null);
      await loadRoster();
    } catch (err: any) {
      alert(err.message || 'Failed to record late arrival');
    } finally {
      setLateSubmitting(false);
    }
  };

  const openCorrectionModal = (entry: RollCallEntry) => {
    setCorrectionEntry(entry);
    setCorrectionStatus(entry.status);
    setCorrectionIsLate(entry.isLate);
    setCorrectionArrivalTime(entry.arrivalTime || '08:35 AM');
    setCorrectionReason('');
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionEntry || !correctionEntry.attendanceId) {
      alert('This student does not have an existing saved attendance record to correct.');
      return;
    }
    if (!correctionReason.trim()) {
      alert('A justification reason is mandatory for the audit log.');
      return;
    }
    try {
      setCorrectionSubmitting(true);
      await apiRequest(`/attendance/${correctionEntry.attendanceId}/correct`, {
        method: 'POST',
        body: JSON.stringify({
          status: correctionStatus,
          isLate: correctionIsLate,
          arrivalTime: correctionIsLate ? correctionArrivalTime : null,
          reason: correctionReason.trim(),
        }),
      });
      setCorrectionEntry(null);
      await loadRoster();
    } catch (err: any) {
      alert(err.message || 'Failed to submit correction');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const presentCount = rollCallEntries.filter((e) => e.status === 'Present').length;
  const absentCount = rollCallEntries.filter((e) => e.status === 'Absent').length;
  const excusedCount = rollCallEntries.filter((e) => e.status === 'Excused').length;
  const lateCount = rollCallEntries.filter((e) => e.isLate).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">School Attendance Register</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Daily school attendance workflow with Class Teacher oversight, designated Attendance Recorders, and punctuality tracking.
          </p>
        </div>
        {/* Tab switch */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium self-start">
          <button
            id="tab-rollcall"
            onClick={() => setActiveTab('rollcall')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'rollcall'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Daily Register</span>
          </button>
          <button
            id="tab-classes-status"
            onClick={() => setActiveTab('classes-status')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'classes-status'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Classes Overview</span>
          </button>
          <button
            id="tab-history"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>
      </div>

      {/* Attendance Window & Staff Assignment Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-4 sm:p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                School Attendance Window
              </span>
              {windowInfo && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    windowInfo.isWindowActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${windowInfo.isWindowActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {windowInfo.isWindowActive ? 'Window Active' : 'Outside Window'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
              <span>Standard Hours: <strong className="text-white">{windowInfo?.startTime || '07:30'} AM – {windowInfo?.cutoffTime || '08:30'} AM</strong></span>
              <span>•</span>
              <span>Current Time: <strong className="text-white">{windowInfo?.currentTime || '08:00'}</strong></span>
              <span>•</span>
              <span className="text-indigo-200">Policy: Late arrivals are marked <strong>PRESENT</strong> with verified arrival time</span>
            </div>
          </div>
          {currentClassDetail && (
            <div className="flex flex-wrap items-center gap-3 bg-white/10 rounded-lg p-2.5 text-xs border border-white/10">
              <div>
                <span className="text-[10px] uppercase text-indigo-200 block font-semibold">Class Teacher</span>
                <span className="font-medium text-white">{classTeacherDisplayName}</span>
              </div>
              <div className="h-6 w-px bg-white/20" />
              <div>
                <span className="text-[10px] uppercase text-indigo-200 block font-semibold">Attendance Recorder</span>
                <span className="font-medium text-white">{attendanceRecorderDisplayName}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View-Only Mode Banner for unauthorized subject teachers */}
      {activeTab === 'rollcall' && !canRecordDailyAttendance && isTeacher && (
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-700 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="font-bold text-slate-800">View-Only Register Access</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                You are viewing this class register as a subject teacher. Daily attendance recording and late arrivals are managed by the Class Teacher ({classTeacherDisplayName}) or designated Attendance Recorder ({attendanceRecorderDisplayName}).
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700 shrink-0">
            Subject Teacher Mode
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* FILTER & ROLL-CALL ACTION TOOLBAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Selectors & Session Info */}
        <div className="flex flex-wrap items-end gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="w-full sm:w-auto min-w-0 flex-1 sm:flex-initial sm:max-w-xs">
            <label htmlFor="attendance-class-select" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Class
            </label>
            <select
              id="attendance-class-select"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer min-h-[40px] truncate"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.name} {c.classTeacherName ? `(${c.classTeacherName})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto shrink-0">
            <label htmlFor="attendance-date-input" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Attendance Date
            </label>
            <input
              id="attendance-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer min-h-[40px]"
            />
          </div>

          {/* Academic Session / Term Badge */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-900 border border-purple-200 rounded-xl text-xs font-semibold shrink-0 min-h-[40px]">
            <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="truncate max-w-[160px] sm:max-w-none">
              {currentClassDetail?.sessionName || '2025/2026 Academic Session'}
            </span>
          </div>

          {/* Submission status badge */}
          {activeTab === 'rollcall' && (
            <div className="shrink-0">
              {isClassSubmitted ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold min-h-[40px]">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Submitted {submissionMeta?.submittedByName ? `by ${submissionMeta.submittedByName}` : ''}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold min-h-[40px]">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pending Daily Submission</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* FAST ATTENDANCE CONTROLS */}
        {activeTab === 'rollcall' && isStaff && (
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
            {!canRecordDailyAttendance ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>View-Only Mode (Subject Teacher)</span>
              </span>
            ) : canEditRegister ? (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  id="btn-mark-all-present"
                  onClick={markAllPresent}
                  type="button"
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer min-h-[40px]"
                  title="Mark all students present in one click. Then easily change the few exceptions."
                >
                  <Check className="w-4 h-4" />
                  <span>MARK ALL PRESENT</span>
                </button>
                <button
                  id="save-attendance-btn"
                  onClick={() => handleSaveAttendance(false)}
                  disabled={saving || rollCallEntries.length === 0}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[40px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <button
                  id="submit-register-btn"
                  onClick={() => setShowSubmitConfirmModal(true)}
                  disabled={saving || rollCallEntries.length === 0}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-500/20 transition-all cursor-pointer min-h-[40px]"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Submitted!</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Submit Register</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 italic flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Register submitted. Corrections require Class Teacher or Admin authorization.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QUICK SUMMARY COUNTERS */}
      {activeTab === 'rollcall' && rollCallEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Students</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{rollCallEntries.length}</div>
          </div>
          <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/80 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Present</div>
            <div className="text-xl font-black text-emerald-800 mt-0.5">{presentCount}</div>
          </div>
          <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/80 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Late Arrivals</div>
            <div className="text-xl font-black text-amber-800 mt-0.5">{lateCount}</div>
            <div className="text-[10px] text-amber-600 font-medium">Counted as Present</div>
          </div>
          <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200/80 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Absent</div>
            <div className="text-xl font-black text-rose-800 mt-0.5">{absentCount}</div>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200/80 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Excused Absence</div>
            <div className="text-xl font-black text-blue-800 mt-0.5">{excusedCount}</div>
          </div>
        </div>
      )}

      {/* TAB 1: DAILY ROLL-CALL ROSTER */}
      {activeTab === 'rollcall' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Student Name & ID</th>
                  <th className="px-5 py-3.5">Attendance Status</th>
                  <th className="px-5 py-3.5">Punctuality / Lateness</th>
                  <th className="px-5 py-3.5">Teacher Remarks</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Loading class roll-call roster...
                    </td>
                  </tr>
                ) : rollCallEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No enrolled students found in this class.
                    </td>
                  </tr>
                ) : (
                  rollCallEntries.map((entry) => (
                    <tr key={entry.studentId} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <NameLink
                          name={entry.studentName}
                          type="student"
                          id={entry.studentId}
                          subtitle={entry.studentCode}
                          showAvatar
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        {isStaff && canEditRegister ? (
                          <div className="flex items-center gap-1.5">
                            {(['Present', 'Absent', 'Excused'] as const).map((st) => {
                              const isSelected = entry.status === st;
                              const colors = {
                                Present: isSelected
                                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
                                Absent: isSelected
                                  ? 'bg-rose-600 text-white font-bold shadow-2xs'
                                  : 'text-rose-700 bg-rose-50 hover:bg-rose-100',
                                Excused: isSelected
                                  ? 'bg-blue-600 text-white font-bold shadow-2xs'
                                  : 'text-blue-700 bg-blue-50 hover:bg-blue-100',
                              }[st];
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleStatusChange(entry.studentId, st)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[34px] flex items-center justify-center ${colors}`}
                                >
                                  {st === 'Excused' ? 'Excused Absence' : st}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {getStatusBadge(entry.status)}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {entry.status === 'Present' ? (
                          <div className="flex items-center gap-2">
                            {isStaff && canEditRegister ? (
                              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={entry.isLate}
                                  onChange={() => handleToggleLate(entry.studentId)}
                                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                                />
                                <span className={entry.isLate ? 'text-amber-800 font-bold' : 'text-slate-500'}>
                                  Late Arrival
                                </span>
                              </label>
                            ) : entry.isLate ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Late ({entry.arrivalTime || 'Verified'})</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">On time</span>
                            )}
                            {entry.isLate && isStaff && canEditRegister && (
                              <input
                                type="time"
                                value={ensureTime24h(entry.arrivalTime)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRollCallEntries((prev) =>
                                    prev.map((it) => (it.studentId === entry.studentId ? { ...it, arrivalTime: val } : it))
                                  );
                                }}
                                className="w-24 px-2 py-0.5 text-xs bg-amber-50 border border-amber-200 rounded text-amber-900 font-semibold focus:outline-hidden cursor-pointer"
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">N/A (Student not in school)</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {isStaff && canEditRegister ? (
                          <input
                            type="text"
                            placeholder="Optional note / reason..."
                            value={entry.remarks}
                            onChange={(e) => handleRemarksChange(entry.studentId, e.target.value)}
                            className="w-full max-w-xs px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-hidden focus:border-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-500">{entry.remarks || '—'}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isStaff && canRecordDailyAttendance && (
                            <button
                              type="button"
                              onClick={() => openLateArrivalModal(entry)}
                              className="px-2 py-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition-colors cursor-pointer"
                              title="Record a late arrival report for this student"
                            >
                              Late Arrival
                            </button>
                          )}
                          {(isSuperAdmin || isClassTeacherForCurrentClass) && entry.attendanceId && isClassSubmitted && (
                            <button
                              type="button"
                              onClick={() => openCorrectionModal(entry)}
                              className="px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Make an authorized correction with an audit justification"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Correct</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CLASSES OVERVIEW & SUBMISSION TRACKER */}
      {activeTab === 'classes-status' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Classes Attendance Status for {selectedDate}</h3>
            <p className="text-xs text-slate-500 mb-4">
              Real-time monitoring of which classes have submitted daily registers, assigned Class Teachers, and attendance tallies.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="p-3">Class</th>
                    <th className="p-3">Class Teacher</th>
                    <th className="p-3">Attendance Recorder</th>
                    <th className="p-3 text-center">Submission Status</th>
                    <th className="p-3 text-center">Enrolled</th>
                    <th className="p-3 text-center">Present</th>
                    <th className="p-3 text-center">Late</th>
                    <th className="p-3 text-center">Absent</th>
                    <th className="p-3 text-center">Excused</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Loading class statuses...
                      </td>
                    </tr>
                  ) : classStatuses.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No active classes found.
                      </td>
                    </tr>
                  ) : (
                    classStatuses.map((cls) => (
                      <tr key={cls.classId} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-900">{cls.className}</td>
                        <td className="p-3 text-slate-700">
                          {cls.classTeacherName ? (
                            <span className="font-medium">{cls.classTeacherName}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">
                          {cls.attendanceRecorderName ? (
                            <span className="font-medium text-indigo-700">{cls.attendanceRecorderName}</span>
                          ) : cls.classTeacherName ? (
                            <span className="text-slate-600">{cls.classTeacherName} (Default)</span>
                          ) : (
                            <span className="text-slate-400 italic">Authorized Staff</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {cls.isSubmitted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Submitted</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Pending</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-semibold text-slate-700">{cls.totalEnrolled}</td>
                        <td className="p-3 text-center font-bold text-emerald-700">{cls.presentCount}</td>
                        <td className="p-3 text-center font-bold text-amber-700">{cls.lateCount}</td>
                        <td className="p-3 text-center font-bold text-rose-700">{cls.absentCount}</td>
                        <td className="p-3 text-center font-bold text-blue-700">{cls.excusedCount}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedClassId(cls.classId.toString());
                              setActiveTab('rollcall');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                          >
                            Open Register →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE HISTORY & AUDIT LOGS */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Daily Attendance</th>
                  <th className="px-4 py-3">Punctuality (Lateness)</th>
                  <th className="px-5 py-3">Remarks / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Loading attendance records...
                    </td>
                  </tr>
                ) : historyRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No attendance records found for this selection.
                    </td>
                  </tr>
                ) : (
                  historyRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {rec.date}
                      </td>
                      <td className="px-5 py-3">
                        <NameLink
                          name={rec.studentName}
                          type="student"
                          id={rec.studentId}
                          subtitle={rec.studentCode}
                          showAvatar
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{rec.className}</td>
                      <td className="px-4 py-3">{getStatusBadge(rec.status)}</td>
                      <td className="px-4 py-3">
                        {rec.isLate ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Late ({rec.arrivalTime || 'Recorded'})</span>
                          </span>
                        ) : rec.status === 'Present' ? (
                          <span className="text-slate-500 font-medium">On time</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {rec.lateReason ? (
                          <span>
                            <strong className="text-amber-900">Late:</strong> {rec.lateReason}
                          </span>
                        ) : (
                          rec.remarks || '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LATE ARRIVAL WORKFLOW MODAL */}
      {lateModalStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-sm">Record Student Late Arrival</h3>
              </div>
              <button
                onClick={() => setLateModalStudent(null)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLateArrivalSubmit} className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-900">{lateModalStudent.studentName}</div>
                <div className="text-slate-500 text-[11px]">ID: {lateModalStudent.studentCode} • Date: {selectedDate}</div>
                <div className="text-emerald-700 text-[11px] font-semibold mt-1">
                  ✓ Attendance will be updated to PRESENT (with Late Arrival verified)
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Actual Arrival Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={ensureTime24h(lateArrivalTime)}
                  onChange={(e) => setLateArrivalTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Lateness (Optional)
                </label>
                <input
                  type="text"
                  value={lateReason}
                  onChange={(e) => setLateReason(e.target.value)}
                  placeholder="e.g. Heavy traffic, medical appointment, transport delay"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="late-approved-check"
                  checked={lateApproved}
                  onChange={(e) => setLateApproved(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                <label htmlFor="late-approved-check" className="font-medium text-slate-700 cursor-pointer">
                  Late arrival authorized / excused by school staff
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLateModalStudent(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lateSubmitting}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  {lateSubmitting ? 'Recording...' : 'Confirm Late Arrival'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUTHORIZED CORRECTION WORKFLOW MODAL */}
      {correctionEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Authorized Attendance Correction</h3>
              </div>
              <button
                onClick={() => setCorrectionEntry(null)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCorrectionSubmit} className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-900">{correctionEntry.studentName}</div>
                <div className="text-slate-500 text-[11px]">ID: {correctionEntry.studentCode} • Date: {selectedDate}</div>
                <div className="text-slate-600 text-[11px] mt-1">
                  Current Status: <strong>{correctionEntry.status}</strong> {correctionEntry.isLate ? `(Late at ${correctionEntry.arrivalTime})` : ''}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Corrected Attendance Status <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {(['Present', 'Absent', 'Excused'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCorrectionStatus(st)}
                      className={`flex-1 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                        correctionStatus === st
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {correctionStatus === 'Present' && (
                <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/60 space-y-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={correctionIsLate}
                      onChange={(e) => setCorrectionIsLate(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300"
                    />
                    <span>Flag as Late Arrival</span>
                  </label>
                  {correctionIsLate && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Arrival Time</label>
                      <input
                        type="time"
                        value={ensureTime24h(correctionArrivalTime)}
                        onChange={(e) => setCorrectionArrivalTime(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-amber-200 rounded font-semibold cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Audit Justification Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Required audit trail explanation for why this submitted record is being modified (e.g. Student reported to dispensary with authorized pass)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCorrectionEntry(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionSubmitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  {correctionSubmitting ? 'Saving Correction...' : 'Submit Official Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBMIT REGISTER CONFIRMATION MODAL */}
      {showSubmitConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Submit Class Attendance Register</h3>
              </div>
              <button
                onClick={() => setShowSubmitConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-indigo-950 space-y-1">
                <div className="font-bold text-sm">Class: {selectedClassObj?.name || 'Selected Class'}</div>
                <div className="text-indigo-700 font-medium">Date: {selectedDate}</div>
                <div className="text-[11px] text-indigo-800/80 pt-1">
                  Class Teacher: <strong>{classTeacherDisplayName}</strong>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Total</div>
                  <div className="font-extrabold text-slate-800 text-sm mt-0.5">{rollCallEntries.length}</div>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-[10px] text-emerald-700 font-bold uppercase">Present</div>
                  <div className="font-extrabold text-emerald-700 text-sm mt-0.5">{presentCount}</div>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-bold uppercase">Late</div>
                  <div className="font-extrabold text-amber-700 text-sm mt-0.5">{lateCount}</div>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg border border-rose-200">
                  <div className="text-[10px] text-rose-700 font-bold uppercase">Absent</div>
                  <div className="font-extrabold text-rose-700 text-sm mt-0.5">{absentCount}</div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                <strong className="block font-bold mb-0.5">Note on Official Submission:</strong>
                Submitting this register officially locks daily attendance entries for this date. Normal subject teachers will not be able to modify records after submission. Any future modifications will require Class Teacher or Administrator authorized correction with an audit reason.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirmModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setShowSubmitConfirmModal(false);
                    await handleSaveAttendance(true);
                  }}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{saving ? 'Submitting...' : 'Confirm & Submit Register'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
