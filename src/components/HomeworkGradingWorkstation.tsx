import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Award,
  BookOpen,
  FileText,
  Zap,
  Check,
  Search,
  Filter,
  RefreshCw,
  UserX,
  Sparkles,
  HelpCircle,
  Copy,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useProfileModal } from '../context/ProfileModalContext.tsx';

interface StudentSubmission {
  studentId: number;
  studentCode: string;
  firstName: string;
  lastName: string;
  gender?: string;
  hasSubmitted: boolean;
  submission: {
    id: number;
    submissionText: string;
    status: 'submitted' | 'graded';
    score: number | null;
    feedback: string | null;
    submittedAt: string;
    gradedAt: string | null;
  } | null;
}

interface HomeworkDetail {
  id: number;
  title: string;
  description: string;
  classId: number;
  className: string;
  classSection?: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherId: number;
  dueDate: string;
  maxMarks: number;
  status: string;
  createdAt: string;
  students: StudentSubmission[];
}

interface HomeworkGradingWorkstationProps {
  homeworkId: number;
  onBack: () => void;
  onHomeworkUpdated: () => void;
}

const QUICK_FEEDBACK_PRESETS = [
  '• Excellent and thorough step-by-step working.',
  '• Well articulated answers with strong comprehension.',
  '• Good attempt; please double-check calculation steps.',
  '• Please ensure all equations and intermediate steps are shown.',
  '• Incomplete submission; please review the missing parts.',
  '• Great improvement and clear presentation.',
];

