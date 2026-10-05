import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Users,
  GraduationCap,
  Plus,
  Search,
  ChevronRight,
  Layers,
  Award,
  CheckCircle,
  AlertCircle,
  FolderPlus,
  Calendar,
  Building2,
  Clock,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';
import { Badge } from '../components/Badge.tsx';

interface ClassRecord {
  id: number;
  name: string;
  section?: string;
  gradeLevel?: string;
  sessionId?: number;
  sessionName?: string;
  departmentId?: number;
  departmentName?: string;
  capacity?: number;
  studentCount?: number;
  classTeacherName?: string;
  classTeacherId?: number;
  attendanceRecorderName?: string;
  attendanceRecorderId?: number;
  status: string;
}

interface SubjectRecord {
  id: number;
  name: string;
  code: string;
  category?: string;
}

interface SessionRecord {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: string;
  description?: string;
  totalClasses?: number;
  totalEnrollments?: number;
}

interface TermRecord {
  id: number;
  sessionId?: number;
  sessionName: string;
  termName: string;
  termNumber: number;
  isCurrent: boolean;
  startDate?: string;
  endDate?: string;
}

interface DepartmentRecord {
  id: number;
  code: string;
  name: string;
  description?: string;
  status: string;
  totalClasses?: number;
}

interface TeacherOption {
  id: number;
  fullName: string;
  employeeId: string;
}

