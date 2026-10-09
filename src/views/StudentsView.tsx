import React, { useState, useEffect, useMemo } from 'react';
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
  Edit2,
  CheckSquare,
  Square,
  RefreshCw,
  ArrowRightLeft,
  X,
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
  firstName?: string;
  lastName?: string;
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

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bulk Class Transfer Modal
  const [showBulkClassModal, setShowBulkClassModal] = useState(false);
  const [targetBulkClassId, setTargetBulkClassId] = useState<string>('');

  // Individual Student Edit Modal State
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    gender: 'Male',
    classId: '',
    status: 'active' as 'active' | 'suspended' | 'pending',
    dateOfBirth: '',
    emergencyContact: '',
    address: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
        firstName: st.firstName,
        lastName: st.lastName,
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
      if (classesRes && classesRes.length > 0) {
        if (!newStudent.classId) setNewStudent((prev) => ({ ...prev, classId: String(classesRes[0].id) }));
        if (!targetBulkClassId) setTargetBulkClassId(String(classesRes[0].id));
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

  // Selection handlers
  const toggleSelectStudent = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk Actions
  const handleBulkStatusUpdate = async (newStatus: 'active' | 'suspended') => {
    if (selectedIds.size === 0) return;
    try {
      setBulkActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await apiRequest<any>('/students/bulk-update', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          status: newStatus,
        }),
      });

      setActionSuccess(`Successfully updated status to "${newStatus}" for ${res.updatedCount || selectedIds.size} student(s).`);
      setTimeout(() => setActionSuccess(null), 4000);
      clearSelection();
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update student statuses.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkClassReassign = async () => {
    if (selectedIds.size === 0 || !targetBulkClassId) return;
    try {
      setBulkActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await apiRequest<any>('/students/bulk-update', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          classId: parseInt(targetBulkClassId, 10),
        }),
      });

      const targetClass = classes.find((c) => String(c.id) === targetBulkClassId);
      setActionSuccess(`Successfully moved ${res.updatedCount || selectedIds.size} student(s) to ${targetClass?.name || 'new class'}.`);
      setTimeout(() => setActionSuccess(null), 4000);
      setShowBulkClassModal(false);
      clearSelection();
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reassign students to selected class.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Open Individual Edit Modal
  const openEditModal = (st: StudentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const nameParts = (st.fullName || '').split(' ');
    const fName = st.firstName || nameParts[0] || '';
    const lName = st.lastName || nameParts.slice(1).join(' ') || '';

    setEditingStudent(st);
    setEditForm({
      firstName: fName,
      lastName: lName,
      gender: st.gender || 'Male',
      classId: st.classId ? String(st.classId) : '',
      status: st.status || 'active',
      dateOfBirth: st.dateOfBirth || '',
      emergencyContact: st.emergencyContactName || '',
      address: st.address || '',
    });
    setEditError(null);
  };

  const handleSaveIndividualEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    try {
      setEditLoading(true);
      setEditError(null);

      await apiRequest(`/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          gender: editForm.gender,
          classId: editForm.classId ? parseInt(editForm.classId, 10) : null,
          status: editForm.status,
          dateOfBirth: editForm.dateOfBirth || undefined,
          emergencyContact: editForm.emergencyContact.trim() || undefined,
          address: editForm.address.trim() || undefined,
        }),
      });

      setActionSuccess(`Student record for ${editForm.firstName} ${editForm.lastName} updated successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
      setEditingStudent(null);
      await loadData();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update student record.');
    } finally {
      setEditLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        s.fullName?.toLowerCase().includes(q) ||
        s.studentCode?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q);

      const matchesClass =
        selectedClassFilter === 'all' ||
        (s.classId !== null && String(s.classId) === selectedClassFilter);

      const matchesStatus =
        selectedStatusFilter === 'all' || s.status === selectedStatusFilter;

      return matchesSearch && matchesClass && matchesStatus;
    });
  }, [students, searchQuery, selectedClassFilter, selectedStatusFilter]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClassFilter, selectedStatusFilter]);

  const isAllSelected = filteredStudents.length > 0 && selectedIds.size === filteredStudents.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < filteredStudents.length;

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

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            {actionError}
          </span>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Bar (Visible when 1+ students are selected) */}
      {isSuperAdmin && selectedIds.size > 0 && (
        <div className="sticky top-16 z-20 bg-purple-900 text-white rounded-2xl p-3 sm:p-4 shadow-xl border border-purple-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xs">
              {selectedIds.size}
            </span>
            <div>
              <p className="text-xs sm:text-sm font-bold leading-tight">
                {selectedIds.size} student{selectedIds.size > 1 ? 's' : ''} selected
              </p>
              <p className="text-[11px] text-purple-200 hidden sm:block">
                Choose an action below to update all selected students simultaneously
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleBulkStatusUpdate('active')}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Mark Active</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkStatusUpdate('suspended')}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Suspend</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBulkClassModal(true)}
              disabled={bulkActionLoading}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Move Class</span>
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkActionLoading}
              className="p-1.5 text-purple-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Deselect all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
                  {isSuperAdmin && (
                    <th className="py-3 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllFiltered}
                        className="text-slate-400 hover:text-purple-600 cursor-pointer flex items-center justify-center mx-auto"
                        title={isAllSelected ? 'Deselect all' : 'Select all filtered'}
                      >
                        {isAllSelected ? (
                          <CheckSquare className="w-4 h-4 text-purple-600" />
                        ) : isPartiallySelected ? (
                          <div className="w-4 h-4 bg-purple-100 border border-purple-600 rounded flex items-center justify-center">
                            <div className="w-2 h-0.5 bg-purple-600" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
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
                {paginatedStudents.map((st) => {
                  const isSelected = selectedIds.has(st.id);
                  return (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                        isSelected ? 'bg-purple-50/60' : ''
                      }`}
                      onClick={() => openStudentProfile(st.id)}
                    >
                      {isSuperAdmin && (
                        <td
                          className="py-3 px-3 w-10 text-center"
                          onClick={(e) => toggleSelectStudent(st.id, e)}
                        >
                          <button
                            type="button"
                            className="cursor-pointer text-slate-400 hover:text-purple-600 flex items-center justify-center mx-auto"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-purple-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      )}
                      <td className="py-3 px-4 font-mono font-bold text-xs text-purple-700">
                        {st.studentCode}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {st.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="truncate block">{st.fullName}</span>
                            {st.email && (
                              <p className="text-[11px] text-slate-400 font-normal truncate">{st.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium text-xs text-slate-700 border border-slate-200/60 whitespace-nowrap">
                          {st.className || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{st.gender}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          status={st.status === 'active' ? 'success' : 'danger'}
                          label={st.status.toUpperCase()}
                        />
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {st.emergencyContactName ? (
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{st.emergencyContactName}</p>
                            <p className="text-slate-400 truncate">{st.emergencyContactPhone || 'No phone'}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">None linked</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={(e) => openEditModal(st, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer inline-flex items-center gap-1 text-xs font-semibold"
                              title="Edit Student Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline">Edit</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openStudentProfile(st.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer inline-flex items-center gap-1 text-xs font-semibold"
                            title="View Student Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Profile</span>
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
