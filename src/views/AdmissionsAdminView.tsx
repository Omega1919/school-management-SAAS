import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  User,
  GraduationCap,
  Calendar,
  Layers,
  Building2,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  ChevronRight,
  X,
  Check,
  Copy,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';
import { Badge } from '../components/Badge.tsx';

interface ApplicationItem {
  id: number;
  applicationNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  sessionId: number;
  sessionName: string;
  classId: number;
  className: string;
  gradeLevel?: string;
  departmentId?: number;
  departmentName?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianRelationship?: string;
  nationality?: string;
  stateOfOrigin?: string;
  lga?: string;
  passportPhoto?: string;
  guardianAddress?: string;
  guardianOccupation?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  entryMode?: string;
  documents?: string;
  status: 'pending' | 'under_review' | 'needs_information' | 'approved' | 'rejected';
  adminNotes?: string;
  applicantMessage?: string;
  reviewedBy?: number;
  reviewerName?: string;
  reviewedAt?: string;
  approvedStudentId?: number;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationDetailsResponse {
  application: ApplicationItem;
  student?: {
    id: number;
    studentId: string;
    status: string;
    admissionDate: string;
  };
  logs: Array<{
    id: number;
    action: string;
    previousStatus?: string;
    newStatus?: string;
    notes?: string;
    performedBy?: number;
    performerName?: string;
    createdAt: string;
  }>;
}

interface ApplicationsListResponse {
  data: ApplicationItem[];
  counts: {
    all: number;
    pending: number;
    under_review: number;
    needs_information: number;
    approved: number;
    rejected: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const AdmissionsAdminView: React.FC = () => {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    pending: 0,
    under_review: 0,
    needs_information: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessions, setSessions] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Selected Detail Modal
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [appDetails, setAppDetails] = useState<ApplicationDetailsResponse | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Action Modals
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [approveNotes, setApproveNotes] = useState('Application officially approved and student admitted.');
  const [rejectReason, setRejectReason] = useState('Application does not meet current admission requirements.');
  const [infoNotes, setInfoNotes] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
    loadApplications();
  }, [selectedStatus, selectedSessionId]);

