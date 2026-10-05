import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  GraduationCap,
  Mail,
  Phone,
  Calendar,
  ChevronRight,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Shield,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Badge, getStatusBadge } from '../components/Badge.tsx';
import { Modal } from '../components/Modal.tsx';
import { DatePicker } from '../components/DatePicker.tsx';
import { useProfileModal, NameLink } from '../context/ProfileModalContext.tsx';
import { ClassItem } from '../types.ts';

interface StudentItem {
  id: number;
  userId: number;
  studentCode: string;
  fullName: string;
  email: string;
  classId: number | null;
  className?: string;
  gender: string;
  dateOfBirth?: string;
  status: 'active' | 'suspended' | 'pending';
  admissionDate?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export const StudentsView: React.FC = () => {
  const { user } = useAuth();
  const { openStudentProfile } = useProfileModal();
  const isSuperAdmin = user?.role === 'super_admin' || user?.permissions?.includes('admissions_management');
  const isTeacher = user?.role === 'teacher';

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    email: '',
    gender: 'Male',
    dateOfBirth: '2012-05-15',
    classId: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsRes, classesRes] = await Promise.all([
        apiRequest<any>('/students?all=true'),
        apiRequest<ClassItem[]>('/classes'),
      ]);
      const rawList = Array.isArray(studentsRes) ? studentsRes : studentsRes?.data || [];
      const mappedList: StudentItem[] = rawList.map((st: any) => ({
        id: st.id,
        userId: st.userId,
        studentCode: st.studentCode || st.studentId,
        fullName: st.fullName || `${st.firstName || ''} ${st.lastName || ''}`.trim(),
        email: st.email || '',
        classId: st.classId,
        className: st.className,
        gender: st.gender || 'Not specified',
        dateOfBirth: st.dateOfBirth,
        status: st.status || 'active',
        admissionDate: st.admissionDate,
        address: st.address,
        emergencyContactName: st.emergencyContactName || st.emergencyContact,
        emergencyContactPhone: st.emergencyContactPhone || '',
      }));
      setStudents(mappedList);
      setClasses(classesRes || []);
      if (classesRes && classesRes.length > 0 && !newStudent.classId) {
        setNewStudent((prev) => ({ ...prev, classId: String(classesRes[0].id) }));
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);

    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          firstName: newStudent.firstName,
          lastName: newStudent.lastName,
          email: newStudent.email || undefined,
          gender: newStudent.gender,
          dateOfBirth: newStudent.dateOfBirth,
          classId: newStudent.classId ? parseInt(newStudent.classId) : undefined,
          emergencyContactName: newStudent.guardianName,
          emergencyContactPhone: newStudent.guardianPhone,
          parentEmail: newStudent.guardianEmail || undefined,
        }),
      });

      setShowAddModal(false);
      setNewStudent({
        firstName: '',
        lastName: '',
        email: '',
        gender: 'Male',
        dateOfBirth: '2012-05-15',
        classId: classes[0] ? String(classes[0].id) : '',
        guardianName: '',
        guardianEmail: '',
        guardianPhone: '',
      });
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to enroll student');
    } finally {
      setCreating(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesClass =
      selectedClassFilter === 'all' ||
      (s.classId !== null && String(s.classId) === selectedClassFilter);

    const matchesStatus =
      selectedStatusFilter === 'all' || s.status === selectedStatusFilter;

    return matchesSearch && matchesClass && matchesStatus;
  });

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClassFilter, selectedStatusFilter]);

  return (
    <div className="space-y-6">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            <span>Student Directory</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Total {students.length} students enrolled across all academic grades
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enroll New Student</span>
          </button>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, student ID or email..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading student directory...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-medium text-slate-700">No students found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or class filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Gender</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Emergency Contact</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudents.map((st) => (
                  <tr
                    key={st.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => openStudentProfile(st.id)}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-xs text-purple-700">
                      {st.studentCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                          {st.fullName.charAt(0)}
                        </div>
                        <div>
                          <span>{st.fullName}</span>
                          {st.email && (
                            <p className="text-[11px] text-slate-400 font-normal">{st.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium text-xs text-slate-700 border border-slate-200/60">
                        {st.className || 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{st.gender}</td>
                    <td className="py-3 px-4">
                      <Badge
                        status={st.status === 'active' ? 'success' : 'danger'}
                        label={st.status.toUpperCase()}
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {st.emergencyContactName ? (
                        <div>
                          <p className="font-medium text-slate-800">{st.emergencyContactName}</p>
                          <p className="text-slate-400">{st.emergencyContactPhone || 'No phone'}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">None linked</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openStudentProfile(st.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer inline-flex items-center gap-1 text-xs font-semibold"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden sm:inline">Profile</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && filteredStudents.length > 0 && (
          <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-slate-800">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
                <strong className="text-slate-800">{Math.min(currentPage * pageSize, filteredStudents.length)}</strong> of{' '}
                <strong className="text-slate-800">{filteredStudents.length}</strong> students
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="ml-2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={500}>All (500)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Previous
              </button>
              <div className="flex items-center gap-1 px-2 font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </div>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Enroll New Student"
      >
        <form onSubmit={handleCreateStudent} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={newStudent.firstName}
                onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                placeholder="e.g. Samuel"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={newStudent.lastName}
                onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                placeholder="e.g. Adebayo"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Class *</label>
              <select
                value={newStudent.classId}
                onChange={(e) => setNewStudent({ ...newStudent, classId: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
              <select
                value={newStudent.gender}
                onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
            <DatePicker
              value={newStudent.dateOfBirth}
              onChange={(val) => setNewStudent({ ...newStudent, dateOfBirth: val })}
              placeholder="Select date of birth..."
              minYear={1970}
              maxYear={new Date().getFullYear()}
              theme="light"
            />
          </div>

          <div className="border-t border-slate-200 pt-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Guardian Details (Optional)
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Guardian Full Name</label>
                <input
                  type="text"
                  value={newStudent.guardianName}
                  onChange={(e) => setNewStudent({ ...newStudent, guardianName: e.target.value })}
                  placeholder="e.g. Dr. Kolawole Adebayo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Guardian Phone</label>
                  <input
                    type="tel"
                    value={newStudent.guardianPhone}
                    onChange={(e) => setNewStudent({ ...newStudent, guardianPhone: e.target.value })}
                    placeholder="+234 803 123 4567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Guardian Email</label>
                  <input
                    type="email"
                    value={newStudent.guardianEmail}
                    onChange={(e) => setNewStudent({ ...newStudent, guardianEmail: e.target.value })}
                    placeholder="parent@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer"
            >
              {creating ? 'Enrolling...' : 'Complete Enrollment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
