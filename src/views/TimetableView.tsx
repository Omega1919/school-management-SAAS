import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  BookOpen,
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Printer,
  Sparkles,
  MapPin,
  Lock,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  Calendar,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Badge } from '../components/Badge.tsx';

interface TimetableSlot {
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

interface MetaData {
  role: string;
  accessibleClasses: { id: number; name: string; gradeLevel: string | null }[];
  studentClassId: number | null;
  canEdit: boolean;
  subjects: { id: number; code: string; name: string; category: string }[];
  teachers: { id: number; employeeId: string; specialization: string; fullName: string }[];
  periods: { periodNumber: number; startTime: string; endTime: string; label: string }[];
  days: string[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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

export const TimetableView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.permissions?.includes('timetable_editing');
  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher';
  const isParent = user?.role === 'parent';

  const [meta, setMeta] = useState<MetaData | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [activeDay, setActiveDay] = useState<string>('All'); // 'All' | 'Monday' | ...
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State for Admin Creation / Editing
  const [showModal, setShowModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [formClassId, setFormClassId] = useState<string>('');
  const [formDay, setFormDay] = useState<string>('Monday');
  const [formPeriod, setFormPeriod] = useState<number>(1);
  const [formSubjectId, setFormSubjectId] = useState<string>('');
  const [formTeacherId, setFormTeacherId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('08:45');
  const [formRoom, setFormRoom] = useState<string>('Classroom');

  // Load Meta Data
  useEffect(() => {
    loadMetaData();
  }, []);

  // When selected class changes, load timetable
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
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handlePeriodChange = (pNum: number) => {
    setFormPeriod(pNum);
    const pInfo = meta?.periods.find((p) => p.periodNumber === pNum);
    if (pInfo) {
      setFormStartTime(pInfo.startTime);
      setFormEndTime(pInfo.endTime);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingSlot(null);
    setFormClassId(String(selectedClassId || meta?.accessibleClasses[0]?.id || '1'));
    setFormDay('Monday');
    handlePeriodChange(1);
    setFormSubjectId(String(meta?.subjects[0]?.id || ''));
    setFormTeacherId(String(meta?.teachers[0]?.id || ''));
    setFormRoom('Classroom');
    setShowModal(true);
  };

  const handleOpenEditModal = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setFormClassId(String(slot.classId));
    setFormDay(slot.dayOfWeek);
    setFormPeriod(slot.periodNumber);
    setFormSubjectId(String(slot.subjectId));
    setFormTeacherId(String(slot.teacherId));
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormRoom(slot.room);
    setShowModal(true);
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
        // Update slot
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
        // Create slot
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
        showToast('success', 'New period slot created.');
      }

      setShowModal(false);
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

  const handleGenerateDefault = async () => {
    if (!window.confirm('Generate structured standard timetable schedules for all active classes?')) return;
    try {
      setActionLoading(true);
      const res = await apiRequest<{ message: string; totalGenerated: number }>(
        '/timetable/generate-default',
        { method: 'POST' }
      );
      showToast('success', res.message || 'Standard schedules generated.');
      if (selectedClassId) {
        await loadTimetable(selectedClassId);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to generate schedules.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Get current selected class name
  const currentClassName =
    meta?.accessibleClasses.find((c) => c.id === selectedClassId)?.name ||
    `Class #${selectedClassId}`;

  // Filter slots by active day in daily view
  const filteredSlots =
    activeDay === 'All'
      ? slots
      : slots.filter((s) => s.dayOfWeek.toLowerCase() === activeDay.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-2xl border shadow-xl flex items-center gap-3 text-sm animate-fadeIn ${
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
          <span className="font-medium">{toastMsg.text}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <CalendarDays className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Class Timetable & Schedules
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
              ? 'Institutional timetable workstation. Configure, schedule, and publish class lesson periods across all cohorts.'
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
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            title="Print or Export Timetable"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Period Slot</span>
            </button>
          )}
        </div>
      </div>

      {/* Control Bar: Class Selector + Day Tabs + View Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Class Selector */}
        <div className="flex items-center gap-3">
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
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              {meta?.accessibleClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} {cls.gradeLevel ? `(${cls.gradeLevel})` : ''}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs text-slate-400">
            {slots.length} scheduled periods
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
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
                if (activeDay === 'All') setActiveDay('Monday');
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setActiveDay(day)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Period Slot</span>
            </button>
          )}
        </div>
      ) : viewMode === 'weekly' ? (
        /* ========================================================================= */
        /* WEEKLY GRID VIEW (5 Day Columns x 8 Period Rows)                          */
        /* ========================================================================= */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
            <span className="font-bold text-slate-800">
              Weekly Master Timetable • {currentClassName}
            </span>
            <span>8 Periods Daily (08:00 - 15:15)</span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Day Headers */}
              <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-100/70 text-xs font-bold text-slate-700 text-center">
                <div className="p-3 border-r border-slate-200 text-slate-500 uppercase tracking-wider">
                  Period / Time
                </div>
                {DAYS.map((day) => (
                  <div key={day} className="p-3 border-r border-slate-200 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>

              {/* Periods 1 to 8 Rows */}
              {meta?.periods.map((period, idx) => {
                const isBreakAfter3 = period.periodNumber === 4;
                const isLunchAfter6 = period.periodNumber === 7;

                return (
                  <React.Fragment key={period.periodNumber}>
                    {/* Morning Break Row (after period 3) */}
                    {isBreakAfter3 && (
                      <div className="grid grid-cols-6 bg-amber-50/60 border-b border-amber-200/60 text-center py-2 px-4 text-xs font-bold text-amber-800">
                        <div className="font-mono text-[11px] text-amber-700">10:15 - 10:45</div>
                        <div className="col-span-5 tracking-wide flex items-center justify-center gap-2">
                          <span>☕ MORNING RECESSED BREAK (30 MINS)</span>
                        </div>
                      </div>
                    )}

                    {/* Lunch Break Row (after period 6) */}
                    {isLunchAfter6 && (
                      <div className="grid grid-cols-6 bg-emerald-50/60 border-b border-emerald-200/60 text-center py-2 px-4 text-xs font-bold text-emerald-800">
                        <div className="font-mono text-[11px] text-emerald-700">13:00 - 13:45</div>
                        <div className="col-span-5 tracking-wide flex items-center justify-center gap-2">
                          <span>🍱 LUNCH & CO-CURRICULAR BREAK (45 MINS)</span>
                        </div>
                      </div>
                    )}

                    {/* Standard Period Row */}
                    <div className="grid grid-cols-6 border-b border-slate-200/80 hover:bg-slate-50/40 transition-colors">
                      {/* Left Time Column */}
                      <div className="p-3 border-r border-slate-200/80 bg-slate-50/60 flex flex-col justify-center items-center text-center">
                        <span className="font-bold text-xs text-slate-900">
                          {period.label}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 mt-0.5">
                          {period.startTime} - {period.endTime}
                        </span>
                      </div>

                      {/* 5 Day Slot Cells */}
                      {DAYS.map((day) => {
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
                                    setShowModal(true);
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
                              {/* Subject & Code */}
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

                            {/* Teacher Info */}
                            <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                              <span className="truncate flex items-center gap-1">
                                <GraduationCap className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{slot.teacherName}</span>
                              </span>

                              {/* Admin Inline Action Icons */}
                              {isAdmin && (
                                <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(slot)}
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
                  </React.Fragment>
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
                    {/* Period & Time header */}
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold">
                        Period {slot.periodNumber}
                      </span>
                      <span className="font-mono text-slate-600 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {slot.startTime} - {slot.endTime}
                      </span>
                    </div>

                    {/* Subject */}
                    <h4 className={`text-base font-extrabold ${color.text} mb-1`}>
                      {slot.subjectName}
                    </h4>

                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-3">
                      <span className="font-mono font-medium">{slot.subjectCode}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {slot.room || 'Classroom'}
                      </span>
                    </div>
                  </div>

                  {/* Teacher footer */}
                  <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-700">
                    <div className="flex items-center gap-1.5 truncate">
                      <GraduationCap className="w-4 h-4 text-purple-600 shrink-0" />
                      <span className="font-semibold truncate">{slot.teacherName}</span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(slot)}
                          className="p-1 rounded-md bg-white hover:bg-purple-100 text-purple-700 transition-colors cursor-pointer"
                          title="Edit slot"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="p-1 rounded-md bg-white hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer"
                          title="Delete slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* ========================================================================= */}
      {/* ADMIN ADD / EDIT PERIOD MODAL                                             */}
      {/* ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 mb-1">
              {editingSlot ? 'Edit Timetable Slot' : 'Add Timetable Period'}
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Configure the subject, assigned instructor, period timing, and classroom venue.
            </p>

            <form onSubmit={handleSaveSlot} className="space-y-4">
              {/* Class Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Class Room
                </label>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Period Number
                  </label>
                  <select
                    value={formPeriod}
                    onChange={(e) => handlePeriodChange(parseInt(e.target.value, 10))}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    {meta?.periods.map((p) => (
                      <option key={p.periodNumber} value={p.periodNumber}>
                        {p.label} ({p.startTime} - {p.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subject
                </label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned Teacher
                </label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Room / Venue / Lab
                </label>
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
                  onClick={() => setShowModal(false)}
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
    </div>
  );
};