  const loadSessions = async () => {
    try {
      const res = await apiRequest<any[]>('/academic/sessions');
      setSessions(res || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const loadApplications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus);
      if (selectedSessionId) params.append('sessionId', selectedSessionId);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      params.append('limit', '100');

      const res = await apiRequest<ApplicationsListResponse>(`/admissions/applications?${params.toString()}`);
      setApplications(res?.data || []);
      if (res?.counts) {
        setCounts(res.counts);
      }
    } catch (err) {
      console.error('Error loading applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadApplications();
  };

  const openAppDetails = async (id: number) => {
    setSelectedAppId(id);
    setLoadingDetails(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiRequest<ApplicationDetailsResponse>(`/admissions/applications/${id}`);
      setAppDetails(res);
    } catch (err: any) {
      console.error('Error loading application details:', err);
      setActionError(err.message || 'Failed to load details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleMarkUnderReview = async () => {
    if (!selectedAppId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiRequest(`/admissions/applications/${selectedAppId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'under_review', notes: 'Application placed under committee review' }),
      });
      setActionSuccess('Application status updated to Under Review.');
      await openAppDetails(selectedAppId);
      await loadApplications();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedAppId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await apiRequest<any>(`/admissions/applications/${selectedAppId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes: approveNotes }),
      });
      setShowApproveModal(false);
      setActionSuccess(`Application officially approved! Student ID ${res.student?.studentId} issued.`);
      await openAppDetails(selectedAppId);
      await loadApplications();
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedAppId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiRequest(`/admissions/applications/${selectedAppId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setShowRejectModal(false);
      setActionSuccess('Application rejected.');
      await openAppDetails(selectedAppId);
      await loadApplications();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!selectedAppId || !infoNotes.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiRequest(`/admissions/applications/${selectedAppId}/request-info`, {
        method: 'POST',
        body: JSON.stringify({ notes: infoNotes.trim() }),
      });
      setShowInfoModal(false);
      setInfoNotes('');
      setActionSuccess('Information request logged. Applicant can view this request via tracking.');
      await openAppDetails(selectedAppId);
      await loadApplications();
    } catch (err: any) {
      setActionError(err.message || 'Failed to request information');
    } finally {
      setActionLoading(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Under Review</span>
          </span>
        );
      case 'needs_information':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Needs Info</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Rejected</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">
            <Clock className="w-3.5 h-3.5 text-yellow-600" />
            <span>Pending</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-purple-600" />
            <span>Student Admissions & Applications</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review applicant registrations, verify documentation, and officially admit students into classes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Public Registration URL: <code className="text-purple-600 font-mono">/api/admissions/public/options</code>
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setSelectedStatus('all')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'all'
              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">All Applications</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{counts.all}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('pending')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'pending'
              ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-700">Pending Review</span>
          <div className="text-2xl font-extrabold text-yellow-700 mt-1">{counts.pending}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('under_review')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'under_review'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Under Review</span>
          <div className="text-2xl font-extrabold text-blue-700 mt-1">{counts.under_review}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('needs_information')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'needs_information'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Needs Info</span>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{counts.needs_information}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('approved')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'approved'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Admitted</span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{counts.approved}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('rejected')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'rejected'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Rejected</span>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{counts.rejected}</div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by applicant name, email, phone, or application number..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Academic Sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Session: {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading admission applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800 text-base">No Applications Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              There are no admission applications matching the current filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Application No.</th>
                  <th className="py-3 px-4">Placement Target</th>
                  <th className="py-3 px-4">Guardian Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">
                        {app.firstName} {app.middleName ? app.middleName + ' ' : ''}{app.lastName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {app.gender} • DOB: {app.dateOfBirth}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                        {app.applicationNumber}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 text-xs">
                        {app.className}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {app.sessionName} {app.departmentName ? `• ${app.departmentName}` : ''}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      <div className="text-slate-800 font-medium">{app.guardianName || 'N/A'}</div>
                      <div className="text-slate-500">{app.guardianPhone || app.phone}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      {renderStatusBadge(app.status)}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openAppDetails(app.id)}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Application Review Drawer / Modal */}
      {selectedAppId && (
        <Modal
          isOpen={Boolean(selectedAppId)}
          onClose={() => {
            setSelectedAppId(null);
            setAppDetails(null);
          }}
          title={
            appDetails
              ? `Application Review: ${appDetails.application.applicationNumber}`
              : 'Application Review'
          }
        >
          {loadingDetails || !appDetails ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading applicant dossier...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {actionSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {actionError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Status Header */}
              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Status</span>
                  <div className="mt-1">{renderStatusBadge(appDetails.application.status)}</div>
                </div>
                {appDetails.student && (
                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Enrolled Student ID</span>
                    <div className="font-mono font-extrabold text-sm text-emerald-800">
                      {appDetails.student.studentId}
                    </div>
                  </div>
                )}
              </div>

              {/* Applicant Dossier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <User className="w-4 h-4 text-purple-600" />
                      <span>Personal Details</span>
                    </h4>
                    {appDetails.application.passportPhoto && (
                      <img
                        src={appDetails.application.passportPhoto}
                        alt="Passport"
                        className="w-12 h-12 rounded-xl object-cover border border-purple-200 shadow-2xs"
                      />
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Full Name: </span>
                    <span className="font-bold text-slate-800">
                      {appDetails.application.firstName} {appDetails.application.middleName || ''} {appDetails.application.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Date of Birth: </span>
                    <span className="font-semibold text-slate-800">{appDetails.application.dateOfBirth}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Gender: </span>
                    <span className="font-semibold text-slate-800">{appDetails.application.gender}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Email: </span>
                    <span className="font-semibold text-slate-800">{appDetails.application.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Phone: </span>
                    <span className="font-semibold text-slate-800">{appDetails.application.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Address: </span>
                    <span className="font-semibold text-slate-800">{appDetails.application.address}</span>
                  </div>
                  {(appDetails.application.nationality || appDetails.application.stateOfOrigin) && (
                    <div className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                      <span>{appDetails.application.nationality || 'Nigerian'}</span>
                      {appDetails.application.stateOfOrigin && <span> • {appDetails.application.stateOfOrigin} State</span>}
                      {appDetails.application.lga && <span> ({appDetails.application.lga} LGA)</span>}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span>Academic Placement Target</span>
                  </h4>
                  <div>
                    <span className="text-slate-400 font-medium">Session: </span>
                    <span className="font-bold text-slate-800">{appDetails.application.sessionName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Class / Level: </span>
                    <span className="font-bold text-slate-800">{appDetails.application.className}</span>
                  </div>
                  {appDetails.application.entryMode && (
                    <div>
                      <span className="text-slate-400 font-medium">Entry Mode: </span>
                      <span className="font-semibold text-purple-700">{appDetails.application.entryMode}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 font-medium">Department: </span>
                    <span className="font-semibold text-slate-800">
                      {appDetails.application.departmentName || 'General'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <h5 className="font-bold text-slate-700 mb-1">Parent / Guardian:</h5>
                    <p className="text-slate-800 font-semibold">{appDetails.application.guardianName || 'None listed'}</p>
                    <p className="text-slate-500">
                      {appDetails.application.guardianRelationship || 'Guardian'} • {appDetails.application.guardianPhone || 'No phone'}
                    </p>
                    {appDetails.application.guardianEmail && <p className="text-slate-500">{appDetails.application.guardianEmail}</p>}
                    {appDetails.application.guardianOccupation && (
                      <p className="text-slate-600 text-[11px] mt-0.5 font-medium">Occupation: {appDetails.application.guardianOccupation}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Uploaded Documents Section */}
              {appDetails.application.documents && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>Attached Application Documents</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(() => {
                      try {
                        const docs = typeof appDetails.application.documents === 'string'
                          ? JSON.parse(appDetails.application.documents)
                          : appDetails.application.documents;
                        if (!Array.isArray(docs) || docs.length === 0) return <p className="text-slate-400 italic">No document attachments uploaded.</p>;
                        return docs.map((doc: any, i: number) => (
                          <div key={i} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 block truncate">{doc.title || doc.name || 'Document'}</span>
                              <span className="text-[10px] text-slate-400 truncate block">{doc.fileName || 'file.pdf'}</span>
                            </div>
                            {doc.fileData && (
                              <a
                                href={doc.fileData}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={doc.fileName || 'document'}
                                className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-[10px] rounded-lg transition-colors shrink-0"
                              >
                                View File
                              </a>
                            )}
                          </div>
                        ));
                      } catch {
                        return <p className="text-slate-400 italic">Attached document records parsed.</p>;
                      }
                    })()}
                  </div>
                </div>
              )}

              {/* Applicant Personal Statement */}
              {appDetails.application.applicantMessage && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                    Applicant Statement / Remarks
                  </h4>
                  <p className="text-slate-800 italic">"{appDetails.application.applicantMessage}"</p>
                </div>
              )}

              {/* Current Admin Notes */}
              {appDetails.application.adminNotes && (
                <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 text-xs">
                  <h4 className="font-bold text-purple-900 uppercase tracking-wider text-[11px] mb-1">
                    Official Committee Notes
                  </h4>
                  <p className="text-purple-800">{appDetails.application.adminNotes}</p>
                </div>
              )}

              {/* Administrative Actions */}
              {appDetails.application.status !== 'approved' && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2.5 justify-end">
                  {appDetails.application.status === 'pending' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleMarkUnderReview}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
                    >
                      Mark Under Review
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowInfoModal(true)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
                  >
                    Request Information
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowRejectModal(true)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
                  >
                    Reject Application
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowApproveModal(true)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve & Enroll Student</span>
                  </button>
                </div>
              )}

              {/* Review Audit History Timeline */}
              {appDetails.logs && appDetails.logs.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Review History & Decision Trail
                  </h4>
                  <div className="space-y-2">
                    {appDetails.logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex items-start justify-between gap-3"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{log.action.replace('_', ' ')}</span>
                          {log.newStatus && (
                            <span className="ml-2 font-mono text-[11px] text-purple-700">
                              → {log.newStatus}
                            </span>
                          )}
                          {log.notes && <p className="text-slate-600 mt-1">{log.notes}</p>}
                        </div>
                        <div className="text-right text-[11px] text-slate-400 shrink-0">
                          <div>{log.performerName || 'System'}</div>
                          <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Approve Confirmation Modal */}
      {showApproveModal && appDetails && (
        <Modal
          isOpen={showApproveModal}
          onClose={() => setShowApproveModal(false)}
          title="Confirm Admission Approval"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
              <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Production Enrollment Action</span>
              </div>
              <p>
                Approving this application will execute an atomic database transaction that will:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Create an official Student record with a unique cryptographic Student ID.</li>
                <li>Enroll the student into <strong>{appDetails.application.className}</strong> for <strong>{appDetails.application.sessionName}</strong>.</li>
                <li>Generate a 30-day student enrollment activation invitation token.</li>
                <li>Update the application status to <strong>Approved</strong>.</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Approval Notes / Resolution Message
              </label>
              <textarea
                rows={2}
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleApprove}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading ? 'Enrolling Student...' : 'Confirm Official Approval'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title="Reject Admission Application"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Please specify the reason for rejecting this admission application. This explanation will be visible to the applicant when checking their status.
            </p>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Class capacity reached or admission requirements not met..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleReject}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Request Info Modal */}
      {showInfoModal && (
        <Modal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          title="Request Additional Information"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Specify what additional documents, certificates, or details are required from the applicant to proceed with the review.
            </p>
            <textarea
              required
              rows={3}
              value={infoNotes}
              onChange={(e) => setInfoNotes(e.target.value)}
              placeholder="e.g. Please provide certified transcript of previous school results or medical clearance..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !infoNotes.trim()}
                onClick={handleRequestInfo}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading ? 'Saving...' : 'Send Information Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
