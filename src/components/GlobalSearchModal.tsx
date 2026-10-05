import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  User,
  GraduationCap,
  School,
  ArrowRight,
  Sparkles,
  BookOpen,
  Calendar,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Building,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useProfileModal } from '../context/ProfileModalContext.tsx';

interface SearchStudent {
  id: number;
  studentCode: string;
  firstName: string;
  lastName: string;
  gender?: string;
  status: string;
  admissionDate?: string;
  classId?: number;
  className?: string;
  classSection?: string;
}

interface SearchClass {
  id: number;
  name: string;
  section?: string;
  capacity: number;
  studentCount: number;
  classTeacherId?: number;
  teacherName?: string;
  teacherCode?: string;
  isAssignedToMe?: boolean;
}

interface SearchTeacher {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone?: string;
  employeeId: string;
  specialization?: string;
  qualification?: string;
  status: string;
  hireDate?: string;
}

interface SearchResultsResponse {
  query: string;
  students: SearchStudent[];
  classes: SearchClass[];
  teachers: SearchTeacher[];
  totalMatches: number;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, targetId?: any) => void;
  userRole?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  userRole,
}) => {
  const { openStudentProfile, openTeacherProfile } = useProfileModal();
  const [query, setQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'students' | 'classes' | 'teachers'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<SearchResultsResponse | null>(null);
  const [selectedItem, setSelectedItem] = useState<{
    type: 'student' | 'class' | 'teacher';
    data: any;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSelectedItem(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const data = await apiRequest<SearchResultsResponse>(
          `/search?q=${encodeURIComponent(trimmed)}&type=${activeTab}`
        );
        setResults(data);
      } catch (err) {
        console.error('Failed to execute search:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [query, activeTab, isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const studentsList = results?.students || [];
  const classesList = results?.classes || [];
  const teachersList = results?.teachers || [];
  const totalMatches = results?.totalMatches || 0;

  const handleSelectStudent = (student: SearchStudent) => {
    setSelectedItem({ type: 'student', data: student });
  };

  const handleSelectClass = (cls: SearchClass) => {
    setSelectedItem({ type: 'class', data: cls });
  };

  const handleSelectTeacher = (teacher: SearchTeacher) => {
    setSelectedItem({ type: 'teacher', data: teacher });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      {/* Search Modal Box */}
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
        {/* Search Input Bar */}
        <div className="relative border-b border-slate-200/90 px-4 sm:px-6 py-4 flex items-center gap-3 bg-slate-50/50">
          <Search className="w-5 h-5 text-indigo-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search students, classes, or teachers by name, ID, code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-slate-900 text-sm sm:text-base font-medium placeholder:text-slate-400 focus:outline-hidden"
          />
          {loading && <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />}
          {query && !loading && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 rounded-lg text-xs transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 text-xs font-semibold overflow-x-auto">
          <span className="text-slate-400 uppercase tracking-wider text-[10px] mr-1 hidden sm:inline">
            Filters:
          </span>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
            }`}
          >
            <span>All Categories</span>
            {results && <span className="text-[10px] opacity-80">({totalMatches})</span>}
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'students'
                ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Students</span>
            {results && <span className="text-[10px] opacity-80">({studentsList.length})</span>}
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'classes'
                ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Classes</span>
            {results && <span className="text-[10px] opacity-80">({classesList.length})</span>}
          </button>
          <button
            onClick={() => setActiveTab('teachers')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'teachers'
                ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Teachers</span>
            {results && <span className="text-[10px] opacity-80">({teachersList.length})</span>}
          </button>
        </div>

        {/* Search Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {!query.trim() ? (
            // Empty State / Search Suggestions
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  Instant Universal Search
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Type any student name or ID (e.g. <span className="font-mono font-semibold text-slate-700">STU-001</span>), class name (e.g. <span className="font-semibold text-slate-700">JSS 1A</span>), or teacher faculty name.
                </p>
              </div>

              {/* Quick Suggestion Chips */}
              <div className="pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Suggested Searches
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['JSS 1', 'SS 1', 'STU-', 'TCH-', 'Science', 'Mathematics'].map((sample) => (
                    <button
                      key={sample}
                      onClick={() => setQuery(sample)}
                      className="px-3 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-slate-200"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : results && totalMatches === 0 && !loading ? (
            // No Results State
            <div className="py-12 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">
                No matching results found for "{query}"
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Check for typos or try searching with a student admission ID, teacher employee code, or cohort name.
              </p>
            </div>
          ) : (
            // Results List
            <div className="space-y-6">
              {/* 1. Students Section */}
              {(activeTab === 'all' || activeTab === 'students') && studentsList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                      <span>Students ({studentsList.length})</span>
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {studentsList.map((st) => (
                      <div
                        key={st.id}
                        onClick={() => handleSelectStudent(st)}
                        className="p-3 bg-white hover:bg-indigo-50/60 rounded-xl border border-slate-200/90 hover:border-indigo-300 transition-all cursor-pointer shadow-2xs group flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-700 truncate">
                              {st.firstName} {st.lastName}
                            </span>
                            {st.gender && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                {st.gender}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span className="font-mono text-indigo-600 font-semibold">{st.studentCode}</span>
                            {st.className && (
                              <span>• Class: <strong className="text-slate-700">{st.className} {st.classSection ? `(${st.classSection})` : ''}</strong></span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Classes Section */}
              {(activeTab === 'all' || activeTab === 'classes') && classesList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <School className="w-4 h-4 text-emerald-600" />
                      <span>Classes & Cohorts ({classesList.length})</span>
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {classesList.map((cls) => (
                      <div
                        key={cls.id}
                        onClick={() => handleSelectClass(cls)}
                        className="p-3 bg-white hover:bg-emerald-50/60 rounded-xl border border-slate-200/90 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs group flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 truncate">
                              {cls.name}
                            </span>
                            {cls.section && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
                                {cls.section}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Enrolled: <strong className="text-slate-800">{cls.studentCount} students</strong>
                            {cls.teacherName && ` • Form Tutor: ${cls.teacherName}`}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Teachers Section */}
              {(activeTab === 'all' || activeTab === 'teachers') && teachersList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-purple-600" />
                      <span>Faculty & Staff ({teachersList.length})</span>
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {teachersList.map((tch) => (
                      <div
                        key={tch.id}
                        onClick={() => handleSelectTeacher(tch)}
                        className="p-3 bg-white hover:bg-purple-50/60 rounded-xl border border-slate-200/90 hover:border-purple-300 transition-all cursor-pointer shadow-2xs group flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 group-hover:text-purple-700 truncate">
                              {tch.name}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 rounded font-semibold">
                              {tch.employeeId}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 truncate">
                            {tch.specialization ? `Specialization: ${tch.specialization}` : tch.email}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Item Quick Action Drawer / Footer */}
        {selectedItem && (
          <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold shrink-0">
                {selectedItem.type === 'student' && <GraduationCap className="w-5 h-5 text-indigo-600" />}
                {selectedItem.type === 'class' && <School className="w-5 h-5 text-emerald-600" />}
                {selectedItem.type === 'teacher' && <User className="w-5 h-5 text-purple-600" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {selectedItem.type === 'student' && `${selectedItem.data.firstName} ${selectedItem.data.lastName} (${selectedItem.data.studentCode})`}
                  {selectedItem.type === 'class' && `${selectedItem.data.name} ${selectedItem.data.section ? `• ${selectedItem.data.section}` : ''}`}
                  {selectedItem.type === 'teacher' && `${selectedItem.data.name} (${selectedItem.data.employeeId})`}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {selectedItem.type === 'student' && `Class: ${selectedItem.data.className || 'Unassigned'} • Status: ${selectedItem.data.status}`}
                  {selectedItem.type === 'class' && `Enrolled: ${selectedItem.data.studentCount} students • Capacity: ${selectedItem.data.capacity}`}
                  {selectedItem.type === 'teacher' && `${selectedItem.data.email} • ${selectedItem.data.specialization || 'Teacher'}`}
                </p>
              </div>
            </div>

            {/* Action Navigation Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedItem.type === 'student' && (
                <>
                  <button
                    onClick={() => {
                      onClose();
                      openStudentProfile(selectedItem.data.id);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>View Student Profile</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onNavigate('results');
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Assessments
                  </button>
                </>
              )}
              {selectedItem.type === 'class' && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigate('classes');
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Open Class & Syllabus</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {selectedItem.type === 'teacher' && (
                <button
                  onClick={() => {
                    onClose();
                    openTeacherProfile(selectedItem.data.id);
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>View Faculty Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
