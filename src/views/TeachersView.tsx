import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Search,
  Plus,
  Mail,
  Phone,
  BookOpen,
  Award,
  MoreVertical,
  CheckCircle,
  Eye,
  AlertCircle,
  ShieldCheck,
  Send,
  CreditCard,
  Globe,
  Sparkles,
  UserCheck,
  CalendarDays,
  Bell,
  CalendarCheck,
  Sliders,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Badge } from '../components/Badge.tsx';
import { Modal } from '../components/Modal.tsx';
import { useProfileModal } from '../context/ProfileModalContext.tsx';
import { AVAILABLE_STAFF_PERMISSIONS, StaffPermission } from '../types.ts';

interface TeacherItem {
  id: number;
  userId: number;
  teacherCode: string;
  fullName: string;
  email: string;
  phone?: string;
  qualification?: string;
  address?: string;
  status: 'active' | 'suspended';
  permissions?: string[];
  assignedClasses?: string[];
  assignedSubjects?: string[];
}

export const TeachersView: React.FC = () => {
  const { user } = useAuth();
  const { openTeacherProfile } = useProfileModal();
  const isSuperAdmin = user?.role === 'super_admin';

  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Teacher Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delegated Permissions Modal
  const [selectedTeacherForPerms, setSelectedTeacherForPerms] = useState<TeacherItem | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsSuccessMessage, setPermsSuccessMessage] = useState<string | null>(null);
  const [permsErrorMessage, setPermsErrorMessage] = useState<string | null>(null);

  const [newTeacher, setNewTeacher] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    qualification: 'B.Sc Ed (Hons)',
  });

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/teachers');
      const list = Array.isArray(res) ? res : res?.teachers || [];
      const mapped: TeacherItem[] = list.map((t: any) => ({
        id: t.id,
        userId: t.userId,
        teacherCode: t.teacherCode || t.employeeId,
        fullName: t.fullName,
        email: t.email,
        phone: t.phone,
        qualification: t.qualification,
        address: t.address,
        status: t.status || 'active',
        permissions: Array.isArray(t.permissions) ? t.permissions : [],
      }));
      setTeachers(mapped);
    } catch (err) {
      console.error('Error fetching teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      await apiRequest('/teachers/invite', {
        method: 'POST',
        body: JSON.stringify({
          firstName: newTeacher.firstName,
          lastName: newTeacher.lastName,
          email: newTeacher.email,
          phone: newTeacher.phone,
          qualification: newTeacher.qualification,
        }),
      });

      setShowAddModal(false);
      setNewTeacher({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        qualification: 'B.Sc Ed (Hons)',
      });
      await loadTeachers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const openPermissionsModal = (t: TeacherItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTeacherForPerms(t);
    setEditingPermissions([...(t.permissions || [])]);
    setPermsSuccessMessage(null);
    setPermsErrorMessage(null);
  };

  const togglePermission = (permId: string) => {
    setEditingPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const applyPreset = (preset: 'dean' | 'bursar' | 'admissions' | 'all' | 'clear') => {
    switch (preset) {
      case 'dean':
        setEditingPermissions(['class_management', 'timetable_editing', 'grading_management', 'announcements_management']);
        break;
      case 'bursar':
        setEditingPermissions(['fee_management']);
        break;
      case 'admissions':
        setEditingPermissions(['admissions_management', 'public_portal_management', 'visual_page_editor']);
        break;
      case 'all':
        setEditingPermissions(AVAILABLE_STAFF_PERMISSIONS.map((p) => p.id));
        break;
      case 'clear':
        setEditingPermissions([]);
        break;
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedTeacherForPerms) return;
    setSavingPerms(true);
    setPermsErrorMessage(null);
    setPermsSuccessMessage(null);

    try {
      await apiRequest(`/teachers/${selectedTeacherForPerms.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: editingPermissions }),
      });

      setPermsSuccessMessage('Administrative roles & permissions saved successfully.');
      // Update local teacher item
      setTeachers((prev) =>
        prev.map((t) =>
          t.id === selectedTeacherForPerms.id ? { ...t, permissions: editingPermissions } : t
        )
      );

      setTimeout(() => {
        setSelectedTeacherForPerms(null);
      }, 1200);
    } catch (err: any) {
      setPermsErrorMessage(err.message || 'Failed to update delegated admin permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const getPermissionIcon = (iconName: string) => {
    switch (iconName) {
      case 'CreditCard':
        return <CreditCard className="w-4 h-4 text-emerald-600" />;
      case 'Globe':
        return <Globe className="w-4 h-4 text-blue-600" />;
      case 'Sparkles':
        return <Sparkles className="w-4 h-4 text-purple-600" />;
      case 'UserCheck':
        return <UserCheck className="w-4 h-4 text-amber-600" />;
      case 'CalendarDays':
        return <CalendarDays className="w-4 h-4 text-indigo-600" />;
      case 'BookOpen':
        return <BookOpen className="w-4 h-4 text-teal-600" />;
      case 'Award':
        return <Award className="w-4 h-4 text-rose-600" />;
      case 'Bell':
        return <Bell className="w-4 h-4 text-orange-600" />;
      case 'CalendarCheck':
        return <CalendarCheck className="w-4 h-4 text-cyan-600" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-purple-600" />;
    }
  };

  const filtered = teachers.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.fullName?.toLowerCase().includes(q) ||
      t.teacherCode?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.qualification?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-purple-600" />
            <span>Faculty & Staff Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage instructors, class masters, subject allocations, and delegated administrative roles
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add / Invite Teacher</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by teacher name, staff code, email or qualification..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Grid of Teachers */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading faculty members...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-base font-semibold text-slate-700">No teachers found</p>
          <p className="text-xs text-slate-400 mt-1">Try modifying your search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const hasDelegatedRoles = (t.permissions && t.permissions.length > 0);

            return (
              <div
                key={t.id}
                onClick={() => openTeacherProfile(t.id)}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md hover:border-purple-200 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 font-extrabold text-base flex items-center justify-center border border-purple-200">
                        {t.fullName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm group-hover:text-purple-600">
                          {t.fullName}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-purple-600">
                          {t.teacherCode}
                        </p>
                      </div>
                    </div>
                    <Badge
                      status={t.status === 'active' ? 'success' : 'danger'}
                      label={t.status.toUpperCase()}
                    />
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 my-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </div>
                    {t.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{t.phone}</span>
                      </div>
                    )}
                    {t.qualification && (
                      <div className="flex items-center gap-2">
                        <Award className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-700 font-medium">{t.qualification}</span>
                      </div>
                    )}
                  </div>

                  {/* Delegated Admin Roles Preview */}
                  {hasDelegatedRoles && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1 mb-1.5">
                        <ShieldCheck className="w-3 h-3 text-purple-600" />
                        Delegated Admin Roles ({t.permissions!.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {t.permissions!.map((pKey) => {
                          const def = AVAILABLE_STAFF_PERMISSIONS.find((p) => p.id === pKey);
                          if (!def) return null;
                          return (
                            <span
                              key={pKey}
                              className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/80 rounded-md text-[10px] font-semibold flex items-center gap-1"
                              title={def.description}
                            >
                              <span>{def.name}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs mt-3">
                  {isSuperAdmin ? (
                    <button
                      type="button"
                      onClick={(e) => openPermissionsModal(t, e)}
                      className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-purple-200/60"
                      title="Assign or modify admin permissions"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                      <span>Admin Roles</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 font-medium">Faculty Member</span>
                  )}

                  <button
                    type="button"
                    className="text-slate-600 hover:text-purple-600 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Teacher Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Invite / Register Faculty Member"
      >
        <form onSubmit={handleCreateTeacher} className="space-y-4">
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
                value={newTeacher.firstName}
                onChange={(e) => setNewTeacher({ ...newTeacher, firstName: e.target.value })}
                placeholder="e.g. Babatunde"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={newTeacher.lastName}
                onChange={(e) => setNewTeacher({ ...newTeacher, lastName: e.target.value })}
                placeholder="e.g. Adewale"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={newTeacher.email}
              onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
              placeholder="teacher@school.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={newTeacher.phone}
                onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                placeholder="+234 802 345 6789"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qualification</label>
              <input
                type="text"
                value={newTeacher.qualification}
                onChange={(e) => setNewTeacher({ ...newTeacher, qualification: e.target.value })}
                placeholder="B.Sc, PGDE, M.Ed"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
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
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Registering...' : 'Add Faculty Member'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delegated Admin Roles Modal */}
      {selectedTeacherForPerms && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTeacherForPerms(null)}
          title={`Assign Admin Roles: ${selectedTeacherForPerms.fullName}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-extrabold flex items-center justify-center shrink-0">
                  {selectedTeacherForPerms.fullName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{selectedTeacherForPerms.fullName}</h4>
                  <p className="text-xs text-slate-500 font-mono">{selectedTeacherForPerms.teacherCode} • {selectedTeacherForPerms.email}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-purple-200/70 text-purple-900 rounded-lg text-xs font-bold shrink-0">
                {editingPermissions.length} Active Role{editingPermissions.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5">Quick Role Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('dean')}
                  className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  🎓 Academic Dean
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('bursar')}
                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors cursor-pointer"
                >
                  💳 Bursar / Finance
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('admissions')}
                  className="px-2.5 py-1 text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-colors cursor-pointer"
                >
                  🌐 Admissions & CMS
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('all')}
                  className="px-2.5 py-1 text-xs font-semibold bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg transition-colors cursor-pointer"
                >
                  👑 Grant All
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('clear')}
                  className="px-2.5 py-1 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Notifications */}
            {permsSuccessMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{permsSuccessMessage}</span>
              </div>
            )}
            {permsErrorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{permsErrorMessage}</span>
              </div>
            )}

            {/* Permissions list */}
            <div className="space-y-2.5 pt-2">
              <span className="text-xs font-bold text-slate-700 block">Select Delegated Privileges:</span>
              <div className="grid grid-cols-1 gap-2.5">
                {AVAILABLE_STAFF_PERMISSIONS.map((perm) => {
                  const isChecked = editingPermissions.includes(perm.id);

                  return (
                    <div
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                        isChecked
                          ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-slate-100 shrink-0 mt-0.5">
                          {getPermissionIcon(perm.icon)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-xs font-bold text-slate-900">{perm.name}</h5>
                            <span className="text-[10px] px-2 py-0.2 rounded font-semibold bg-slate-200/80 text-slate-700">
                              {perm.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{perm.description}</p>
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                            isChecked
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 sticky bottom-0 bg-white pb-1">
              <button
                type="button"
                onClick={() => setSelectedTeacherForPerms(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-xs disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{savingPerms ? 'Saving Roles...' : 'Save Permissions'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

