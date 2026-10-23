import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  BookOpen,
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  Printer,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  Calendar,
  Settings,
  Sliders,
  Check,
  Sparkles,
  Coffee,
  Utensils,
  Users,
  Info,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Badge } from '../components/Badge.tsx';

export interface TimetableSlot {
  id: number;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  subjectCategory: string;
  teacherId: number;
  teacherName: string;
  teacherEmployeeId?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  periodNumber: number;
  room: string;
}

export interface PeriodItem {
  id: number;
  periodNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  type: string; // 'lesson' | 'break' | 'lunch' | 'assembly' | 'other'
  isTeaching: boolean;
  sortOrder: number;
  days: string;
}

export interface MetaData {
  role: string;
  accessibleClasses: { id: number; name: string; gradeLevel: string | null }[];
  studentClassId: number | null;
  canEdit: boolean;
  subjects: { id: number; code: string; name: string; category: string }[];
  teachers: { id: number; employeeId: string; specialization: string; fullName: string }[];
  periods: PeriodItem[];
  days: string[];
}

const ALL_POSSIBLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Sciences: {
    bg: 'bg-blue-50/80 hover:bg-blue-50',
    text: 'text-blue-900',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  Humanities: {
    bg: 'bg-amber-50/80 hover:bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
  Commercial: {
    bg: 'bg-emerald-50/80 hover:bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  General: {
    bg: 'bg-purple-50/80 hover:bg-purple-50',
    text: 'text-purple-900',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
  },
  Vocational: {
    bg: 'bg-teal-50/80 hover:bg-teal-50',
    text: 'text-teal-900',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-700',
  },
};

function calculateDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sH, sM] = start.split(':').map((v) => parseInt(v, 10));
  const [eH, eM] = end.split(':').map((v) => parseInt(v, 10));
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
  return eH * 60 + eM - (sH * 60 + sM);
}

