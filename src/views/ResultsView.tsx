import React, { useState, useEffect } from 'react';
import {
  Award,
  BookOpen,
  Users,
  Search,
  CheckCircle,
  Save,
  Printer,
  ChevronRight,
  TrendingUp,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { ClassItem } from '../types.ts';
import { Badge } from '../components/Badge.tsx';

interface StudentResultEntry {
  studentId: number;
  studentCode: string;
  fullName: string;
  caScore: number;
  examScore: number;
  totalScore: number;
  grade: string;
  remarks: string;
}

export const ResultsView: React.FC = () => {
  const { user } = useAuth();
  const isStaff = user?.role === 'super_admin' || user?.role === 'teacher';

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [entries, setEntries] = useState<StudentResultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedSubjectId) {
      loadResults();
    }
  }, [selectedClassId, selectedSubjectId]);

  const loadMetadata = async () => {
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        apiRequest<ClassItem[]>('/classes'),
        apiRequest<any[]>('/academic/subjects'),
      ]);
      setClasses(classesRes || []);
      setSubjects(subjectsRes || []);
      if (classesRes && classesRes.length > 0) {
        setSelectedClassId(String(classesRes[0].id));
      }
      if (subjectsRes && subjectsRes.length > 0) {
        setSelectedSubjectId(String(subjectsRes[0].id));
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  const loadResults = async () => {
    try {
      setLoading(true);
      setSuccessMsg(null);
      const resRaw = await apiRequest<any>(
        `/results?classId=${selectedClassId}&subjectId=${selectedSubjectId}`
      );
      const res = Array.isArray(resRaw) ? resRaw : Array.isArray(resRaw?.data) ? resRaw.data : [];

      // If students exist in class, map to entries
      const studentsRaw = await apiRequest<any>(`/students?classId=${selectedClassId}`);
      const studentsInClass = Array.isArray(studentsRaw) ? studentsRaw : Array.isArray(studentsRaw?.data) ? studentsRaw.data : [];
      const mapped = studentsInClass.map((st: any) => {
        const existing = res.find((r: any) => r.studentId === st.id);
        const ca = existing?.caScore || 0;
        const exam = existing?.examScore || 0;
        const total = ca + exam;
        return {
          studentId: st.id,
          studentCode: st.studentId || st.studentCode || '',
          fullName: `${st.firstName || ''} ${st.lastName || ''}`.trim() || st.fullName || 'Student',
          caScore: ca,
          examScore: exam,
          totalScore: total,
          grade: computeGrade(total),
          remarks: existing?.remarks || '',
        };
      });
      setEntries(mapped);
    } catch (err) {
      console.error('Failed to load results:', err);
    } finally {
      setLoading(false);
    }
  };

  const computeGrade = (total: number) => {
    if (total >= 75) return 'A1';
    if (total >= 70) return 'B2';
    if (total >= 65) return 'B3';
    if (total >= 60) return 'C4';
    if (total >= 55) return 'C5';
    if (total >= 50) return 'C6';
    if (total >= 45) return 'D7';
    if (total >= 40) return 'E8';
    return 'F9';
  };

  const handleScoreChange = (index: number, field: 'caScore' | 'examScore', val: string) => {
    const num = Math.max(0, Math.min(field === 'caScore' ? 40 : 60, parseInt(val) || 0));
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: num,
      };
      const newTotal =
        (field === 'caScore' ? num : copy[index].caScore) +
        (field === 'examScore' ? num : copy[index].examScore);
      copy[index].totalScore = newTotal;
      copy[index].grade = computeGrade(newTotal);
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      await apiRequest('/results/batch', {
        method: 'POST',
        body: JSON.stringify({
          classId: parseInt(selectedClassId),
          subjectId: parseInt(selectedSubjectId),
          records: entries.map((e) => ({
            studentId: e.studentId,
            caScore: e.caScore,
            examScore: e.examScore,
            remarks: e.remarks,
          })),
        }),
      });
      setSuccessMsg('Academic results successfully recorded and published to student portals!');
    } catch (err: any) {
      alert(err.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-purple-600" />
            <span>Academic Results & Grading</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Record continuous assessment (CA), examination scores, and auto-compute grades
          </p>
        </div>

        {isStaff && entries.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Publishing Scores...' : 'Publish Scores'}</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Selectors Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
            Select Class Section
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
            Select Subject
          </label>
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          >
            {subjects.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading grade book...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Award className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold text-slate-700">No students found in this class</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center">CA / Test (40)</th>
                  <th className="py-3 px-4 text-center">Exam (60)</th>
                  <th className="py-3 px-4 text-center">Total (100)</th>
                  <th className="py-3 px-4 text-center">Grade</th>
                  <th className="py-3 px-4">Teacher Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, idx) => (
                  <tr key={entry.studentId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-xs text-purple-700">
                      {entry.studentCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{entry.fullName}</td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="40"
                        value={entry.caScore}
                        onChange={(e) => handleScoreChange(idx, 'caScore', e.target.value)}
                        className="w-16 py-1 px-2 text-center border border-slate-300 rounded-lg text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={entry.examScore}
                        onChange={(e) => handleScoreChange(idx, 'examScore', e.target.value)}
                        className="w-16 py-1 px-2 text-center border border-slate-300 rounded-lg text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {entry.totalScore}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs ${
                          entry.totalScore >= 70
                            ? 'bg-emerald-100 text-emerald-800'
                            : entry.totalScore >= 50
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {entry.grade}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={entry.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEntries((prev) => {
                            const copy = [...prev];
                            copy[idx].remarks = val;
                            return copy;
                          });
                        }}
                        placeholder="e.g. Excellent conceptual grasp"
                        className="w-full py-1 px-2.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
