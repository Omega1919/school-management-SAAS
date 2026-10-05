import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  BookOpen,
  Send,
  Award,
  ChevronRight,
  Filter,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';
import { Badge } from '../components/Badge.tsx';
import { HomeworkGradingWorkstation } from '../components/HomeworkGradingWorkstation.tsx';
import { ClassItem } from '../types.ts';

interface HomeworkItem {
  id: number;
  title: string;
  description: string;
  className: string;
  subjectName: string;
  teacherName: string;
  dueDate: string;
  maxMarks: number;
  submissionCount?: number;
  totalStudents?: number;
  mySubmission?: any;
}

export const HomeworkView: React.FC = () => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher' || user?.role === 'super_admin';
  const isStudent = user?.role === 'student';

  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active workstation grading
  const [gradingHomeworkId, setGradingHomeworkId] = useState<number | null>(null);

  // Submission modal for student
  const [submittingHw, setSubmittingHw] = useState<HomeworkItem | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create Homework modal for teacher
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newHw, setNewHw] = useState({
    title: '',
    description: '',
    classId: '',
    subjectId: '',
    dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    maxMarks: '20',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [hwRes, classesRes, subjectsRes] = await Promise.all([
        apiRequest<HomeworkItem[]>('/homework'),
        apiRequest<ClassItem[]>('/classes'),
        apiRequest<any[]>('/academic/subjects'),
      ]);
      setHomeworkList(hwRes || []);
      setClasses(classesRes || []);
      setSubjects(subjectsRes || []);
      if (classesRes && classesRes.length > 0) {
        setNewHw((prev) => ({
          ...prev,
          classId: String(classesRes[0].id),
          subjectId: subjectsRes && subjectsRes[0] ? String(subjectsRes[0].id) : '',
        }));
      }
    } catch (err) {
      console.error('Error fetching homework:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiRequest('/homework', {
        method: 'POST',
        body: JSON.stringify({
          title: newHw.title,
          description: newHw.description,
          classId: parseInt(newHw.classId),
          subjectId: parseInt(newHw.subjectId),
          dueDate: newHw.dueDate,
          maxMarks: parseInt(newHw.maxMarks),
        }),
      });
      setShowCreateModal(false);
      setNewHw({
        title: '',
        description: '',
        classId: classes[0] ? String(classes[0].id) : '',
        subjectId: subjects[0] ? String(subjects[0].id) : '',
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        maxMarks: '20',
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create homework');
    } finally {
      setCreating(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingHw) return;
    setSubmitting(true);
    try {
      await apiRequest(`/homework/${submittingHw.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content: submissionText }),
      });
      setSubmittingHw(null);
      setSubmissionText('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (gradingHomeworkId !== null) {
    return (
      <HomeworkGradingWorkstation
        homeworkId={gradingHomeworkId}
        onBack={() => {
          setGradingHomeworkId(null);
          loadData();
        }}
        onHomeworkUpdated={() => loadData()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-600" />
            <span>Homework & Coursework</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isTeacher
              ? 'Assign exercises, track class submissions, and grade answers'
              : 'Complete your assigned tasks and submit your solutions on time'}
          </p>
        </div>

        {isTeacher && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Assign New Homework</span>
          </button>
        )}
      </div>

      {/* Homework List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading assignments...</p>
        </div>
      ) : homeworkList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center text-slate-500">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-base font-semibold text-slate-700">No active homework assignments</p>
          <p className="text-xs text-slate-400 mt-1">
            {isTeacher ? 'Click Assign New Homework to create one.' : 'All caught up! No homework due.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {homeworkList.map((hw) => {
            const isDueSoon = new Date(hw.dueDate).getTime() - Date.now() < 86400000 * 2;
            return (
              <div
                key={hw.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-bold text-xs border border-purple-200/60">
                        {hw.className}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold text-xs border border-indigo-200/60">
                        {hw.subjectName}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isDueSoon
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>Due: {new Date(hw.dueDate).toLocaleDateString()}</span>
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mt-2">{hw.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">
                    {hw.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="font-semibold text-slate-700">Max Marks: {hw.maxMarks}</span>
                    <span>•</span>
                    <span>Teacher: {hw.teacherName}</span>
                  </div>

                  {isTeacher ? (
                    <button
                      onClick={() => setGradingHomeworkId(hw.id)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Grade Submissions</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : isStudent ? (
                    hw.mySubmission ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-xs flex items-center gap-1 border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Submitted</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => setSubmittingHw(hw)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Work</span>
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Homework Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Assign New Homework"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
            <input
              type="text"
              required
              value={newHw.title}
              onChange={(e) => setNewHw({ ...newHw, title: e.target.value })}
              placeholder="e.g. Chapter 4 Quadratic Equations Problem Set"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Class *</label>
              <select
                value={newHw.classId}
                onChange={(e) => setNewHw({ ...newHw, classId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                {classes.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
              <select
                value={newHw.subjectId}
                onChange={(e) => setNewHw({ ...newHw, subjectId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={newHw.dueDate}
                onChange={(e) => setNewHw({ ...newHw, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Marks *</label>
              <input
                type="number"
                required
                value={newHw.maxMarks}
                onChange={(e) => setNewHw({ ...newHw, maxMarks: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions & Questions *</label>
            <textarea
              required
              rows={4}
              value={newHw.description}
              onChange={(e) => setNewHw({ ...newHw, description: e.target.value })}
              placeholder="Provide clear steps, question numbers, and required formatting..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer"
            >
              {creating ? 'Publishing...' : 'Publish Homework'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Submit Modal */}
      <Modal
        isOpen={submittingHw !== null}
        onClose={() => setSubmittingHw(null)}
        title={`Submit Homework: ${submittingHw?.title}`}
      >
        <form onSubmit={handleStudentSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
            {submittingHw?.description}
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Your Answer / Submission Text *
            </label>
            <textarea
              required
              rows={6}
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              placeholder="Type your complete solution or paste coursework link here..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setSubmittingHw(null)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Answers'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