export const ClassesView: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.permissions?.includes('class_management');

  // Tabs
  const [activeTab, setActiveTab] = useState<'classes' | 'sessions' | 'terms' | 'departments' | 'subjects'>('classes');

  // Datasets
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [terms, setTerms] = useState<TermRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [showAddTermModal, setShowAddTermModal] = useState(false);
  const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false);
  const [showAssignSubjectModal, setShowAssignSubjectModal] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Forms
  const [newClass, setNewClass] = useState({
    name: '',
    section: 'A',
    gradeLevel: '1',
    sessionId: '',
    departmentId: '',
    capacity: '40',
    classTeacherId: '',
    attendanceRecorderId: '',
  });

  const [newSubject, setNewSubject] = useState({
    name: '',
    code: '',
    category: 'General',
  });

  const [newSession, setNewSession] = useState({
    name: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
  });

  const [newTerm, setNewTerm] = useState({
    sessionId: '',
    termName: 'First Term',
    termNumber: '1',
    isCurrent: false,
    startDate: '',
    endDate: '',
  });

  const [newDepartment, setNewDepartment] = useState({
    code: '',
    name: '',
    description: '',
  });

  const [assignSubjectData, setAssignSubjectData] = useState({
    subjectId: '',
    teacherId: '',
    periodsPerWeek: '4',
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [classesRes, subjectsRes, sessionsRes, termsRes, deptRes, teachersRes] = await Promise.all([
        apiRequest<ClassRecord[]>('/classes'),
        apiRequest<SubjectRecord[]>('/academic/subjects'),
        apiRequest<SessionRecord[]>('/academic/sessions'),
        apiRequest<TermRecord[]>('/academic/terms'),
        apiRequest<DepartmentRecord[]>('/academic/departments'),
        apiRequest<any>('/teachers'),
      ]);

      setClasses(classesRes || []);
      setSubjects(subjectsRes || []);
      setSessions(sessionsRes || []);
      setTerms(termsRes || []);
      setDepartments(deptRes || []);

      const teacherList = (teachersRes?.data || teachersRes || []).map((t: any) => ({
        id: t.id,
        fullName: t.name || t.fullName,
        employeeId: t.employeeId,
      }));
      setTeachers(teacherList);

      if (sessionsRes?.length && !newClass.sessionId) {
        const cur = sessionsRes.find((s) => s.isCurrent) || sessionsRes[0];
        setNewClass((prev) => ({ ...prev, sessionId: cur.id.toString() }));
        setNewTerm((prev) => ({ ...prev, sessionId: cur.id.toString() }));
      }
    } catch (err: any) {
      console.error('Error loading academic data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper notification
  const triggerSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // 1. Create Class / Level
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: newClass.name.trim(),
          section: newClass.section.trim() || undefined,
          gradeLevel: newClass.gradeLevel.trim() || undefined,
          sessionId: newClass.sessionId ? parseInt(newClass.sessionId) : undefined,
          departmentId: newClass.departmentId ? parseInt(newClass.departmentId) : undefined,
          capacity: parseInt(newClass.capacity) || 40,
          classTeacherId: newClass.classTeacherId ? parseInt(newClass.classTeacherId) : undefined,
          attendanceRecorderId: newClass.attendanceRecorderId ? parseInt(newClass.attendanceRecorderId) : undefined,
        }),
      });
      setShowAddClassModal(false);
      setNewClass({
        name: '',
        section: 'A',
        gradeLevel: '1',
        sessionId: sessions.find((s) => s.isCurrent)?.id.toString() || '',
        departmentId: '',
        capacity: '40',
        classTeacherId: '',
        attendanceRecorderId: '',
      });
      triggerSuccess('Class section successfully created.');
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to create class');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Create Academic Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/academic/sessions', {
        method: 'POST',
        body: JSON.stringify({
          name: newSession.name.trim(),
          startDate: newSession.startDate,
          endDate: newSession.endDate,
          isCurrent: newSession.isCurrent,
          description: newSession.description.trim() || undefined,
        }),
      });
      setShowAddSessionModal(false);
      setNewSession({ name: '', startDate: '', endDate: '', isCurrent: false, description: '' });
      triggerSuccess('Academic session registered.');
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Set Current Session
  const handleSetCurrentSession = async (sessionId: number) => {
    try {
      await apiRequest(`/academic/sessions/${sessionId}/set-current`, { method: 'PUT' });
      triggerSuccess('Active academic session updated.');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to update active session');
    }
  };

  // 4. Create Term / Semester
  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/academic/terms', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: parseInt(newTerm.sessionId),
          termName: newTerm.termName.trim(),
          termNumber: parseInt(newTerm.termNumber),
          isCurrent: newTerm.isCurrent,
          startDate: newTerm.startDate || undefined,
          endDate: newTerm.endDate || undefined,
        }),
      });
      setShowAddTermModal(false);
      triggerSuccess('Term / Semester created.');
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to create term');
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Set Current Term
  const handleSetCurrentTerm = async (termId: number) => {
    try {
      await apiRequest(`/academic/terms/${termId}/set-current`, { method: 'PUT' });
      triggerSuccess('Active term/semester updated.');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to update active term');
    }
  };

  // 6. Create Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/academic/departments', {
        method: 'POST',
        body: JSON.stringify({
          code: newDepartment.code.trim().toUpperCase(),
          name: newDepartment.name.trim(),
          description: newDepartment.description.trim() || undefined,
        }),
      });
      setShowAddDepartmentModal(false);
      setNewDepartment({ code: '', name: '', description: '' });
      triggerSuccess('Department / Programme registered.');
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to create department');
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Create Subject
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/academic/subjects', {
        method: 'POST',
        body: JSON.stringify({
          name: newSubject.name.trim(),
          code: newSubject.code.toUpperCase().trim(),
          category: newSubject.category,
        }),
      });
      setShowAddSubjectModal(false);
      setNewSubject({ name: '', code: '', category: 'General' });
      triggerSuccess('Subject / Course registered.');
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to add subject');
    } finally {
      setSubmitting(false);
    }
  };

  // 8. Assign Subject to Class
  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssignSubjectModal) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/classes/${showAssignSubjectModal}/subjects`, {
        method: 'POST',
        body: JSON.stringify({
          subjectId: parseInt(assignSubjectData.subjectId),
          teacherId: assignSubjectData.teacherId ? parseInt(assignSubjectData.teacherId) : undefined,
          periodsPerWeek: parseInt(assignSubjectData.periodsPerWeek),
        }),
      });
      setShowAssignSubjectModal(null);
      setAssignSubjectData({ subjectId: '', teacherId: '', periodsPerWeek: '4' });
      triggerSuccess('Subject assigned to class successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to assign subject');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-purple-600" />
            <span>Academic Structure & Curriculum</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure academic sessions, semesters/terms, classes, departments, and course allocations
          </p>
        </div>

        {isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'classes' && (
              <button
                type="button"
                onClick={() => setShowAddClassModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Class / Level</span>
              </button>
            )}
            {activeTab === 'sessions' && (
              <button
                type="button"
                onClick={() => setShowAddSessionModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Academic Session</span>
              </button>
            )}
            {activeTab === 'terms' && (
              <button
                type="button"
                onClick={() => setShowAddTermModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Term / Semester</span>
              </button>
            )}
            {activeTab === 'departments' && (
              <button
                type="button"
                onClick={() => setShowAddDepartmentModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Department</span>
              </button>
            )}
            {activeTab === 'subjects' && (
              <button
                type="button"
                onClick={() => setShowAddSubjectModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Add Subject / Course</span>
              </button>
            )}
          </div>
        )}
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'classes'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Classes & Levels ({classes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'sessions'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Academic Sessions ({sessions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('terms')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'terms'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Terms / Semesters ({terms.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('departments')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'departments'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Departments / Programmes ({departments.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'subjects'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Subjects / Courses ({subjects.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading academic structure data...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: CLASSES & LEVELS */}
          {activeTab === 'classes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 font-extrabold text-sm flex items-center justify-center border border-purple-200">
                          {cls.name.substring(0, 3)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{cls.name}</h3>
                          <p className="text-xs text-slate-500">
                            {cls.section ? `Section: ${cls.section} • ` : ''}
                            {cls.gradeLevel ? `Level ${cls.gradeLevel}` : ''}
                            {cls.departmentName ? ` • ${cls.departmentName}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <GraduationCap className="w-4 h-4 text-slate-400" />
                          <span>Class Teacher:</span>
                        </span>
                        <span className="font-semibold text-slate-800">
                          {cls.classTeacherName || 'Not Assigned'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span>Enrolled Students:</span>
                        </span>
                        <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/50">
                          {cls.studentCount || 0} / {cls.capacity || 40} capacity
                        </span>
                      </div>

                      {cls.sessionName && (
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Session:</span>
                          <span className="font-medium text-slate-700">{cls.sessionName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAssignSubjectModal(cls.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                      >
                        + Assign Subject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: ACADEMIC SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`bg-white rounded-2xl border p-5 shadow-2xs transition-all flex flex-col justify-between ${
                    sess.isCurrent ? 'border-purple-400 ring-2 ring-purple-500/20' : 'border-slate-200/80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-lg">{sess.name}</h3>
                          {sess.isCurrent && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                              Active Current
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {sess.startDate} to {sess.endDate}
                        </p>
                      </div>
                      <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {sess.status}
                      </span>
                    </div>

                    {sess.description && (
                      <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {sess.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 text-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Classes</span>
                        <div className="text-base font-bold text-slate-800 mt-0.5">{sess.totalClasses || 0}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 text-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Enrollments</span>
                        <div className="text-base font-bold text-slate-800 mt-0.5">{sess.totalEnrollments || 0}</div>
                      </div>
                    </div>
                  </div>

                  {isSuperAdmin && !sess.isCurrent && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSetCurrentSession(sess.id)}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Set as Active Session
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: TERMS / SEMESTERS */}
          {activeTab === 'terms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {terms.map((t) => (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border p-5 shadow-2xs transition-all flex flex-col justify-between ${
                    t.isCurrent ? 'border-purple-400 ring-2 ring-purple-500/20' : 'border-slate-200/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="font-extrabold text-slate-900 text-base">{t.termName}</h3>
                      {t.isCurrent && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                          Active Term
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 space-y-1">
                      <div>
                        Session: <span className="font-semibold text-slate-800">{t.sessionName}</span>
                      </div>
                      <div>
                        Order / Number: <span className="font-semibold text-slate-800">#{t.termNumber}</span>
                      </div>
                      {t.startDate && t.endDate && (
                        <div className="text-slate-400 text-[11px]">
                          {t.startDate} to {t.endDate}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSuperAdmin && !t.isCurrent && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSetCurrentTerm(t.id)}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Set as Active Term
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: DEPARTMENTS / PROGRAMMES */}
          {activeTab === 'departments' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold text-xs border border-indigo-200">
                        {dept.code}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {dept.totalClasses || 0} classes
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{dept.name}</h3>
                    {dept.description && (
                      <p className="text-xs text-slate-500 mt-2">{dept.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: SUBJECTS / COURSES */}
          {activeTab === 'subjects' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold text-xs border border-indigo-200">
                      {sub.code}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {sub.category || 'General'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mt-2">{sub.name}</h3>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal 1: Add Class Section */}
      {showAddClassModal && (
        <Modal
          isOpen={showAddClassModal}
          onClose={() => setShowAddClassModal(false)}
          title="Add New Class / Academic Level"
        >
          <form onSubmit={handleCreateClass} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Class / Level Name *</label>
              <input
                type="text"
                required
                value={newClass.name}
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                placeholder="e.g. JSS 1 Gold, SS 1 Science, 100 Level, or ND 1"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                <input
                  type="text"
                  value={newClass.section}
                  onChange={(e) => setNewClass({ ...newClass, section: e.target.value })}
                  placeholder="e.g. Science, Arts, A, Morning"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Level / Grade Code</label>
                <input
                  type="text"
                  value={newClass.gradeLevel}
                  onChange={(e) => setNewClass({ ...newClass, gradeLevel: e.target.value })}
                  placeholder="e.g. 100L, JSS1, 1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Session</label>
                <select
                  value={newClass.sessionId}
                  onChange={(e) => setNewClass({ ...newClass, sessionId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select Session</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  value={newClass.departmentId}
                  onChange={(e) => setNewClass({ ...newClass, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">General / None</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Teacher</label>
                <select
                  value={newClass.classTeacherId}
                  onChange={(e) => setNewClass({ ...newClass, classTeacherId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">None Assigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} ({t.employeeId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={newClass.capacity}
                  onChange={(e) => setNewClass({ ...newClass, capacity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddClassModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 2: Add Academic Session */}
      {showAddSessionModal && (
        <Modal
          isOpen={showAddSessionModal}
          onClose={() => setShowAddSessionModal(false)}
          title="Add Academic Session"
        >
          <form onSubmit={handleCreateSession} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Session Name *</label>
              <input
                type="text"
                required
                value={newSession.name}
                onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
                placeholder="e.g. 2026/2027 or 2027/2028"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={newSession.startDate}
                  onChange={(e) => setNewSession({ ...newSession, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={newSession.endDate}
                  onChange={(e) => setNewSession({ ...newSession, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={newSession.description}
                onChange={(e) => setNewSession({ ...newSession, description: e.target.value })}
                placeholder="e.g. 2026/2027 Academic Year"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCurrentSession"
                checked={newSession.isCurrent}
                onChange={(e) => setNewSession({ ...newSession, isCurrent: e.target.checked })}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="isCurrentSession" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Set as active/current academic session
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSessionModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 3: Add Term / Semester */}
      {showAddTermModal && (
        <Modal
          isOpen={showAddTermModal}
          onClose={() => setShowAddTermModal(false)}
          title="Add Term or Semester"
        >
          <form onSubmit={handleCreateTerm} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Session *</label>
              <select
                required
                value={newTerm.sessionId}
                onChange={(e) => setNewTerm({ ...newTerm, sessionId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Academic Session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Term / Semester Name *</label>
                <input
                  type="text"
                  required
                  value={newTerm.termName}
                  onChange={(e) => setNewTerm({ ...newTerm, termName: e.target.value })}
                  placeholder="e.g. First Term, First Semester"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Term Sequence Number *</label>
                <select
                  value={newTerm.termNumber}
                  onChange={(e) => setNewTerm({ ...newTerm, termNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="1">1 (e.g. 1st Term / 1st Semester)</option>
                  <option value="2">2 (e.g. 2nd Term / 2nd Semester)</option>
                  <option value="3">3 (e.g. 3rd Term)</option>
                  <option value="4">4 (e.g. 4th Quarter)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCurrentTerm"
                checked={newTerm.isCurrent}
                onChange={(e) => setNewTerm({ ...newTerm, isCurrent: e.target.checked })}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="isCurrentTerm" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Set as active term/semester
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddTermModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Term'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 4: Add Department */}
      {showAddDepartmentModal && (
        <Modal
          isOpen={showAddDepartmentModal}
          onClose={() => setShowAddDepartmentModal(false)}
          title="Add Department or Programme"
        >
          <form onSubmit={handleCreateDepartment} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department Code *</label>
              <input
                type="text"
                required
                value={newDepartment.code}
                onChange={(e) => setNewDepartment({ ...newDepartment, code: e.target.value })}
                placeholder="e.g. SCI, ART, COMM, ENG, CS"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Programme Name *</label>
              <input
                type="text"
                required
                value={newDepartment.name}
                onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                placeholder="e.g. Science & Technology or Faculty of Arts"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={newDepartment.description}
                onChange={(e) => setNewDepartment({ ...newDepartment, description: e.target.value })}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddDepartmentModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Department'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 5: Add Subject */}
      {showAddSubjectModal && (
        <Modal
          isOpen={showAddSubjectModal}
          onClose={() => setShowAddSubjectModal(false)}
          title="Add New Subject or Course"
        >
          <form onSubmit={handleCreateSubject} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Course Code *</label>
              <input
                type="text"
                required
                value={newSubject.code}
                onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                placeholder="e.g. MTH-101, PHY-101, ENG-101"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name *</label>
              <input
                type="text"
                required
                value={newSubject.name}
                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                placeholder="e.g. General Mathematics"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={newSubject.category}
                onChange={(e) => setNewSubject({ ...newSubject, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="Sciences">Sciences</option>
                <option value="Arts & Humanities">Arts & Humanities</option>
                <option value="Commercial">Commercial / Social Sciences</option>
                <option value="General">General Education</option>
                <option value="Vocational">Vocational & Technical</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSubjectModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Subject'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 6: Assign Subject to Class */}
      {showAssignSubjectModal && (
        <Modal
          isOpen={Boolean(showAssignSubjectModal)}
          onClose={() => setShowAssignSubjectModal(null)}
          title="Assign Subject to Class"
        >
          <form onSubmit={handleAssignSubject} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Subject *</label>
              <select
                required
                value={assignSubjectData.subjectId}
                onChange={(e) => setAssignSubjectData({ ...assignSubjectData, subjectId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Choose Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}: {s.name} ({s.category || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Subject Teacher</label>
              <select
                value={assignSubjectData.teacherId}
                onChange={(e) => setAssignSubjectData({ ...assignSubjectData, teacherId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Instructor (Optional)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Periods Per Week</label>
              <input
                type="number"
                min="1"
                max="20"
                value={assignSubjectData.periodsPerWeek}
                onChange={(e) => setAssignSubjectData({ ...assignSubjectData, periodsPerWeek: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignSubjectModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Assigning...' : 'Allocate Subject'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