export const HomeworkGradingWorkstation: React.FC<HomeworkGradingWorkstationProps> = ({
  homeworkId,
  onBack,
  onHomeworkUpdated,
}) => {
  const { openStudentProfile } = useProfileModal();
  const [detail, setDetail] = useState<HomeworkDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Grading form state
  const [score, setScore] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // UI Filter & Search
  const [filterType, setFilterType] = useState<'all' | 'needs_grading' | 'graded' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPromptAccordion, setShowPromptAccordion] = useState<boolean>(false);

  // Touch swipe gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const populateGradingFields = (st: StudentSubmission | undefined) => {
    if (!st || !st.submission) {
      setScore('');
      setFeedback('');
      return;
    }
    setScore(st.submission.score !== null && st.submission.score !== undefined ? String(st.submission.score) : '');
    setFeedback(st.submission.feedback || '');
  };

  // Load homework details
  const loadDetail = useCallback(async (preserveIndexStudentId?: number) => {
    try {
      setLoading(true);
      const data = await apiRequest<HomeworkDetail>(`/homework/${homeworkId}`);
      setDetail(data);

      if (data.students && data.students.length > 0) {
        if (preserveIndexStudentId) {
          const idx = data.students.findIndex((s) => s.studentId === preserveIndexStudentId);
          if (idx !== -1) {
            setCurrentIndex(idx);
            populateGradingFields(data.students[idx]);
            return;
          }
        }
        // Default to first student needing grading, or student 0
        const firstUngraded = data.students.findIndex(
          (s) => s.hasSubmitted && s.submission?.status !== 'graded'
        );
        const targetIdx = firstUngraded !== -1 ? firstUngraded : 0;
        setCurrentIndex(targetIdx);
        populateGradingFields(data.students[targetIdx]);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load assignment submissions');
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const studentList = detail?.students || [];

  // Filtered list for student drawer / jump navigation
  const filteredStudents = studentList.filter((st) => {
    const fullName = `${st.firstName} ${st.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || st.studentCode.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'needs_grading') return st.hasSubmitted && st.submission?.status !== 'graded';
    if (filterType === 'graded') return st.submission?.status === 'graded';
    if (filterType === 'missing') return !st.hasSubmitted;
    return true;
  });

  const currentStudent: StudentSubmission | undefined = studentList[currentIndex];

  const handleSelectStudentByIndex = (index: number) => {
    if (index >= 0 && index < studentList.length) {
      setCurrentIndex(index);
      populateGradingFields(studentList[index]);
      setSaveSuccessMsg(null);
    }
  };

  const handleSelectStudentById = (studentId: number) => {
    const idx = studentList.findIndex((s) => s.studentId === studentId);
    if (idx !== -1) {
      handleSelectStudentByIndex(idx);
    }
  };

  // Navigation handlers
  const handlePrevStudent = () => {
    if (currentIndex > 0) {
      handleSelectStudentByIndex(currentIndex - 1);
    }
  };

  const handleNextStudent = () => {
    if (currentIndex < studentList.length - 1) {
      handleSelectStudentByIndex(currentIndex + 1);
    }
  };

  const handleJumpToNextUngraded = () => {
    if (!detail) return;
    const len = studentList.length;
    for (let i = 1; i < len; i++) {
      const idx = (currentIndex + i) % len;
      const st = studentList[idx];
      if (st.hasSubmitted && st.submission?.status !== 'graded') {
        handleSelectStudentByIndex(idx);
        return;
      }
    }
    alert('All submitted assignments for this class are already marked!');
  };

  // Save grade function
  const handleSaveGrade = async (andNext: boolean = false) => {
    if (!detail || !currentStudent || !currentStudent.submission) return;
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0 || numScore > detail.maxMarks) {
      alert(`Please enter a valid score between 0 and ${detail.maxMarks}.`);
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest(`/homework/${detail.id}/grade`, {
        method: 'POST',
        body: JSON.stringify({
          submissionId: currentStudent.submission.id,
          score: numScore,
          feedback: feedback.trim(),
        }),
      });

      setSaveSuccessMsg(`Grade saved for ${currentStudent.firstName} ${currentStudent.lastName} (${numScore}/${detail.maxMarks})`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      onHomeworkUpdated();

      // Refresh data
      const updated = await apiRequest<HomeworkDetail>(`/homework/${homeworkId}`);
      setDetail(updated);

      if (andNext) {
        const currentId = currentStudent.studentId;
        const currentIdxInUpdated = updated.students.findIndex((s) => s.studentId === currentId);
        
        let nextIdx = -1;
        const total = updated.students.length;
        for (let i = 1; i < total; i++) {
          const testIdx = (currentIdxInUpdated + i) % total;
          if (updated.students[testIdx].hasSubmitted && updated.students[testIdx].submission?.status !== 'graded') {
            nextIdx = testIdx;
            break;
          }
        }

        if (nextIdx !== -1) {
          setCurrentIndex(nextIdx);
          populateGradingFields(updated.students[nextIdx]);
        } else if (currentIdxInUpdated < total - 1) {
          setCurrentIndex(currentIdxInUpdated + 1);
          populateGradingFields(updated.students[currentIdxInUpdated + 1]);
        } else {
          setCurrentIndex(currentIdxInUpdated);
          populateGradingFields(updated.students[currentIdxInUpdated]);
        }
      } else {
        const updatedCurrent = updated.students.find((s) => s.studentId === currentStudent.studentId);
        if (updatedCurrent) {
          populateGradingFields(updatedCurrent);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save grade');
    } finally {
      setSubmitting(false);
    }
  };

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 60;
    if (distance > minSwipeDistance) {
      handleNextStudent();
    } else if (distance < -minSwipeDistance) {
      handlePrevStudent();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSaveGrade(true);
        return;
      }

      if (!isInputActive) {
        if (e.key === 'ArrowRight' || e.key === 'j') {
          e.preventDefault();
          handleNextStudent();
        } else if (e.key === 'ArrowLeft' || e.key === 'k') {
          e.preventDefault();
          handlePrevStudent();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, studentList, detail, score, feedback, currentStudent]);

  // Copy student answer to clipboard
  const handleCopyAnswer = () => {
    if (currentStudent?.submission?.submissionText) {
      navigator.clipboard.writeText(currentStudent.submission.submissionText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  if (loading || !detail) {
    return (
      <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200/80 max-w-5xl mx-auto my-8">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
        <p className="font-semibold text-slate-800 text-sm">Opening Grading Workstation...</p>
        <p className="text-xs text-slate-400 mt-1">Preparing student submissions, class roster, and marking rubrics.</p>
      </div>
    );
  }

  const totalStudents = studentList.length;
  const submittedCount = studentList.filter((s) => s.hasSubmitted).length;
  const gradedCount = studentList.filter((s) => s.submission?.status === 'graded').length;
  const pendingCount = submittedCount - gradedCount;
  const missingCount = totalStudents - submittedCount;
  const progressPercent = totalStudents > 0 ? Math.round((gradedCount / totalStudents) * 100) : 0;

  const numScore = parseFloat(score);
  const isValidScore = !isNaN(numScore) && numScore >= 0 && numScore <= detail.maxMarks;
  const currentPercentage = isValidScore ? Math.round((numScore / detail.maxMarks) * 100) : null;

  const getLetterGrade = (pct: number | null) => {
    if (pct === null) return '';
    if (pct >= 70) return 'Grade A (Excellent)';
    if (pct >= 60) return 'Grade B (Very Good)';
    if (pct >= 50) return 'Grade C (Credit)';
    if (pct >= 40) return 'Grade D (Pass)';
    return 'Grade F (Needs Support)';
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="space-y-4 max-w-7xl mx-auto pb-12"
    >
      {/* Top Workstation Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
              title="Return to Assignments list"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                  {detail.subjectName} ({detail.subjectCode})
                </span>
                <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                  {detail.className} {detail.classSection ? `• ${detail.classSection}` : ''}
                </span>
                <span className="text-xs text-slate-400">
                  Due: {new Date(detail.dueDate).toLocaleDateString()}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                {detail.title}
              </h2>
            </div>
          </div>

          {/* Quick Metrics & Next Ungraded CTA */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs">
              <span className="text-slate-500 font-medium">Grading Progress:</span>
              <span className="font-bold text-slate-900">{gradedCount} / {totalStudents}</span>
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                {progressPercent}%
              </span>
            </div>

            {pendingCount > 0 && (
              <button
                onClick={handleJumpToNextUngraded}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                title="Jump directly to the next student awaiting grading"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>Jump to Next Ungraded ({pendingCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden flex">
          <div
            className="bg-emerald-500 h-1.5 transition-all duration-300"
            style={{ width: `${totalStudents > 0 ? (gradedCount / totalStudents) * 100 : 0}%` }}
            title={`Graded: ${gradedCount}`}
          />
          <div
            className="bg-amber-400 h-1.5 transition-all duration-300"
            style={{ width: `${totalStudents > 0 ? (pendingCount / totalStudents) * 100 : 0}%` }}
            title={`Pending: ${pendingCount}`}
          />
        </div>
      </div>

      {/* Swipe & Student Carousel Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Swiper Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevStudent}
              disabled={currentIndex === 0}
              className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Previous Student (Swipe Right or Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <span className="text-xs font-bold text-slate-800 px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg">
              Student {currentIndex + 1} of {totalStudents}
            </span>
            <button
              onClick={handleNextStudent}
              disabled={currentIndex === totalStudents - 1}
              className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Next Student (Swipe Left or Right Arrow)"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-400 hidden md:inline ml-2">
              (Tip: Swipe or press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">←</kbd> / <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono">→</kbd> to swipe between students)
            </span>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Find student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500 w-32 sm:w-44"
              />
            </div>
            <select
              value={filterType}
              onChange={(e: any) => setFilterType(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">All ({totalStudents})</option>
              <option value="needs_grading">Needs Grade ({pendingCount})</option>
              <option value="graded">Graded ({gradedCount})</option>
              <option value="missing">Not Submitted ({missingCount})</option>
            </select>
          </div>
        </div>

        {/* Horizontal Student Pills Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pt-3 pb-1 scrollbar-thin">
          {filteredStudents.map((st) => {
            const isSelected = currentStudent?.studentId === st.studentId;
            const sub = st.submission;
            return (
              <button
                key={st.studentId}
                onClick={() => handleSelectStudentById(st.studentId)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>{st.firstName} {st.lastName.charAt(0)}.</span>
                {sub?.status === 'graded' ? (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      isSelected ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {sub.score}/{detail.maxMarks}
                  </span>
                ) : sub ? (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      isSelected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    To Grade
                  </span>
                ) : (
                  <span className={`text-[10px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                    Missing
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save Success Alert Notification */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
          <span className="text-[10px] text-emerald-700">Auto-saved to grade book</span>
        </div>
      )}

      {/* Assignment Original Questions Reference Accordion */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowPromptAccordion(!showPromptAccordion)}
          className="w-full px-5 py-3 bg-slate-50/80 hover:bg-slate-100 text-left flex items-center justify-between text-xs font-bold text-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Assignment Instructions & Reference Questions (Click to {showPromptAccordion ? 'Collapse' : 'Expand'})</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-semibold">
            {showPromptAccordion ? 'Hide Questions ↑' : 'View Questions ↓'}
          </span>
        </button>
        {showPromptAccordion && (
          <div className="p-5 border-t border-slate-200 bg-white text-xs leading-relaxed text-slate-800 font-mono whitespace-pre-line">
            {detail.description}
          </div>
        )}
      </div>

      {/* Main Two-Column Full-Page Grading Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Student Submission & Profile (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => currentStudent && openStudentProfile(currentStudent.studentId)}
              title="Click to view full student profile"
            >
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 font-bold text-base flex items-center justify-center border border-indigo-200 shrink-0 group-hover:scale-105 group-hover:bg-indigo-200 transition-all">
                {currentStudent ? `${currentStudent.firstName[0]}${currentStudent.lastName[0]}` : '--'}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 group-hover:underline transition-colors">
                  {currentStudent ? `${currentStudent.firstName} ${currentStudent.lastName}` : 'No student selected'}
                </h3>
                <p className="text-xs text-slate-500">
                  Student ID: <span className="font-mono font-semibold text-slate-700">{currentStudent?.studentCode}</span>
                  {currentStudent?.gender && ` • ${currentStudent.gender}`}
                  <span className="text-[10px] text-indigo-600 ml-2 font-medium">View Full Profile →</span>
                </p>
              </div>
            </div>

            <div>
              {currentStudent?.submission?.status === 'graded' ? (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Graded ({currentStudent.submission.score} / {detail.maxMarks})</span>
                </div>
              ) : currentStudent?.hasSubmitted ? (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Awaiting Marking</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold">
                  <UserX className="w-4 h-4 text-rose-500" />
                  <span>No Submission</span>
                </div>
              )}
            </div>
          </div>

          {!currentStudent ? (
            <div className="p-12 text-center text-slate-400 text-xs">No student selected.</div>
          ) : !currentStudent.hasSubmitted || !currentStudent.submission ? (
            <div className="p-12 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-300 space-y-3">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="font-bold text-slate-700 text-sm">
                  {currentStudent.firstName} {currentStudent.lastName} has not submitted this homework yet.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  The student can complete and upload answers via their Student Portal.
                </p>
              </div>
              <button
                onClick={handleNextStudent}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Skip to Next Student →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Student's Submitted Work & Answers</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Submitted {new Date(currentStudent.submission.submittedAt).toLocaleString()}
                  </span>
                  <button
                    onClick={handleCopyAnswer}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Copy student answer"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 sm:p-5 rounded-2xl border border-slate-800 font-mono text-xs leading-relaxed whitespace-pre-line min-h-[320px] max-h-[550px] overflow-y-auto selection:bg-indigo-500 selection:text-white">
                {currentStudent.submission.submissionText}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Teacher Grading & Feedback Console (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Assessment & Marking Console</span>
            </h3>
            <span className="text-[11px] text-slate-500">Max: <strong>{detail.maxMarks} Marks</strong></span>
          </div>

          {!currentStudent || !currentStudent.submission ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2">
              <p className="font-semibold text-slate-700">Grading Unavailable</p>
              <p className="text-slate-400">
                Grading is only accessible once the student submits their homework.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="grade-score-input" className="font-bold text-slate-800 text-xs">
                    Score / Marks (out of {detail.maxMarks}) *
                  </label>
                  {isValidScore && (
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                      {currentPercentage}% • {getLetterGrade(currentPercentage)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="grade-score-input"
                    type="number"
                    step="0.5"
                    min="0"
                    max={detail.maxMarks}
                    required
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder={`0 - ${detail.maxMarks}`}
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-extrabold text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs"
                  />
                  <span className="text-slate-500 font-bold text-sm">/ {detail.maxMarks}</span>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Quick Score Presets
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[100, 90, 80, 75, 50, 0].map((pct) => {
                      const val = (detail.maxMarks * (pct / 100)).toString();
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setScore(val)}
                          className="px-2.5 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                        >
                          {pct}% ({val})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-800 font-bold text-xs">
                  Teacher's Written Feedback & Remarks
                </label>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Click to Insert Remark
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_FEEDBACK_PRESETS.map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setFeedback((prev) => (prev ? `${prev}\n${preset}` : preset));
                        }}
                        className="text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-2 py-1 rounded-md border border-slate-200 transition-colors cursor-pointer text-left truncate max-w-xs"
                        title={preset}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  placeholder="Provide personalized commentary, encouragement, and corrections for the student..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 text-xs leading-relaxed"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSaveGrade(true)}
                  disabled={submitting || !score}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Save Grade & Next Student →</span>
                    </>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveGrade(false)}
                    disabled={submitting || !score}
                    className="w-1/2 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-semibold rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Save & Stay Here
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStudent}
                    disabled={currentIndex === totalStudents - 1}
                    className="w-1/2 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-semibold rounded-xl transition-colors cursor-pointer text-xs flex items-center justify-center gap-1"
                  >
                    <span>Skip Student</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center pt-1">
                  Shortcut: Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono">Ctrl+Enter</kbd> / <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono">⌘+Enter</kbd> to save and advance.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