export const TimetableView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.permissions?.includes('timetable_editing');
  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher';
  const isParent = user?.role === 'parent';

  const [meta, setMeta] = useState<MetaData | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [activeDay, setActiveDay] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'weekly' | 'daily' | 'settings'>('weekly');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lesson Slot Modal State (Admin create / edit slot)
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [formClassId, setFormClassId] = useState<string>('');
  const [formDay, setFormDay] = useState<string>('Monday');
  const [formPeriod, setFormPeriod] = useState<number>(1);
  const [formSubjectId, setFormSubjectId] = useState<string>('');
  const [formTeacherId, setFormTeacherId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('08:45');
  const [formRoom, setFormRoom] = useState<string>('Classroom');

  // Schedule Period Modal State (Admin add/edit configurable period or break)
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PeriodItem | null>(null);
  const [periodFormLabel, setPeriodFormLabel] = useState('');
  const [periodFormNumber, setPeriodFormNumber] = useState<number>(1);
  const [periodFormStart, setPeriodFormStart] = useState('08:00');
  const [periodFormEnd, setPeriodFormEnd] = useState('08:45');
  const [periodFormType, setPeriodFormType] = useState<'lesson' | 'break' | 'lunch' | 'assembly' | 'other'>('lesson');
  const [periodFormIsTeaching, setPeriodFormIsTeaching] = useState(true);
  const [periodFormSortOrder, setPeriodFormSortOrder] = useState<number>(1);

  // School Active Days Configuration State
  const [configuredDays, setConfiguredDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [savingDays, setSavingDays] = useState(false);

  useEffect(() => {
    loadMetaData();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadTimetable(selectedClassId);
    }
  }, [selectedClassId]);

  const loadMetaData = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<MetaData>('/timetable/meta');
      setMeta(res);

      if (res.days && res.days.length > 0) {
        setConfiguredDays(res.days);
      }

      if (res.accessibleClasses && res.accessibleClasses.length > 0) {
        const defaultClass = res.studentClassId || res.accessibleClasses[0].id;
        setSelectedClassId(defaultClass);
        setFormClassId(String(defaultClass));
      }
    } catch (err: any) {
      console.error('Failed to load timetable metadata:', err);
      showToast('error', err.message || 'Failed to load timetable configuration.');
    } finally {
      setLoading(false);
    }
  };

  const loadTimetable = async (classId: number) => {
    try {
      setLoading(true);
      const res = await apiRequest<{ data: TimetableSlot[]; classInfo: any }>(
        `/timetable?classId=${classId}`
      );
      const list = Array.isArray(res?.data) ? res.data : [];
      setSlots(list);
    } catch (err: any) {
      console.error('Failed to fetch timetable slots:', err);
      showToast('error', err.message || 'Failed to load timetable for selected class.');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const activeDays = meta?.days && meta.days.length > 0 ? meta.days : configuredDays;
  const teachingPeriods = meta?.periods.filter((p) => p.isTeaching) || [];

  const handlePeriodChange = (pNum: number) => {
    setFormPeriod(pNum);
    const pInfo = meta?.periods.find((p) => p.periodNumber === pNum);
    if (pInfo) {
      setFormStartTime(pInfo.startTime);
      setFormEndTime(pInfo.endTime);
    }
  };

  const handleOpenCreateSlotModal = () => {
    setEditingSlot(null);
    setFormClassId(String(selectedClassId || meta?.accessibleClasses[0]?.id || '1'));
    setFormDay(activeDays[0] || 'Monday');

    const firstTeachingPeriod = teachingPeriods[0] || meta?.periods[0];
    if (firstTeachingPeriod) {
      setFormPeriod(firstTeachingPeriod.periodNumber);
      setFormStartTime(firstTeachingPeriod.startTime);
      setFormEndTime(firstTeachingPeriod.endTime);
    } else {
      setFormPeriod(1);
      setFormStartTime('08:00');
      setFormEndTime('08:45');
    }

    setFormSubjectId(String(meta?.subjects[0]?.id || ''));
    setFormTeacherId(String(meta?.teachers[0]?.id || ''));
    setFormRoom('Classroom');
    setShowSlotModal(true);
  };

  const handleOpenEditSlotModal = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setFormClassId(String(slot.classId));
    setFormDay(slot.dayOfWeek);
    setFormPeriod(slot.periodNumber);
    setFormSubjectId(String(slot.subjectId));
    setFormTeacherId(String(slot.teacherId));
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormRoom(slot.room);
    setShowSlotModal(true);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClassId || !formSubjectId || !formTeacherId || !formDay) {
      showToast('error', 'Please fill in all required slot fields.');
      return;
    }

    try {
      setActionLoading(true);
      if (editingSlot) {
        await apiRequest(`/timetable/${editingSlot.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            classId: formClassId,
            subjectId: formSubjectId,
            teacherId: formTeacherId,
            dayOfWeek: formDay,
            startTime: formStartTime,
            endTime: formEndTime,
            periodNumber: formPeriod,
            room: formRoom,
          }),
        });
        showToast('success', 'Timetable slot updated successfully.');
      } else {
        await apiRequest('/timetable', {
          method: 'POST',
          body: JSON.stringify({
            classId: formClassId,
            subjectId: formSubjectId,
            teacherId: formTeacherId,
            dayOfWeek: formDay,
            startTime: formStartTime,
            endTime: formEndTime,
            periodNumber: formPeriod,
            room: formRoom,
          }),
        });
        showToast('success', 'New period lesson slot scheduled.');
      }

      setShowSlotModal(false);
      if (selectedClassId) {
        await loadTimetable(selectedClassId);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save timetable slot.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    if (!window.confirm('Are you sure you want to remove this timetable slot?')) return;
    try {
      setActionLoading(true);
      await apiRequest(`/timetable/${slotId}`, { method: 'DELETE' });
      showToast('success', 'Timetable slot removed.');
      if (selectedClassId) {
        await loadTimetable(selectedClassId);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete timetable slot.');
    } finally {
      setActionLoading(false);
    }
  };

  // Schedule Period (Settings) Handlers
  const handleOpenAddPeriodModal = () => {
    setEditingPeriod(null);
    const nextSort = (meta?.periods.length || 0) + 1;
    setPeriodFormLabel(`Period ${nextSort}`);
    setPeriodFormNumber(nextSort);
    setPeriodFormStart('08:00');
    setPeriodFormEnd('08:45');
    setPeriodFormType('lesson');
    setPeriodFormIsTeaching(true);
    setPeriodFormSortOrder(nextSort);
    setShowPeriodModal(true);
  };

  const handleOpenEditPeriodModal = (period: PeriodItem) => {
    setEditingPeriod(period);
    setPeriodFormLabel(period.label);
    setPeriodFormNumber(period.periodNumber);
    setPeriodFormStart(period.startTime);
    setPeriodFormEnd(period.endTime);
    setPeriodFormType((period.type as any) || 'lesson');
    setPeriodFormIsTeaching(period.isTeaching);
    setPeriodFormSortOrder(period.sortOrder || 1);
    setShowPeriodModal(true);
  };

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodFormLabel.trim()) {
      showToast('error', 'Period label is required.');
      return;
    }

    try {
      setActionLoading(true);
      const isTeachingBool = periodFormType === 'lesson' ? periodFormIsTeaching : false;

      if (editingPeriod) {
        await apiRequest(`/timetable/periods/${editingPeriod.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            periodNumber: periodFormNumber,
            label: periodFormLabel.trim(),
            startTime: periodFormStart,
            endTime: periodFormEnd,
            type: periodFormType,
            isTeaching: isTeachingBool,
            sortOrder: periodFormSortOrder,
            days: configuredDays.join(','),
          }),
        });
        showToast('success', `Period "${periodFormLabel}" updated successfully.`);
      } else {
        await apiRequest('/timetable/periods', {
          method: 'POST',
          body: JSON.stringify({
            periodNumber: periodFormNumber,
            label: periodFormLabel.trim(),
            startTime: periodFormStart,
            endTime: periodFormEnd,
            type: periodFormType,
            isTeaching: isTeachingBool,
            sortOrder: periodFormSortOrder,
            days: configuredDays.join(','),
          }),
        });
        showToast('success', `New period "${periodFormLabel}" added to school schedule.`);
      }

      setShowPeriodModal(false);
      await loadMetaData();
      if (selectedClassId) {
        await loadTimetable(selectedClassId);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save schedule period.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePeriod = async (period: PeriodItem) => {
    if (!window.confirm(`Delete period "${period.label}" (${period.startTime} - ${period.endTime}) from the school schedule?`)) {
      return;
    }
    try {
      setActionLoading(true);
      await apiRequest(`/timetable/periods/${period.id}`, { method: 'DELETE' });
      showToast('success', `Schedule period "${period.label}" removed.`);
      await loadMetaData();
      if (selectedClassId) {
        await loadTimetable(selectedClassId);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete schedule period.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDay = (day: string) => {
    setConfiguredDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length <= 1) {
          showToast('error', 'The school must have at least one active timetable day.');
          return prev;
        }
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day];
      }
    });
  };

  const handleSaveSchoolDays = async () => {
    try {
      setSavingDays(true);
      await apiRequest('/timetable/schedule-days', {
        method: 'PUT',
        body: JSON.stringify({ days: configuredDays }),
      });
      showToast('success', 'Active school timetable days updated successfully.');
      await loadMetaData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save school days.');
    } finally {
      setSavingDays(false);
    }
  };

  const currentClassName =
    meta?.accessibleClasses.find((c) => c.id === selectedClassId)?.name ||
    `Class #${selectedClassId}`;

  const filteredSlots =
    activeDay === 'All'
      ? slots
      : slots.filter((s) => s.dayOfWeek.toLowerCase() === activeDay.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-2xl border shadow-xl flex items-center gap-3 text-sm animate-fadeIn max-w-md ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium text-xs sm:text-sm">{toastMsg.text}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <CalendarDays className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Class Timetable & School Schedules
            </h1>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                <Lock className="w-3 h-3 text-slate-400" />
                Read-Only
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAdmin
              ? 'Institutional timetable workstation. Configure school schedule periods, lesson durations, breaks, and allocate class periods.'
              : isTeacher
              ? 'Your assigned classroom schedules, periods, and teaching workstation details.'
              : isStudent
              ? `Your official weekly schedule for ${currentClassName}. Be punctual for every period.`
              : `Weekly class schedule and daily period allocations for your enrolled ward.`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-colors cursor-pointer min-h-[40px]"
            title="Print or Export Timetable"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setViewMode((prev) => (prev === 'settings' ? 'weekly' : 'settings'))}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[40px] ${
                  viewMode === 'settings'
                    ? 'bg-purple-100 text-purple-800 border border-purple-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Configure periods, break times, and days"
              >
                <Settings className="w-4 h-4 text-purple-600" />
                <span>{viewMode === 'settings' ? 'Back to Timetable' : 'Configure Schedule'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCreateSlotModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all cursor-pointer min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Period Slot</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Control Bar: Class Selector + View Switcher + Day Tabs */}
      {viewMode !== 'settings' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Class Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-600" />
              <span>Class:</span>
            </label>

            {isStudent ? (
              <div className="px-3.5 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 font-bold text-xs">
                {currentClassName} (Your Enrolled Class)
              </div>
            ) : (
              <select
                value={selectedClassId || ''}
                onChange={(e) => setSelectedClassId(parseInt(e.target.value, 10))}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer min-h-[38px]"
              >
                {meta?.accessibleClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} {cls.gradeLevel ? `(${cls.gradeLevel})` : ''}
                  </option>
                ))}
              </select>
            )}

            <span className="text-xs text-slate-400">
              {slots.length} scheduled periods • {activeDays.length} school days
            </span>
          </div>

          {/* View Mode & Day Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setViewMode('weekly');
                  setActiveDay('All');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[34px] ${
                  viewMode === 'weekly'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Weekly Grid
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('daily');
                  if (activeDay === 'All') setActiveDay(activeDays[0] || 'Monday');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[34px] ${
                  viewMode === 'daily'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day by Day
              </button>
            </div>

            {/* Day Tabs (in Daily View) */}
            {viewMode === 'daily' && (
              <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
                {activeDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[34px] ${
                      activeDay === day
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SETTINGS VIEW: CONFIGURE SCHOOL SCHEDULE PERIODS & DAYS                   */}
      {/* ========================================================================= */}
      {viewMode === 'settings' && isAdmin && (
        <div className="space-y-6">
          {/* Active School Days Configuration Card */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>School Days of the Week</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select which days your institution holds academic activities.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveSchoolDays}
                disabled={savingDays}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto min-h-[38px]"
              >
                <Check className="w-4 h-4" />
                <span>{savingDays ? 'Saving...' : 'Save School Days'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ALL_POSSIBLE_DAYS.map((day) => {
                const isSelected = configuredDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleToggleDay(day)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border min-h-[40px] ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{day}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Periods & Non-Teaching Intervals Management Card */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span>Configured Schedule Periods & Intervals</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define periods, lesson durations, morning recess breaks, and lunch intervals.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddPeriodModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto min-h-[38px] shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Period / Interval</span>
              </button>
            </div>

            {meta?.periods.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No schedule periods configured</p>
                <p className="text-xs text-slate-400 mt-1">Click "Add Period / Interval" above to create your school periods.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Order</th>
                      <th className="py-3 px-4">Label & Name</th>
                      <th className="py-3 px-4">Period #</th>
                      <th className="py-3 px-4">Time Range</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Teaching?</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {meta?.periods.map((p) => {
                      const duration = calculateDurationMinutes(p.startTime, p.endTime);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-500">
                            #{p.sortOrder || p.periodNumber}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              {p.type === 'break' && <Coffee className="w-4 h-4 text-amber-600 shrink-0" />}
                              {p.type === 'lunch' && <Utensils className="w-4 h-4 text-emerald-600 shrink-0" />}
                              {p.type === 'assembly' && <Users className="w-4 h-4 text-indigo-600 shrink-0" />}
                              {p.type === 'lesson' && <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />}
                              <span>{p.label}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                            {p.isTeaching ? `Period ${p.periodNumber}` : '— (Non-teaching)'}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                            {p.startTime} - {p.endTime}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-600">
                            {duration > 0 ? `${duration} mins` : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                p.type === 'break'
                                  ? 'bg-amber-100 text-amber-800'
                                  : p.type === 'lunch'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : p.type === 'assembly'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {p.type}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {p.isTeaching ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <Check className="w-3.5 h-3.5" /> Teaching
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">Interval</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditPeriodModal(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                                title="Edit period"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePeriod(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete period"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TIMETABLE VIEW (WEEKLY GRID OR DAILY CARDS)                                */}
      {/* ========================================================================= */}
      {viewMode !== 'settings' && (
        <>
          {/* Loading Spinner */}
          {loading ? (
            <div className="bg-white rounded-3xl p-16 border border-slate-200/80 text-center shadow-xs">
              <div className="w-10 h-10 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">
                Loading timetable for {currentClassName}...
              </p>
            </div>
          ) : slots.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 border border-slate-200/80 text-center shadow-xs">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800 mb-1">
                No Timetable Scheduled Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                There are currently no lesson slots configured for {currentClassName}.
              </p>
              {isAdmin && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenCreateSlotModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Period Slot</span>
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'weekly' ? (
            /* ========================================================================= */
            /* WEEKLY GRID VIEW (Dynamic Active Days Columns x Configured Periods)       */
            /* ========================================================================= */
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                <span className="font-bold text-slate-800">
                  Weekly Master Timetable • {currentClassName}
                </span>
                <span>
                  {teachingPeriods.length} Lesson Periods Daily • {activeDays.join(', ')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[850px]">
                  {/* Day Headers */}
                  <div
                    className="grid border-b border-slate-200 bg-slate-100/70 text-xs font-bold text-slate-700 text-center"
                    style={{ gridTemplateColumns: `140px repeat(${activeDays.length}, minmax(0, 1fr))` }}
                  >
                    <div className="p-3 border-r border-slate-200 text-slate-500 uppercase tracking-wider">
                      Period / Time
                    </div>
                    {activeDays.map((day) => (
                      <div key={day} className="p-3 border-r border-slate-200 last:border-r-0">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Period Rows */}
                  {meta?.periods.map((period) => {
                    // Non-teaching intervals (break, lunch, assembly) span all columns
                    if (!period.isTeaching) {
                      const isLunch = period.type === 'lunch';
                      const isAssembly = period.type === 'assembly';
                      const bgClasses = isLunch
                        ? 'bg-emerald-50/70 border-emerald-200/70 text-emerald-800'
                        : isAssembly
                        ? 'bg-indigo-50/70 border-indigo-200/70 text-indigo-800'
                        : 'bg-amber-50/70 border-amber-200/70 text-amber-800';

                      const duration = calculateDurationMinutes(period.startTime, period.endTime);

                      return (
                        <div
                          key={period.id || period.label}
                          className={`grid border-b py-2 px-4 text-center text-xs font-bold transition-colors ${bgClasses}`}
                          style={{ gridTemplateColumns: `140px repeat(${activeDays.length}, minmax(0, 1fr))` }}
                        >
                          <div className="font-mono text-[11px] text-slate-600">
                            {period.startTime} - {period.endTime}
                          </div>
                          <div
                            className="tracking-wide flex items-center justify-center gap-2"
                            style={{ gridColumn: `span ${activeDays.length}` }}
                          >
                            {isLunch ? (
                              <Utensils className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : isAssembly ? (
                              <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            ) : (
                              <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            )}
                            <span>{period.label.toUpperCase()}</span>
                            {duration > 0 && <span className="font-normal text-[11px]">({duration} MINS)</span>}
                          </div>
                        </div>
                      );
                    }

                    // Standard Teaching Period Row
                    return (
                      <div
                        key={period.id || period.periodNumber}
                        className="grid border-b border-slate-200/80 hover:bg-slate-50/40 transition-colors"
                        style={{ gridTemplateColumns: `140px repeat(${activeDays.length}, minmax(0, 1fr))` }}
                      >
                        {/* Left Time Column */}
                        <div className="p-3 border-r border-slate-200/80 bg-slate-50/60 flex flex-col justify-center items-center text-center">
                          <span className="font-bold text-xs text-slate-900">
                            {period.label}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 mt-0.5">
                            {period.startTime} - {period.endTime}
                          </span>
                        </div>

                        {/* Active Days Slot Cells */}
                        {activeDays.map((day) => {
                          const slot = slots.find(
                            (s) =>
                              s.dayOfWeek.toLowerCase() === day.toLowerCase() &&
                              s.periodNumber === period.periodNumber
                          );

                          if (!slot) {
                            return (
                              <div
                                key={day}
                                className="p-2 border-r border-slate-200/80 last:border-r-0 flex items-center justify-center text-slate-300 text-xs italic"
                              >
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSlot(null);
                                      setFormClassId(String(selectedClassId));
                                      setFormDay(day);
                                      handlePeriodChange(period.periodNumber);
                                      setFormSubjectId(String(meta?.subjects[0]?.id || ''));
                                      setFormTeacherId(String(meta?.teachers[0]?.id || ''));
                                      setFormRoom('Classroom');
                                      setShowSlotModal(true);
                                    }}
                                    className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 cursor-pointer p-1 rounded-md hover:bg-purple-50"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Assign</span>
                                  </button>
                                ) : (
                                  <span>Free Period</span>
                                )}
                              </div>
                            );
                          }

                          const color =
                            SUBJECT_COLORS[slot.subjectCategory] || SUBJECT_COLORS.General;

                          return (
                            <div
                              key={day}
                              className={`p-2.5 border-r border-slate-200/80 last:border-r-0 flex flex-col justify-between group transition-all relative ${color.bg}`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-1">
                                  <span className={`font-bold text-xs line-clamp-1 ${color.text}`}>
                                    {slot.subjectName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="font-mono text-[9px] text-slate-500">
                                    {slot.subjectCode}
                                  </span>
                                  <span className={`text-[8px] font-bold px-1 rounded-sm ${color.badge}`}>
                                    {slot.room || 'Classroom'}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                                <span className="truncate flex items-center gap-1">
                                  <GraduationCap className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{slot.teacherName}</span>
                                </span>

                                {isAdmin && (
                                  <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditSlotModal(slot)}
                                      className="p-1 rounded-md bg-white hover:bg-purple-50 text-purple-600 shadow-xs cursor-pointer"
                                      title="Edit slot"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSlot(slot.id)}
                                      className="p-1 rounded-md bg-white hover:bg-rose-50 text-rose-600 shadow-xs cursor-pointer"
                                      title="Delete slot"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* DAY-BY-DAY LIST VIEW                                                      */
            /* ========================================================================= */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span>{activeDay}'s Schedule</span>
                  <span className="text-xs font-normal text-slate-500">
                    ({filteredSlots.length} periods allocated)
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredSlots.map((slot) => {
                  const color = SUBJECT_COLORS[slot.subjectCategory] || SUBJECT_COLORS.General;

                  return (
                    <div
                      key={slot.id}
                      className={`p-5 rounded-2xl border ${color.border} ${color.bg} shadow-xs flex flex-col justify-between transition-all hover:shadow-md relative group`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold">
                            Period {slot.periodNumber}
                          </span>
                          <span className="font-mono text-slate-600 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {slot.startTime} - {slot.endTime}
                          </span>
                        </div>

                        <h4 className={`text-base font-extrabold ${color.text} mb-1`}>
                          {slot.subjectName}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                          <span className="font-mono">{slot.subjectCode}</span>
                          <span>•</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color.badge}`}>
                            {slot.room || 'Classroom'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-700">
                        <div className="flex items-center gap-1.5 truncate">
                          <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {slot.teacherName.charAt(0)}
                          </div>
                          <span className="truncate font-medium">{slot.teacherName}</span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditSlotModal(slot)}
                              className="p-1 rounded-md bg-white hover:bg-purple-50 text-purple-600 border border-slate-200 shadow-2xs cursor-pointer"
                              title="Edit slot"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="p-1 rounded-md bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 shadow-2xs cursor-pointer"
                              title="Delete slot"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT LESSON SLOT                                           */}
      {/* ========================================================================= */}
      {showSlotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <CalendarDays className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingSlot ? 'Edit Timetable Slot' : 'Schedule Lesson Period'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Allocate teacher and subject to class timetable slot
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSlotModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="space-y-4 pt-4">
              {/* Class */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Class</label>
                <select
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {meta?.accessibleClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} {cls.gradeLevel ? `(${cls.gradeLevel})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Day & Period Number */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Day of Week</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    {activeDays.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Period Number</label>
                  <select
                    value={formPeriod}
                    onChange={(e) => handlePeriodChange(parseInt(e.target.value, 10))}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    {teachingPeriods.map((p) => (
                      <option key={p.periodNumber} value={p.periodNumber}>
                        {p.label} ({p.startTime} - {p.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Times (Auto-filled from selected period) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time (24h)</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time (24h)</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <select
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {meta?.subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.code}) - {sub.category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Teacher</label>
                <select
                  value={formTeacherId}
                  onChange={(e) => setFormTeacherId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {meta?.teachers.map((tch) => (
                    <option key={tch.id} value={tch.id}>
                      {tch.fullName} ({tch.employeeId}) - {tch.specialization || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Room / Venue */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room / Venue / Lab</label>
                <input
                  type="text"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  placeholder="e.g. Room 102, Physics Lab, ICT Studio"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSlotModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer disabled:opacity-60"
                >
                  {actionLoading ? 'Saving...' : editingSlot ? 'Update Slot' : 'Create Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD / EDIT SCHEDULE PERIOD (SETTINGS)                            */}
      {/* ========================================================================= */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <Clock className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingPeriod ? 'Edit Schedule Period' : 'Add Schedule Period / Interval'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Define period timing, duration, and type
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPeriodModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="space-y-4 pt-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Period Type</label>
                <select
                  value={periodFormType}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setPeriodFormType(val);
                    if (val === 'lesson') {
                      setPeriodFormIsTeaching(true);
                    } else {
                      setPeriodFormIsTeaching(false);
                      if (val === 'break' && !periodFormLabel.includes('Break')) {
                        setPeriodFormLabel('Morning Break');
                      } else if (val === 'lunch' && !periodFormLabel.includes('Lunch')) {
                        setPeriodFormLabel('Lunch Interval');
                      } else if (val === 'assembly' && !periodFormLabel.includes('Assembly')) {
                        setPeriodFormLabel('Morning Assembly');
                      }
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="lesson">Teaching Lesson Period</option>
                  <option value="break">Morning Recess / Break</option>
                  <option value="lunch">Lunch Interval</option>
                  <option value="assembly">School Assembly</option>
                  <option value="other">Other Non-Teaching Interval</option>
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Period Label / Name</label>
                <input
                  type="text"
                  value={periodFormLabel}
                  onChange={(e) => setPeriodFormLabel(e.target.value)}
                  placeholder="e.g. Period 1, Morning Break, Lunch"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Period Number & Sort Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Period Number</label>
                  <input
                    type="number"
                    min={0}
                    value={periodFormNumber}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPeriodFormNumber(isNaN(val) ? 0 : val);
                    }}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-slate-400">0 for non-teaching intervals</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Display Sort Order</label>
                  <input
                    type="number"
                    min={1}
                    value={periodFormSortOrder}
                    onChange={(e) => setPeriodFormSortOrder(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Start & End Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time (24h)</label>
                  <input
                    type="time"
                    value={periodFormStart}
                    onChange={(e) => setPeriodFormStart(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time (24h)</label>
                  <input
                    type="time"
                    value={periodFormEnd}
                    onChange={(e) => setPeriodFormEnd(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Calculated duration feedback */}
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
                <span className="font-medium">Calculated Duration:</span>
                <span className="font-bold font-mono">
                  {calculateDurationMinutes(periodFormStart, periodFormEnd)} minutes
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer disabled:opacity-60"
                >
                  {actionLoading ? 'Saving...' : editingPeriod ? 'Update Period' : 'Save Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
