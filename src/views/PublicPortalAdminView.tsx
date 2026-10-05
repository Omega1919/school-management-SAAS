import React, { useState, useEffect } from 'react';
import {
  Globe,
  Settings,
  Calendar,
  BookOpen,
  FileText,
  HelpCircle,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Star,
  Clock,
  Layers,
  Sparkles,
  Save,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Building2,
  User,
  Tag,
  Share2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';
import { Badge } from '../components/Badge.tsx';
import { sanitizeHtml } from '../lib/sanitize.ts';

type TabType =
  | 'overview'
  | 'admissions'
  | 'homepage'
  | 'programs'
  | 'requirements'
  | 'dates'
  | 'news'
  | 'faqs'
  | 'contact'
  | 'settings';

interface PortalSettings {
  id: number;
  portalEnabled: boolean;
  admissionsOpen: boolean;
  openingDate?: string | null;
  closingDate?: string | null;
  currentSessionId?: number | null;
  announcementMessage?: string;
  applicationInstructions?: string;
  applicationFee?: string;
  admissionsContactInfo?: string;
  showPrograms: boolean;
  showRequirements: boolean;
  showImportantDates: boolean;
  showNews: boolean;
  showFaqs: boolean;
  showContact: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroBadgeText?: string;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  officeHours?: string;
}

interface SchoolSettings {
  schoolName: string;
  motto?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  currencySymbol?: string;
}

interface AcademicProgram {
  id: number;
  name: string;
  section?: string;
  gradeLevel?: string;
  sessionId?: number;
  sessionName?: string;
  departmentId?: number;
  departmentName?: string;
  capacity: number;
  status: string;
  isPubliclyVisible: boolean;
  admissionStatus: 'available' | 'closed' | 'hidden';
  publicDescription?: string;
  duration?: string;
  requirements?: string;
  isFeatured: boolean;
}

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  featuredImage?: string;
  category: string;
  authorName: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  isFeatured: boolean;
  viewsCount: number;
  createdAt: string;
}

interface ImportantDate {
  id: number;
  title: string;
  description?: string;
  eventDate: string;
  eventTime?: string;
  category: string;
  isPubliclyVisible: boolean;
  status: string;
  displayOrder: number;
}

interface AdmissionRequirement {
  id: number;
  title: string;
  description: string;
  scope: 'general' | 'department' | 'class';
  departmentId?: number;
  departmentName?: string;
  classId?: number;
  className?: string;
  isMandatory: boolean;
  isPubliclyVisible: boolean;
  displayOrder: number;
}

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  displayOrder: number;
  isPublished: boolean;
}

interface PublicPortalAdminViewProps {
  onOpenVisualEditor?: () => void;
}

export const PublicPortalAdminView: React.FC<PublicPortalAdminViewProps> = ({ onOpenVisualEditor }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>({ schoolName: '' });
  const [sessions, setSessions] = useState<Array<{ id: number; name: string; isCurrent: boolean }>>([]);
  const [programs, setPrograms] = useState<AcademicProgram[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [newsPosts, setNewsPosts] = useState<BlogPost[]>([]);
  const [newsCategories, setNewsCategories] = useState<Array<{ id: number; name: string; slug: string }>>([]);
  const [datesList, setDatesList] = useState<ImportantDate[]>([]);
  const [requirementsList, setRequirementsList] = useState<AdmissionRequirement[]>([]);
  const [faqsList, setFaqsList] = useState<FAQItem[]>([]);

  // Search & Filters
  const [programSearch, setProgramSearch] = useState('');
  const [programDeptFilter, setProgramDeptFilter] = useState<string>('all');
  const [newsSearch, setNewsSearch] = useState('');
  const [newsStatusFilter, setNewsStatusFilter] = useState<string>('all');

  // Modals
  const [editingProgram, setEditingProgram] = useState<AcademicProgram | null>(null);
  const [editingNews, setEditingNews] = useState<Partial<BlogPost> | null>(null);
  const [editingDate, setEditingDate] = useState<Partial<ImportantDate> | null>(null);
  const [editingReq, setEditingReq] = useState<Partial<AdmissionRequirement> | null>(null);
  const [editingFaq, setEditingFaq] = useState<Partial<FAQItem> | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'news' | 'date' | 'requirement' | 'faq';
    id: number;
    title: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [ovData, settingsData, progData, newsData, datesData, reqsData, faqsData] = await Promise.all([
        apiRequest<any>('/public-portal/admin/overview').catch(() => null),
        apiRequest<any>('/public-portal/admin/settings').catch(() => null),
        apiRequest<any>('/public-portal/admin/programs').catch(() => ({ programs: [], departments: [] })),
        apiRequest<any>('/public-portal/admin/news').catch(() => ({ posts: [], categories: [] })),
        apiRequest<any>('/public-portal/admin/dates').catch(() => ({ dates: [] })),
        apiRequest<any>('/public-portal/admin/requirements').catch(() => ({ requirements: [] })),
        apiRequest<any>('/public-portal/admin/faqs').catch(() => ({ faqs: [] })),
      ]);

      if (ovData) setOverview(ovData);
      if (settingsData) {
        setPortalSettings(settingsData.portalSettings);
        setSchoolSettings(settingsData.schoolSettings);
        setSessions(settingsData.sessions || []);
      }
      if (progData) {
        setPrograms(progData.programs || []);
        setDepartments(progData.departments || []);
      }
      if (newsData) {
        setNewsPosts(newsData.posts || []);
        setNewsCategories(newsData.categories || []);
      }
      if (datesData) setDatesList(datesData.dates || []);
      if (reqsData) setRequirementsList(reqsData.requirements || []);
      if (faqsData) setFaqsList(faqsData.faqs || []);
    } catch (err: any) {
      console.error('Error loading CMS data:', err);
      showToast('error', 'Failed to load public portal configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Save Settings & Admissions Control
  const handleSaveSettings = async (customPayload?: Partial<PortalSettings & SchoolSettings>) => {
    if (!portalSettings) return;
    try {
      setSaving(true);
      const payload = {
        ...portalSettings,
        ...schoolSettings,
        ...(customPayload || {}),
      };

      const res = await apiRequest<any>('/public-portal/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setPortalSettings(res.settings);
      showToast('success', 'Public portal settings saved successfully.');
      // Refresh overview
      const ov = await apiRequest<any>('/public-portal/admin/overview');
      setOverview(ov);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update portal settings');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Admissions State directly
  const handleToggleAdmissions = async () => {
    if (!portalSettings) return;
    const nextState = !portalSettings.admissionsOpen;
    setPortalSettings((prev) => (prev ? { ...prev, admissionsOpen: nextState } : null));
    await handleSaveSettings({ admissionsOpen: nextState });
  };

  // Toggle Master Portal Switch
  const handleTogglePortal = async () => {
    if (!portalSettings) return;
    const nextState = !portalSettings.portalEnabled;
    setPortalSettings((prev) => (prev ? { ...prev, portalEnabled: nextState } : null));
    await handleSaveSettings({ portalEnabled: nextState });
  };

  // Program Availability Handler
  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram) return;

    try {
      setSaving(true);
      const res = await apiRequest<any>(`/public-portal/admin/programs/${editingProgram.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          admissionStatus: editingProgram.admissionStatus,
          isPubliclyVisible: editingProgram.isPubliclyVisible,
          publicDescription: editingProgram.publicDescription,
          duration: editingProgram.duration,
          requirements: editingProgram.requirements,
          isFeatured: editingProgram.isFeatured,
        }),
      });

      setPrograms((prev) => prev.map((p) => (p.id === editingProgram.id ? res.program : p)));
      setEditingProgram(null);
      showToast('success', `Updated public settings for ${res.program.name}`);
      const ov = await apiRequest<any>('/public-portal/admin/overview');
      setOverview(ov);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update program settings');
    } finally {
      setSaving(false);
    }
  };

  // News Handlers
  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews || !editingNews.title || !editingNews.content) {
      showToast('error', 'Title and content are required.');
      return;
    }

    try {
      setSaving(true);
      const isNew = !editingNews.id;
      const endpoint = isNew ? '/public-portal/admin/news' : `/public-portal/admin/news/${editingNews.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiRequest<any>(endpoint, {
        method,
        body: JSON.stringify(editingNews),
      });

      if (isNew) {
        setNewsPosts((prev) => [res.post, ...prev]);
        showToast('success', 'Article created and saved successfully.');
      } else {
        setNewsPosts((prev) => prev.map((p) => (p.id === res.post.id ? res.post : p)));
        showToast('success', 'Article updated successfully.');
      }
      setEditingNews(null);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save news article');
    } finally {
      setSaving(false);
    }
  };

  // Important Dates Handlers
  const handleSaveDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDate || !editingDate.title || !editingDate.eventDate) {
      showToast('error', 'Title and event date are required.');
      return;
    }

    try {
      setSaving(true);
      const isNew = !editingDate.id;
      const endpoint = isNew ? '/public-portal/admin/dates' : `/public-portal/admin/dates/${editingDate.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiRequest<any>(endpoint, {
        method,
        body: JSON.stringify(editingDate),
      });

      if (isNew) {
        setDatesList((prev) => [...prev, res.date]);
        showToast('success', 'Important date created.');
      } else {
        setDatesList((prev) => prev.map((d) => (d.id === res.date.id ? res.date : d)));
        showToast('success', 'Important date updated.');
      }
      setEditingDate(null);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save date');
    } finally {
      setSaving(false);
    }
  };

  // Requirement Handlers
  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReq || !editingReq.title || !editingReq.description) {
      showToast('error', 'Title and description are required.');
      return;
    }

    try {
      setSaving(true);
      const isNew = !editingReq.id;
      const endpoint = isNew ? '/public-portal/admin/requirements' : `/public-portal/admin/requirements/${editingReq.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiRequest<any>(endpoint, {
        method,
        body: JSON.stringify(editingReq),
      });

      if (isNew) {
        setRequirementsList((prev) => [...prev, res.requirement]);
        showToast('success', 'Admission requirement created.');
      } else {
        setRequirementsList((prev) => prev.map((r) => (r.id === res.requirement.id ? res.requirement : r)));
        showToast('success', 'Admission requirement updated.');
      }
      setEditingReq(null);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save requirement');
    } finally {
      setSaving(false);
    }
  };

  // FAQ Handlers
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq || !editingFaq.question || !editingFaq.answer) {
      showToast('error', 'Question and answer are required.');
      return;
    }

    try {
      setSaving(true);
      const isNew = !editingFaq.id;
      const endpoint = isNew ? '/public-portal/admin/faqs' : `/public-portal/admin/faqs/${editingFaq.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiRequest<any>(endpoint, {
        method,
        body: JSON.stringify(editingFaq),
      });

      if (isNew) {
        setFaqsList((prev) => [...prev, res.faq]);
        showToast('success', 'FAQ entry created.');
      } else {
        setFaqsList((prev) => prev.map((f) => (f.id === res.faq.id ? res.faq : f)));
        showToast('success', 'FAQ entry updated.');
      }
      setEditingFaq(null);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save FAQ');
    } finally {
      setSaving(false);
    }
  };

  // Delete Action Dispatcher
  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, id } = deleteConfirmation;

    try {
      setSaving(true);
      if (type === 'news') {
        await apiRequest(`/public-portal/admin/news/${id}`, { method: 'DELETE' });
        setNewsPosts((prev) => prev.filter((p) => p.id !== id));
        showToast('success', 'Article removed.');
      } else if (type === 'date') {
        await apiRequest(`/public-portal/admin/dates/${id}`, { method: 'DELETE' });
        setDatesList((prev) => prev.filter((d) => d.id !== id));
        showToast('success', 'Important date removed.');
      } else if (type === 'requirement') {
        await apiRequest(`/public-portal/admin/requirements/${id}`, { method: 'DELETE' });
        setRequirementsList((prev) => prev.filter((r) => r.id !== id));
        showToast('success', 'Requirement removed.');
      } else if (type === 'faq') {
        await apiRequest(`/public-portal/admin/faqs/${id}`, { method: 'DELETE' });
        setFaqsList((prev) => prev.filter((f) => f.id !== id));
        showToast('success', 'FAQ removed.');
      }
      setDeleteConfirmation(null);
    } catch (err: any) {
      showToast('error', err.message || 'Deletion failed.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Programs
  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(programSearch.toLowerCase()) ||
      (p.gradeLevel && p.gradeLevel.toLowerCase().includes(programSearch.toLowerCase())) ||
      (p.departmentName && p.departmentName.toLowerCase().includes(programSearch.toLowerCase()));
    const matchesDept =
      programDeptFilter === 'all' || (p.departmentId && p.departmentId.toString() === programDeptFilter);
    return matchesSearch && matchesDept;
  });

  // Filtered News
  const filteredNews = newsPosts.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(newsSearch.toLowerCase()) ||
      (n.summary && n.summary.toLowerCase().includes(newsSearch.toLowerCase())) ||
      n.category.toLowerCase().includes(newsSearch.toLowerCase());
    const matchesStatus = newsStatusFilter === 'all' || n.status === newsStatusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mb-3" />
        <p className="text-sm font-semibold">Loading Public Portal & CMS Management...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
            <Globe className="w-4 h-4" />
            <span>Public Portal & Content Management System</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Portal CMS & Admissions Control</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure public admissions status, dynamic offerings, news, important dates, requirements, and portal content live.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {onOpenVisualEditor && (
            <button
              type="button"
              onClick={onOpenVisualEditor}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-md shadow-purple-600/30 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-purple-200" />
              <span>🎨 Open Visual Admissions Page Editor</span>
            </button>
          )}

          <a
            href="#/admissions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public Portal</span>
          </a>

          <button
            onClick={() => handleSaveSettings()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save All Changes</span>
          </button>
        </div>
      </div>

      {/* Navigation Subsections / Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max text-xs font-semibold">
          {[
            { id: 'overview', label: 'Overview', icon: Layers },
            { id: 'admissions', label: 'Admissions Control', icon: ShieldCheck },
            { id: 'homepage', label: 'Hero & Homepage', icon: Sparkles },
            { id: 'programs', label: 'Programs / Offerings', icon: BookOpen },
            { id: 'requirements', label: 'Requirements', icon: CheckCircle2 },
            { id: 'dates', label: 'Important Dates', icon: Calendar },
            { id: 'news', label: 'Blog / News', icon: FileText },
            { id: 'faqs', label: 'FAQs', icon: HelpCircle },
            { id: 'contact', label: 'School Contact', icon: Phone },
            { id: 'settings', label: 'Portal Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-orange-50 text-orange-700 font-bold border border-orange-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-orange-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. OVERVIEW SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Status Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admissions Status</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    portalSettings?.admissionsOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {portalSettings?.admissionsOpen ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xl font-black text-slate-900">
                    {portalSettings?.admissionsOpen ? 'Accepting Applications' : 'Submissions Locked'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {portalSettings?.openingDate && portalSettings?.closingDate
                      ? `${portalSettings.openingDate} to ${portalSettings.closingDate}`
                      : 'No strict date bounds specified'}
                  </p>
                </div>
                <button
                  onClick={handleToggleAdmissions}
                  className={`p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    portalSettings?.admissionsOpen
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {portalSettings?.admissionsOpen ? 'Close Now' : 'Open Now'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Master Switch</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    portalSettings?.portalEnabled ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {portalSettings?.portalEnabled ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xl font-black text-slate-900">
                    {portalSettings?.portalEnabled ? 'Public Portal Online' : 'Offline / Maintenance'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Visible to applicants & public visitors</p>
                </div>
                <button
                  onClick={handleTogglePortal}
                  className="p-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  {portalSettings?.portalEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Public Offerings</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  {programs.filter((p) => p.admissionStatus === 'available').length} Available
                </span>
              </div>
              <div className="mt-3">
                <p className="text-xl font-black text-slate-900">
                  {programs.filter((p) => p.isPubliclyVisible).length} Visible Offerings
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {programs.filter((p) => p.admissionStatus === 'closed').length} Closed •{' '}
                  {programs.filter((p) => p.admissionStatus === 'hidden' || !p.isPubliclyVisible).length} Hidden
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                <FileText className="w-4 h-4 text-orange-500" />
                <span>Blog Articles</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{newsPosts.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{newsPosts.filter((p) => p.status === 'published').length} published</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>Important Dates</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{datesList.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{datesList.filter((d) => d.isPubliclyVisible).length} visible</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Requirements</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{requirementsList.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{requirementsList.filter((r) => r.isMandatory).length} mandatory</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                <span>Published FAQs</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{faqsList.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{faqsList.filter((f) => f.isPublished).length} visible to public</p>
            </div>
          </div>

          {/* Quick Shortcuts to Subsections */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <h3 className="text-base font-bold text-slate-900 mb-3">Quick Portal Management Shortcuts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { tab: 'admissions', title: 'Admissions Window & Fee', desc: 'Set opening date, closing date, fee, and announcement' },
                { tab: 'programs', title: 'Manage Available Classes', desc: 'Control which classes/courses are open or closed' },
                { tab: 'requirements', title: 'Entry Requirements', desc: 'Set birth cert, transcripts, and level prerequisites' },
                { tab: 'dates', title: 'Entrance Exams & Dates', desc: 'Publish examination dates, resumption, and deadlines' },
                { tab: 'news', title: 'Publish Articles & News', desc: 'Share news, achievements, and announcements' },
                { tab: 'faqs', title: 'Applicant FAQs', desc: 'Answer common questions for applicants and parents' },
              ].map((s) => (
                <button
                  key={s.tab}
                  onClick={() => setActiveTab(s.tab as TabType)}
                  className="bg-white border border-slate-200 hover:border-orange-300 p-4 rounded-xl text-left transition-all hover:shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">{s.title}</p>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. ADMISSIONS CONTROL SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'admissions' && portalSettings && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Admissions Window & Application Control</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Control admissions status. When admissions are closed, the public portal displays closed notices and the backend strictly rejects new submissions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Admissions Master Toggle */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Admissions Intake Status
              </label>
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold ${
                      portalSettings.admissionsOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {portalSettings.admissionsOpen ? 'ADMISSIONS OPEN' : 'ADMISSIONS CLOSED'}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    {portalSettings.admissionsOpen
                      ? 'Prospective students can submit applications online.'
                      : 'Applications are locked. Submissions will be rejected by backend.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPortalSettings((prev) => (prev ? { ...prev, admissionsOpen: !prev.admissionsOpen } : null))
                  }
                  className="cursor-pointer"
                >
                  {portalSettings.admissionsOpen ? (
                    <ToggleRight className="w-10 h-10 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Current Session */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Current Academic Session</label>
              <select
                value={portalSettings.currentSessionId || ''}
                onChange={(e) =>
                  setPortalSettings((prev) =>
                    prev ? { ...prev, currentSessionId: parseInt(e.target.value, 10) || null } : null
                  )
                }
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500 bg-white"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? '(Active Current Session)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">All new public student applications will default to this session.</p>
            </div>

            {/* Opening Date */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Opening Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={portalSettings.openingDate || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, openingDate: e.target.value || null } : null))
                }
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
              <p className="text-xs text-slate-500 mt-1">First date applications can be submitted (leave blank for immediate).</p>
            </div>

            {/* Closing Date */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Closing Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={portalSettings.closingDate || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, closingDate: e.target.value || null } : null))
                }
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
              <p className="text-xs text-slate-500 mt-1">Deadline after which backend strictly rejects applications.</p>
            </div>

            {/* Application Fee */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Application Registration Fee</label>
              <div className="relative">
                <input
                  type="text"
                  value={portalSettings.applicationFee || '0.00'}
                  onChange={(e) =>
                    setPortalSettings((prev) => (prev ? { ...prev, applicationFee: e.target.value } : null))
                  }
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Set to 0.00 for free online registration.</p>
            </div>

            {/* Admissions Office Contact Info */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Admissions Contact Information</label>
              <input
                type="text"
                value={portalSettings.admissionsContactInfo || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, admissionsContactInfo: e.target.value } : null))
                }
                placeholder="admissions@school.edu • Tel: +234 803 111 2233"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
              <p className="text-xs text-slate-500 mt-1">Displayed to applicants on the application page.</p>
            </div>

            {/* Announcement Message Banner */}
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Public Admission Announcement Banner</label>
              <input
                type="text"
                value={portalSettings.announcementMessage || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, announcementMessage: e.target.value } : null))
                }
                placeholder="Applications are now open for the 2026/2027 academic session."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
              <p className="text-xs text-slate-500 mt-1">Prominently featured atop the public portal.</p>
            </div>

            {/* Application Instructions */}
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Application Instructions & Guidance</label>
              <textarea
                rows={4}
                value={portalSettings.applicationInstructions || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, applicationInstructions: e.target.value } : null))
                }
                placeholder="1. Select your target program/class.&#10;2. Complete applicant details.&#10;3. Save tracking access key."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Admissions Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. HERO & HOMEPAGE SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'homepage' && portalSettings && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Hero Section & Visual Customization</h2>
            <p className="text-xs text-slate-500 mt-0.5">Customize the main hero title, slogan, badge, and photo rotation details.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Hero Badge Text</label>
              <input
                type="text"
                value={portalSettings.heroBadgeText || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, heroBadgeText: e.target.value } : null))
                }
                placeholder="Admissions Intake Open"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Office Working Hours</label>
              <input
                type="text"
                value={portalSettings.officeHours || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, officeHours: e.target.value } : null))
                }
                placeholder="Mon - Fri • 8:00 AM - 5:00 PM"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Hero Main Headline</label>
              <input
                type="text"
                value={portalSettings.heroTitle || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, heroTitle: e.target.value } : null))
                }
                placeholder="Let's fly to your Dream Academy"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Hero Subtitle / Description</label>
              <textarea
                rows={3}
                value={portalSettings.heroSubtitle || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, heroSubtitle: e.target.value } : null))
                }
                placeholder="Your dream education is just a few clicks away..."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>
          </div>

          {/* 10-Second Auto-Rotating Campus Image Carousel Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-bold text-slate-900">Live Campus Background Rotation (Active Every 10s)</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The public portal automatically cycles through 6 high-definition, photorealistic student life images (Library Commons, STEM Laboratories, Campus Quad, Interactive Lecture Halls) with smooth cross-fade animation every 10 seconds.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Homepage Branding</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. PROGRAMS / OFFERINGS SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'programs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Academic Offerings & Program Availability</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mark programs as <strong>Available</strong>, <strong>Closed</strong>, or <strong>Hidden</strong>. Unavailable programs are rejected server-side.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Department Filter */}
              <select
                value={programDeptFilter}
                onChange={(e) => setProgramDeptFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="all">All Departments / Tracks</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id.toString()}>
                    {d.name}
                  </option>
                ))}
              </select>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search program..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 w-44 sm:w-56 focus:outline-hidden focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Programs Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Program / Class</th>
                  <th className="py-3 px-4">Department / Track</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Admission Status</th>
                  <th className="py-3 px-4">Public Visibility</th>
                  <th className="py-3 px-4">Featured</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPrograms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No programs match your search or filter.
                    </td>
                  </tr>
                ) : (
                  filteredPrograms.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {p.name}
                        {p.gradeLevel && <span className="ml-1.5 text-[11px] font-normal text-slate-500">({p.gradeLevel})</span>}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{p.departmentName || 'General'}</td>
                      <td className="py-3.5 px-4 text-slate-600">{p.duration || '1 Year'}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            p.admissionStatus === 'available'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.admissionStatus === 'closed'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {p.admissionStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {p.isPubliclyVisible ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                            <Eye className="w-3.5 h-3.5" /> Visible
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400 font-semibold">
                            <EyeOff className="w-3.5 h-3.5" /> Hidden
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.isFeatured ? (
                          <span className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-500" /> Featured
                          </span>
                        ) : (
                          <span className="text-slate-400">Standard</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setEditingProgram(p)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. ADMISSION REQUIREMENTS SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'requirements' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Admission Requirements Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">Define general, department-specific, and class-level prerequisites for applicants.</p>
            </div>

            <button
              onClick={() =>
                setEditingReq({
                  title: '',
                  description: '',
                  scope: 'general',
                  isMandatory: true,
                  isPubliclyVisible: true,
                  displayOrder: requirementsList.length + 1,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Requirement</span>
            </button>
          </div>

          <div className="space-y-3">
            {requirementsList.map((req, idx) => (
              <div
                key={req.id}
                className="bg-slate-50 border border-slate-200 hover:border-orange-300 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                    <h3 className="text-sm font-bold text-slate-900">{req.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        req.isMandatory ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {req.isMandatory ? 'Mandatory' : 'Optional'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 capitalize">
                      {req.scope} {req.departmentName ? `• ${req.departmentName}` : ''}
                    </span>
                    {!req.isPubliclyVisible && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{req.description}</p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    onClick={() => setEditingReq(req)}
                    className="p-1.5 text-slate-600 hover:text-orange-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmation({ type: 'requirement', id: req.id, title: req.title })}
                    className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. IMPORTANT DATES SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'dates' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Important Dates & Key Deadlines</h2>
              <p className="text-xs text-slate-500 mt-0.5">Manage admissions opening, entrance examination, orientation, and resumption schedules.</p>
            </div>

            <button
              onClick={() =>
                setEditingDate({
                  title: '',
                  description: '',
                  eventDate: new Date().toISOString().split('T')[0],
                  eventTime: '09:00 AM',
                  category: 'Admission',
                  isPubliclyVisible: true,
                  status: 'upcoming',
                  displayOrder: datesList.length + 1,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Important Date</span>
            </button>
          </div>

          <div className="space-y-3">
            {datesList.map((dt) => (
              <div
                key={dt.id}
                className="bg-slate-50 border border-slate-200 hover:border-orange-300 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="bg-orange-100 text-orange-800 rounded-xl p-2.5 text-center min-w-[70px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider block">
                      {new Date(dt.eventDate).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="text-xl font-black block leading-none mt-0.5">
                      {new Date(dt.eventDate).getDate()}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {new Date(dt.eventDate).getFullYear()}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{dt.title}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                        {dt.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          dt.status === 'upcoming'
                            ? 'bg-blue-100 text-blue-800'
                            : dt.status === 'ongoing'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {dt.status.toUpperCase()}
                      </span>
                      {!dt.isPubliclyVisible && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                          Hidden
                        </span>
                      )}
                    </div>
                    {dt.eventTime && (
                      <p className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{dt.eventTime}</span>
                      </p>
                    )}
                    {dt.description && <p className="text-xs text-slate-600 mt-1">{dt.description}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    onClick={() => setEditingDate(dt)}
                    className="p-1.5 text-slate-600 hover:text-orange-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmation({ type: 'date', id: dt.id, title: dt.title })}
                    className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. BLOG / NEWS MANAGEMENT SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'news' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Blog & News Articles Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">Create, edit, publish, and archive news posts. Only published posts appear publicly.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={newsStatusFilter}
                onChange={(e) => setNewsStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
                <option value="archived">Archived</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search articles..."
                  value={newsSearch}
                  onChange={(e) => setNewsSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 w-40 sm:w-52 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <button
                onClick={() =>
                  setEditingNews({
                    title: '',
                    slug: '',
                    summary: '',
                    content: '',
                    category: newsCategories[0]?.name || 'Admissions & Enrollment',
                    authorName: 'Admissions Committee',
                    status: 'published',
                    isFeatured: false,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Article</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredNews.map((post) => (
              <div
                key={post.id}
                className="bg-slate-50 border border-slate-200 hover:border-orange-300 rounded-xl p-5 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                      {post.category}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        post.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : post.status === 'draft'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {post.status.toUpperCase()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 line-clamp-1">{post.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">slug: /{post.slug}</p>
                  {post.summary && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{post.summary}</p>}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                  <span>By {post.authorName} • {post.viewsCount} views</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`#/news/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:text-orange-600 transition-colors"
                      title="Preview article"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setEditingNews(post)}
                      className="p-1 hover:text-orange-600 transition-colors cursor-pointer"
                      title="Edit article"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmation({ type: 'news', id: post.id, title: post.title })}
                      className="p-1 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Delete article"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. FAQS MANAGEMENT SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'faqs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Frequently Asked Questions (FAQs)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Provide clear answers to frequent applicant questions. Safe sanitized HTML allowed.</p>
            </div>

            <button
              onClick={() =>
                setEditingFaq({
                  question: '',
                  answer: '',
                  category: 'Admissions',
                  displayOrder: faqsList.length + 1,
                  isPublished: true,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add FAQ</span>
            </button>
          </div>

          <div className="space-y-3">
            {faqsList.map((faq, idx) => (
              <div
                key={faq.id}
                className="bg-slate-50 border border-slate-200 hover:border-orange-300 rounded-xl p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-400">Q{idx + 1}</span>
                      <h3 className="text-sm font-bold text-slate-900">{faq.question}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {faq.category}
                      </span>
                      {!faq.isPublished && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div
                      className="text-xs text-slate-600 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(faq.answer) }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditingFaq(faq)}
                      className="p-1.5 text-slate-600 hover:text-orange-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmation({ type: 'faq', id: faq.id, title: faq.question })}
                      className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 9. SCHOOL CONTACT & SOCIAL LINKS SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'contact' && portalSettings && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">School Identity & Public Contact Information</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure institutional contact points, address, social links, and official admissions office info.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">School Name</label>
              <input
                type="text"
                value={schoolSettings.schoolName || ''}
                onChange={(e) => setSchoolSettings((prev) => ({ ...prev, schoolName: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Motto / Tagline</label>
              <input
                type="text"
                value={schoolSettings.motto || ''}
                onChange={(e) => setSchoolSettings((prev) => ({ ...prev, motto: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Contact Email</label>
              <input
                type="email"
                value={schoolSettings.contactEmail || ''}
                onChange={(e) => setSchoolSettings((prev) => ({ ...prev, contactEmail: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Contact Phone</label>
              <input
                type="text"
                value={schoolSettings.contactPhone || ''}
                onChange={(e) => setSchoolSettings((prev) => ({ ...prev, contactPhone: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Physical Campus Address</label>
              <input
                type="text"
                value={schoolSettings.address || ''}
                onChange={(e) => setSchoolSettings((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Official Website URL</label>
              <input
                type="text"
                value={portalSettings.websiteUrl || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, websiteUrl: e.target.value || null } : null))
                }
                placeholder="https://academy.edu.ng"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Facebook Page URL</label>
              <input
                type="text"
                value={portalSettings.facebookUrl || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, facebookUrl: e.target.value || null } : null))
                }
                placeholder="https://facebook.com/academy"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Twitter / X Handle or URL</label>
              <input
                type="text"
                value={portalSettings.twitterUrl || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, twitterUrl: e.target.value || null } : null))
                }
                placeholder="https://x.com/academy"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Instagram URL</label>
              <input
                type="text"
                value={portalSettings.instagramUrl || ''}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, instagramUrl: e.target.value || null } : null))
                }
                placeholder="https://instagram.com/academy"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Contact & School Identity</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 10. PORTAL SETTINGS SUBSECTION */}
      {/* ===================================================================== */}
      {activeTab === 'settings' && portalSettings && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Public Portal Settings & Section Visibility</h2>
            <p className="text-xs text-slate-500 mt-0.5">Control which sections are displayed to public visitors on the portal.</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show Available Programs / Classes Section</p>
                <p className="text-xs text-slate-500">Display accredited courses, classes, durations, and entry tracks.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showPrograms}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showPrograms: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show Admission Requirements Section</p>
                <p className="text-xs text-slate-500">Display required documents, certificates, transcripts, and photos.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showRequirements}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showRequirements: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show Important Dates & Calendar Section</p>
                <p className="text-xs text-slate-500">Display examination dates, resumption, and admissions milestones.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showImportantDates}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showImportantDates: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show News & Announcements Section</p>
                <p className="text-xs text-slate-500">Feature published blog posts, awards, and scholarly achievements.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showNews}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showNews: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show Frequently Asked Questions (FAQs)</p>
                <p className="text-xs text-slate-500">Display interactive collapsible accordion with answers.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showFaqs}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showFaqs: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Show Campus Contact & Inquiry Section</p>
                <p className="text-xs text-slate-500">Display phone numbers, admissions office address, and operating hours.</p>
              </div>
              <input
                type="checkbox"
                checked={portalSettings.showContact}
                onChange={(e) =>
                  setPortalSettings((prev) => (prev ? { ...prev, showContact: e.target.checked } : null))
                }
                className="w-5 h-5 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Portal Visibility</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* EDIT PROGRAM MODAL */}
      {/* ===================================================================== */}
      {editingProgram && (
        <Modal
          isOpen={true}
          onClose={() => setEditingProgram(null)}
          title={`Edit Offering: ${editingProgram.name}`}
          subtitle="Configure public admission availability, duration, and prerequisites."
        >
          <form onSubmit={handleSaveProgram} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Admission Status</label>
              <select
                value={editingProgram.admissionStatus}
                onChange={(e) =>
                  setEditingProgram({ ...editingProgram, admissionStatus: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              >
                <option value="available">Available (Accepting Applications)</option>
                <option value="closed">Closed (Submissions Blocked)</option>
                <option value="hidden">Hidden (Not Displayed on Portal)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                If marked Closed or Hidden, the backend rejects any attempts to submit an application for this class.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Publicly Visible</span>
                <span className="text-[11px] text-slate-500">Show this program in the public catalog</span>
              </div>
              <input
                type="checkbox"
                checked={editingProgram.isPubliclyVisible}
                onChange={(e) => setEditingProgram({ ...editingProgram, isPubliclyVisible: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Featured Offering</span>
                <span className="text-[11px] text-slate-500">Highlight this offering on the portal homepage</span>
              </div>
              <input
                type="checkbox"
                checked={editingProgram.isFeatured}
                onChange={(e) => setEditingProgram({ ...editingProgram, isFeatured: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Duration / Expected Completion</label>
              <input
                type="text"
                value={editingProgram.duration || ''}
                onChange={(e) => setEditingProgram({ ...editingProgram, duration: e.target.value })}
                placeholder="e.g. 3 Academic Years, 4 Semesters"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Public Description</label>
              <textarea
                rows={3}
                value={editingProgram.publicDescription || ''}
                onChange={(e) => setEditingProgram({ ...editingProgram, publicDescription: e.target.value })}
                placeholder="Provide details about the curriculum, facilities, and academic outcomes..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Prerequisites / Requirements</label>
              <input
                type="text"
                value={editingProgram.requirements || ''}
                onChange={(e) => setEditingProgram({ ...editingProgram, requirements: e.target.value })}
                placeholder="e.g. Credit pass in Mathematics & English"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingProgram(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Offering'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================================================== */}
      {/* EDIT / CREATE NEWS POST MODAL */}
      {/* ===================================================================== */}
      {editingNews && (
        <Modal
          isOpen={true}
          onClose={() => setEditingNews(null)}
          title={editingNews.id ? 'Edit Article' : 'Create New Article'}
          subtitle="Publish news, admissions guides, or campus stories."
          maxWidth="2xl"
        >
          <form onSubmit={handleSaveNews} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Article Title *</label>
                <input
                  type="text"
                  required
                  value={editingNews.title || ''}
                  onChange={(e) => setEditingNews({ ...editingNews, title: e.target.value })}
                  placeholder="e.g. Admissions Guide 2026/2027"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Custom Slug (Optional)</label>
                <input
                  type="text"
                  value={editingNews.slug || ''}
                  onChange={(e) => setEditingNews({ ...editingNews, slug: e.target.value })}
                  placeholder="auto-generated from title"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={editingNews.category || 'Admissions & Enrollment'}
                  onChange={(e) => setEditingNews({ ...editingNews, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="Admissions & Enrollment">Admissions & Enrollment</option>
                  <option value="Academic Excellence">Academic Excellence</option>
                  <option value="Campus & Student Life">Campus & Student Life</option>
                  <option value="STEM & Innovations">STEM & Innovations</option>
                  <option value="General Announcements">General Announcements</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Publication Status</label>
                <select
                  value={editingNews.status || 'published'}
                  onChange={(e) => setEditingNews({ ...editingNews, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="published">Published (Visible Publicly)</option>
                  <option value="draft">Draft (Internal Only)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Summary / Excerpt</label>
              <textarea
                rows={2}
                value={editingNews.summary || ''}
                onChange={(e) => setEditingNews({ ...editingNews, summary: e.target.value })}
                placeholder="Brief 1-2 sentence overview shown in listings..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Article Content (Rich Text / HTML) *</label>
              <textarea
                rows={8}
                required
                value={editingNews.content || ''}
                onChange={(e) => setEditingNews({ ...editingNews, content: e.target.value })}
                placeholder="Write your article content here using HTML tags like <p>, <h3>, <ul>, <li>, <strong>..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:border-orange-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Scripts and dangerous tags are automatically stripped server-side to guarantee strict XSS protection.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Featured Article</span>
                <span className="text-[11px] text-slate-500">Pinned to the top of the news section</span>
              </div>
              <input
                type="checkbox"
                checked={editingNews.isFeatured || false}
                onChange={(e) => setEditingNews({ ...editingNews, isFeatured: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingNews(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Article'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================================================== */}
      {/* EDIT / CREATE IMPORTANT DATE MODAL */}
      {/* ===================================================================== */}
      {editingDate && (
        <Modal
          isOpen={true}
          onClose={() => setEditingDate(null)}
          title={editingDate.id ? 'Edit Important Date' : 'Add Important Date'}
          subtitle="Publish milestones on the admissions timeline."
        >
          <form onSubmit={handleSaveDate} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Title *</label>
              <input
                type="text"
                required
                value={editingDate.title || ''}
                onChange={(e) => setEditingDate({ ...editingDate, title: e.target.value })}
                placeholder="e.g. Entrance Examination"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Event Date (YYYY-MM-DD) *</label>
                <input
                  type="date"
                  required
                  value={editingDate.eventDate || ''}
                  onChange={(e) => setEditingDate({ ...editingDate, eventDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Time (Optional)</label>
                <input
                  type="text"
                  value={editingDate.eventTime || ''}
                  onChange={(e) => setEditingDate({ ...editingDate, eventTime: e.target.value })}
                  placeholder="09:00 AM"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={editingDate.category || 'Admission'}
                  onChange={(e) => setEditingDate({ ...editingDate, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="Admission">Admission</option>
                  <option value="Exam">Exam</option>
                  <option value="Academic">Academic</option>
                  <option value="Resumption">Resumption</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                <select
                  value={editingDate.status || 'upcoming'}
                  onChange={(e) => setEditingDate({ ...editingDate, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="past">Past</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
              <textarea
                rows={2}
                value={editingDate.description || ''}
                onChange={(e) => setEditingDate({ ...editingDate, description: e.target.value })}
                placeholder="Optional details for applicants..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-900">Publicly Visible</span>
              <input
                type="checkbox"
                checked={editingDate.isPubliclyVisible !== false}
                onChange={(e) => setEditingDate({ ...editingDate, isPubliclyVisible: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingDate(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Date'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================================================== */}
      {/* EDIT / CREATE REQUIREMENT MODAL */}
      {/* ===================================================================== */}
      {editingReq && (
        <Modal
          isOpen={true}
          onClose={() => setEditingReq(null)}
          title={editingReq.id ? 'Edit Requirement' : 'Add Admission Requirement'}
          subtitle="Configure prerequisites for applicants."
        >
          <form onSubmit={handleSaveRequirement} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Title *</label>
              <input
                type="text"
                required
                value={editingReq.title || ''}
                onChange={(e) => setEditingReq({ ...editingReq, title: e.target.value })}
                placeholder="e.g. Birth Certificate or Age Declaration"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Scope</label>
              <select
                value={editingReq.scope || 'general'}
                onChange={(e) => setEditingReq({ ...editingReq, scope: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              >
                <option value="general">General (All Applicants)</option>
                <option value="department">Department / Track Specific</option>
                <option value="class">Class / Level Specific</option>
              </select>
            </div>

            {editingReq.scope === 'department' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Department</label>
                <select
                  value={editingReq.departmentId || ''}
                  onChange={(e) =>
                    setEditingReq({ ...editingReq, departmentId: parseInt(e.target.value, 10) || undefined })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Description *</label>
              <textarea
                rows={3}
                required
                value={editingReq.description || ''}
                onChange={(e) => setEditingReq({ ...editingReq, description: e.target.value })}
                placeholder="Detailed guidance on accepted format, issuing authority, or criteria..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-900">Mandatory Prerequisite</span>
              <input
                type="checkbox"
                checked={editingReq.isMandatory !== false}
                onChange={(e) => setEditingReq({ ...editingReq, isMandatory: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingReq(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Requirement'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================================================== */}
      {/* EDIT / CREATE FAQ MODAL */}
      {/* ===================================================================== */}
      {editingFaq && (
        <Modal
          isOpen={true}
          onClose={() => setEditingFaq(null)}
          title={editingFaq.id ? 'Edit FAQ' : 'Add FAQ'}
          subtitle="Publish answers for prospective students and parents."
        >
          <form onSubmit={handleSaveFaq} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Question *</label>
              <input
                type="text"
                required
                value={editingFaq.question || ''}
                onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                placeholder="e.g. When does admission close?"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
              <select
                value={editingFaq.category || 'Admissions'}
                onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              >
                <option value="Admissions">Admissions</option>
                <option value="Requirements">Requirements</option>
                <option value="Financial">Financial</option>
                <option value="Academic">Academic</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Answer (Rich Text / HTML) *</label>
              <textarea
                rows={4}
                required
                value={editingFaq.answer || ''}
                onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                placeholder="Provide a clear, reassuring answer..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-900">Published Live</span>
              <input
                type="checkbox"
                checked={editingFaq.isPublished !== false}
                onChange={(e) => setEditingFaq({ ...editingFaq, isPublished: e.target.checked })}
                className="w-4 h-4 text-orange-600 rounded-sm cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingFaq(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save FAQ'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ===================================================================== */}
      {deleteConfirmation && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmation(null)}
          title="Confirm Deletion"
          subtitle="This item will be permanently removed from the portal."
          maxWidth="sm"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <p className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete <span className="font-bold">"{deleteConfirmation.title}"</span>?
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {saving ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
