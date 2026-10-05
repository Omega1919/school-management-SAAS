import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Eye,
  Save,
  Send,
  Trash2,
  Edit3,
  Check,
  X,
  AlertCircle,
  Plus,
  Image as ImageIcon,
  MoveUp,
  MoveDown,
  Sparkles,
  BookOpen,
  Calendar,
  CheckCircle2,
  HelpCircle,
  Phone,
  Mail,
  Clock,
  Building2,
  FileText,
  Upload,
  RefreshCw,
  Info,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { DatePicker } from '../components/DatePicker.tsx';
import { sanitizeHtml } from '../lib/sanitize.ts';

// Preset safe hero images for quick selection in Hero Slide Manager
import defaultHero1 from '../assets/images/library_scholar_top_banner_1790844349643.jpg';
import defaultHero2 from '../assets/images/library_study_circle_1790843982330.jpg';
import defaultHero3 from '../assets/images/campus_quad_walkway_1790843995898.jpg';
import defaultHero4 from '../assets/images/science_lab_scholar_1790844011577.jpg';
import defaultHero5 from '../assets/images/modern_auditorium_hall_1790844023473.jpg';

interface HeroSlide {
  id: number;
  imageUrl: string;
  title?: string;
  altText?: string;
  displayOrder: number;
  isActive: boolean;
}

interface ProgramItem {
  id: number;
  name: string;
  section?: string;
  gradeLevel?: string;
  capacity: number;
  duration?: string;
  publicDescription?: string;
  requirements?: string;
  admissionStatus: 'available' | 'closed' | 'hidden';
  isFeatured: boolean;
  isPubliclyVisible: boolean;
}

interface DateItem {
  id: number;
  title: string;
  description?: string;
  eventDate: string;
  eventTime?: string;
  category: string;
  status: string;
  displayOrder: number;
}

interface RequirementItem {
  id: number;
  title: string;
  description: string;
  scope: string;
  isMandatory: boolean;
  isPubliclyVisible: boolean;
  displayOrder: number;
}

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  displayOrder: number;
  isPublished: boolean;
}

interface NewsItem {
  id: number;
  title: string;
  summary?: string;
  category: string;
  status: string;
  isFeatured: boolean;
}

interface PortalSettingsState {
  heroTitle: string;
  heroSubtitle: string;
  heroBadgeText: string;
  heroPrimaryCtaText: string;
  heroSecondaryCtaText: string;
  announcementMessage: string;
  applicationInstructions: string;
  applicationFee: string;
  admissionsContactInfo: string;
  officeHours: string;
  openingDate: string;
  closingDate: string;
  admissionsOpen: boolean;
  portalEnabled: boolean;
  showPrograms: boolean;
  showRequirements: boolean;
  showImportantDates: boolean;
  showNews: boolean;
  showFaqs: boolean;
  showContact: boolean;
}

interface AdmissionsVisualEditorViewProps {
  onBack: () => void;
}

export const AdmissionsVisualEditorView: React.FC<AdmissionsVisualEditorViewProps> = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [isEditMode, setIsEditMode] = useState(true);

  // Unsaved changes tracking
  const [isDirty, setIsDraftDirty] = useState(false);
  const [hasUnpublished, setHasUnpublished] = useState(false);

  // Live vs Draft Settings
  const [settings, setSettings] = useState<PortalSettingsState>({
    heroTitle: "Let's fly to your Dream Academy",
    heroSubtitle: 'Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.',
    heroBadgeText: 'Admissions Intake Open',
    heroPrimaryCtaText: 'Apply Online',
    heroSecondaryCtaText: 'Track Status',
    announcementMessage: 'Applications are now officially open for admission into accredited programmes.',
    applicationInstructions: '1. Select your target program/class.\n2. Complete applicant details & guardian information.\n3. Keep your Application Number and Access Key safe to track your admission status live.',
    applicationFee: '0.00',
    admissionsContactInfo: 'Admissions Office: admissions@school.edu • Direct Line: +234 803 111 2233',
    officeHours: 'Mon - Sat • 8:00 AM - 5:00 PM',
    openingDate: '2026-08-01',
    closingDate: '2027-01-31',
    admissionsOpen: true,
    portalEnabled: true,
    showPrograms: true,
    showRequirements: true,
    showImportantDates: true,
    showNews: true,
    showFaqs: true,
    showContact: true,
  });

  // Entities
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [importantDatesList, setImportantDatesList] = useState<DateItem[]>([]);
  const [requirementsList, setRequirementsList] = useState<RequirementItem[]>([]);
  const [faqsList, setFaqsList] = useState<FaqItem[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; motto: string }>({
    schoolName: 'Springfield Academy',
    motto: 'Excellence in Character & Knowledge',
  });

  // Modal / Popover Edit States
  const [activeEditTarget, setActiveEditTarget] = useState<string | null>(null);
  const [editModalData, setEditModalData] = useState<any>({});
  const [isHeroSlideModalOpen, setIsHeroSlideModalOpen] = useState(false);
  const [newSlideUrl, setNewSlideUrl] = useState('');
  const [newSlideTitle, setNewSlideTitle] = useState('');
  const [newSlideAlt, setNewSlideAlt] = useState('');

  useEffect(() => {
    fetchEditorContent();
  }, []);

  const fetchEditorContent = async () => {
    try {
      setLoading(true);
      setErrorNotice(null);
      const res = await apiRequest<any>('/public-portal/admin/editor-content');

      const live = res.liveSettings || {};
      const draft = res.draftSettings || null;

      const mergedSettings: PortalSettingsState = {
        heroTitle: (draft?.heroTitle ?? live.heroTitle) || "Let's fly to your Dream Academy",
        heroSubtitle: (draft?.heroSubtitle ?? live.heroSubtitle) || 'Your dream education is just a few clicks away.',
        heroBadgeText: (draft?.heroBadgeText ?? live.heroBadgeText) || 'Admissions Intake Open',
        heroPrimaryCtaText: (draft?.heroPrimaryCtaText ?? live.heroPrimaryCtaText) || 'Apply Online',
        heroSecondaryCtaText: (draft?.heroSecondaryCtaText ?? live.heroSecondaryCtaText) || 'Track Status',
        announcementMessage: (draft?.announcementMessage ?? live.announcementMessage) || '',
        applicationInstructions: (draft?.applicationInstructions ?? live.applicationInstructions) || '',
        applicationFee: (draft?.applicationFee ?? live.applicationFee) || '0.00',
        admissionsContactInfo: (draft?.admissionsContactInfo ?? live.admissionsContactInfo) || '',
        officeHours: (draft?.officeHours ?? live.officeHours) || 'Mon - Sat • 8:00 AM - 5:00 PM',
        openingDate: (draft?.openingDate ?? live.openingDate) || '',
        closingDate: (draft?.closingDate ?? live.closingDate) || '',
        admissionsOpen: draft?.admissionsOpen !== undefined ? draft.admissionsOpen : live.admissionsOpen ?? true,
        portalEnabled: draft?.portalEnabled !== undefined ? draft.portalEnabled : live.portalEnabled ?? true,
        showPrograms: draft?.showPrograms !== undefined ? draft.showPrograms : live.showPrograms ?? true,
        showRequirements: draft?.showRequirements !== undefined ? draft.showRequirements : live.showRequirements ?? true,
        showImportantDates: draft?.showImportantDates !== undefined ? draft.showImportantDates : live.showImportantDates ?? true,
        showNews: draft?.showNews !== undefined ? draft.showNews : live.showNews ?? true,
        showFaqs: draft?.showFaqs !== undefined ? draft.showFaqs : live.showFaqs ?? true,
        showContact: draft?.showContact !== undefined ? draft.showContact : live.showContact ?? true,
      };

      setSettings(mergedSettings);
      setHasUnpublished(res.hasUnpublishedChanges || false);
      setHeroSlides(res.heroSlides || []);
      setPrograms(res.programs || []);
      setImportantDatesList(res.dates || []);
      setRequirementsList(res.requirements || []);
      setFaqsList(res.faqs || []);
      setNewsList(res.news || []);

      if (res.schoolSettings) {
        setSchoolInfo({
          schoolName: res.schoolSettings.schoolName || 'Springfield Academy',
          motto: res.schoolSettings.motto || 'Excellence in Character & Knowledge',
        });
      }
    } catch (err: any) {
      console.error('Fetch editor content error:', err);
      setErrorNotice('Failed to load visual editor content. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (key: keyof PortalSettingsState, val: any) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    setIsDraftDirty(true);
  };

  // Save Draft Endpoint
  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);
      setErrorNotice(null);
      const res = await apiRequest<any>('/public-portal/admin/save-draft', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });

      if (res.success) {
        setIsDraftDirty(false);
        setHasUnpublished(true);
        setSuccessNotice('Draft saved successfully! Click "Publish Changes" when ready to make it public.');
        setTimeout(() => setSuccessNotice(null), 4000);
      }
    } catch (err: any) {
      console.error('Save draft error:', err);
      setErrorNotice(err.message || 'Failed to save draft changes.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Publish Endpoint
  const handlePublish = async () => {
    try {
      setPublishing(true);
      setErrorNotice(null);
      const res = await apiRequest<any>('/public-portal/admin/publish', {
        method: 'POST',
        body: JSON.stringify(settings),
      });

      if (res.success) {
        setIsDraftDirty(false);
        setHasUnpublished(false);
        setSuccessNotice('🎉 Admissions page changes published LIVE successfully!');
        setTimeout(() => setSuccessNotice(null), 5000);
      }
    } catch (err: any) {
      console.error('Publish error:', err);
      setErrorNotice(err.message || 'Failed to publish changes to live website.');
    } finally {
      setPublishing(false);
    }
  };

  // Discard Draft Endpoint
  const handleDiscardDraft = async () => {
    if (!confirm('Are you sure you want to discard unsaved draft changes? The editor will revert to the live published page.')) return;
    try {
      setLoading(true);
      await apiRequest<any>('/public-portal/admin/discard-draft', { method: 'POST' });
      await fetchEditorContent();
      setIsDraftDirty(false);
      setSuccessNotice('Draft discarded. Reset to live published settings.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice('Failed to discard draft.');
    } finally {
      setLoading(false);
    }
  };

  // Hero Slide Management Handlers
  const handleAddHeroSlide = async (url: string, titleStr: string, alt: string) => {
    try {
      setErrorNotice(null);
      const res = await apiRequest<any>('/public-portal/admin/hero-slides', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: url,
          title: titleStr,
          altText: alt || 'Campus Hero Slide',
          isActive: true,
          displayOrder: heroSlides.length,
        }),
      });
      if (res.slide) {
        setHeroSlides((prev) => [...prev, res.slide]);
        setNewSlideUrl('');
        setNewSlideTitle('');
        setNewSlideAlt('');
        setSuccessNotice('Hero slide added successfully.');
        setTimeout(() => setSuccessNotice(null), 3000);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to add hero slide.');
    }
  };

  const handleToggleSlideActive = async (slide: HeroSlide) => {
    try {
      const res = await apiRequest<any>(`/public-portal/admin/hero-slides/${slide.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !slide.isActive }),
      });
      if (res.slide) {
        setHeroSlides((prev) => prev.map((s) => (s.id === slide.id ? res.slide : s)));
      }
    } catch (err) {
      setErrorNotice('Failed to update slide status.');
    }
  };

  const handleDeleteSlide = async (slideId: number) => {
    if (!confirm('Remove this background hero slide?')) return;
    try {
      await apiRequest<any>(`/public-portal/admin/hero-slides/${slideId}`, { method: 'DELETE' });
      setHeroSlides((prev) => prev.filter((s) => s.id !== slideId));
      setSuccessNotice('Hero slide removed.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err) {
      setErrorNotice('Failed to delete slide.');
    }
  };

  // Inline Click Editor Opener
  const openEditorFor = (target: string, initialValue?: any) => {
    setActiveEditTarget(target);
    setEditModalData(initialValue || {});
  };

  const closeInlineEditor = () => {
    setActiveEditTarget(null);
    setEditModalData({});
  };

  // Entity Save Handlers (Programs, FAQs, Dates, Requirements)
  const handleSaveProgramEdit = async (progId: number, data: Partial<ProgramItem>) => {
    try {
      const res = await apiRequest<any>(`/public-portal/admin/programs/${progId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (res.program) {
        setPrograms((prev) => prev.map((p) => (p.id === progId ? { ...p, ...res.program } : p)));
        setSuccessNotice(`Updated program: ${res.program.name}`);
        setTimeout(() => setSuccessNotice(null), 3000);
      }
      closeInlineEditor();
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update program settings');
    }
  };

  const handleSaveFaqEdit = async (faqId: number, data: Partial<FaqItem>) => {
    try {
      const res = await apiRequest<any>(`/public-portal/admin/faqs/${faqId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (res.faq) {
        setFaqsList((prev) => prev.map((f) => (f.id === faqId ? res.faq : f)));
        setSuccessNotice('FAQ updated');
        setTimeout(() => setSuccessNotice(null), 3000);
      }
      closeInlineEditor();
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update FAQ');
    }
  };

  const handleSaveDateEdit = async (dateId: number, data: Partial<DateItem>) => {
    try {
      const res = await apiRequest<any>(`/public-portal/admin/dates/${dateId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (res.date) {
        setImportantDatesList((prev) => prev.map((d) => (d.id === dateId ? res.date : d)));
        setSuccessNotice('Important date updated');
        setTimeout(() => setSuccessNotice(null), 3000);
      }
      closeInlineEditor();
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update date item');
    }
  };

  const handleSaveRequirementEdit = async (reqId: number, data: Partial<RequirementItem>) => {
    try {
      const res = await apiRequest<any>(`/public-portal/admin/requirements/${reqId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (res.requirement) {
        setRequirementsList((prev) => prev.map((r) => (r.id === reqId ? res.requirement : r)));
        setSuccessNotice('Requirement updated');
        setTimeout(() => setSuccessNotice(null), 3000);
      }
      closeInlineEditor();
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update requirement');
    }
  };

  // Custom Local File Upload for Hero Image
  const handleLocalHeroFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorNotice('Image file size exceeds 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setNewSlideUrl(result);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6">
        <div className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-300">Loading Admissions Visual Editor Canvas...</p>
      </div>
    );
  }

  // Active images for background
  const activeSlides = heroSlides.filter((s) => s.isActive);
  const displayBackgrounds =
    activeSlides.length > 0
      ? activeSlides.map((s) => ({ src: s.imageUrl, title: s.title || s.altText || 'Hero Slide' }))
      : [
          { src: defaultHero1, title: 'Library Scholar' },
          { src: defaultHero2, title: 'Study Circle' },
          { src: defaultHero3, title: 'Campus Quad' },
          { src: defaultHero4, title: 'Science Lab' },
          { src: defaultHero5, title: 'Auditorium' },
        ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-purple-500 selection:text-white">
      {/* ========================================================================= */}
      {/* 1. EDITOR SHELL HEADER (Sticky Control Bar - Fluid & Responsive)         */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 shadow-xl">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (isDirty && !confirm('You have unsaved draft changes. Leave without saving?')) return;
              onBack();
            }}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Back to CMS</span>
            <span className="inline sm:hidden">Back</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-black text-white tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="truncate max-w-[130px] xs:max-w-[200px] sm:max-w-none">Admissions Visual Editor</span>
            </span>
            {hasUnpublished && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                Draft Pending
              </span>
            )}
            {isDirty && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse shrink-0">
                Unsaved
              </span>
            )}
          </div>
        </div>

        {/* Editor Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-wrap">
          <button
            type="button"
            onClick={() => setIsEditMode((prev) => !prev)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              isEditMode ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{isEditMode ? 'Editing On' : 'Preview'}</span>
          </button>

          {hasUnpublished && (
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800/50 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              title="Discard pending draft"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Discard</span>
            </button>
          )}

          <button
            type="button"
            disabled={savingDraft || !isDirty}
            onClick={handleSaveDraft}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs transition-all border border-slate-700 cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            {savingDraft ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span className="hidden xs:inline">Save Draft</span>
            <span className="inline xs:hidden">Save</span>
          </button>

          <button
            type="button"
            disabled={publishing}
            onClick={handlePublish}
            className="px-3 sm:px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs transition-all shadow-md shadow-purple-600/30 cursor-pointer flex items-center gap-1.5"
          >
            {publishing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Publish</span>
          </button>
        </div>
      </header>

      {/* Notifications Alert Bar */}
      {errorNotice && (
        <div className="bg-rose-950/90 border-b border-rose-800 px-4 py-2 text-xs font-bold text-rose-200 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button type="button" onClick={() => setErrorNotice(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="bg-emerald-950/90 border-b border-emerald-800 px-4 py-2 text-xs font-bold text-emerald-200 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button type="button" onClick={() => setSuccessNotice(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Helper Editing Banner */}
      {isEditMode && (
        <div className="bg-purple-950/60 border-b border-purple-900/50 px-4 py-1.5 text-[11px] font-semibold text-purple-200 flex items-center justify-center gap-2 text-center">
          <Info className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>
            <strong>Visual Edit Mode Active:</strong> Click directly on any text, badge, or section to edit.
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VISUAL CANVAS (Fully fluid & responsive across all screen sizes)      */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto bg-slate-950 w-full flex flex-col">
        <div className="w-full min-h-screen bg-white text-slate-900 font-sans">
            {/* Top Announcement Marquee */}
            {settings.announcementMessage && (
              <div
                onClick={() => isEditMode && openEditorFor('announcement')}
                className={`w-full overflow-hidden py-2 border-b border-stone-200/60 bg-stone-50/80 text-slate-800 text-xs font-semibold relative group ${
                  isEditMode ? 'cursor-pointer hover:bg-purple-50/50 border-2 border-dashed border-transparent hover:border-purple-500/70' : ''
                }`}
                title={isEditMode ? 'Click to edit Top Announcement Bar' : undefined}
              >
                {isEditMode && (
                  <div className="absolute top-1 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow-md">
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Announcement</span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="truncate">{settings.announcementMessage}</span>
                  {settings.openingDate && (
                    <span className="text-[11px] text-purple-700 font-bold ml-auto shrink-0 hidden sm:inline">
                      Intake: {settings.openingDate} — {settings.closingDate || 'Open'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Top Navigation Header */}
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-2xs">
              <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-purple-600 flex items-center justify-center text-white font-black text-sm sm:text-lg shadow-md shadow-purple-600/30 shrink-0">
                    <GraduationCap className="w-4 h-4 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm sm:text-lg lg:text-xl font-black text-slate-900 block leading-tight tracking-tight truncate">
                      {schoolInfo.schoolName.split(' ')[0]} <span className="text-purple-600 font-normal">Admissions</span>
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-stone-500 font-bold uppercase tracking-wider block truncate">
                      {schoolInfo.motto}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => isEditMode && openEditorFor('cta_primary')}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-600 text-white font-bold text-xs sm:text-sm rounded-full shadow-md shadow-purple-600/30 flex items-center gap-1.5 relative group ${
                      isEditMode ? 'hover:bg-purple-700 border-2 border-dashed border-transparent hover:border-amber-300' : ''
                    }`}
                  >
                    <span>{settings.heroPrimaryCtaText}</span>
                    <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            </header>

            {/* ========================================================================= */}
            {/* HERO SECTION (Interactive Click-to-Edit)                                 */}
            {/* ========================================================================= */}
            <section className="relative min-h-[520px] sm:min-h-[580px] lg:min-h-[640px] flex flex-col justify-between p-4 sm:p-8 lg:p-12 overflow-hidden text-white bg-slate-950">
              {/* Background Carousel */}
              <div className="absolute inset-0 z-0 overflow-hidden select-none bg-slate-950">
                {displayBackgrounds.map((img, idx) => (
                  <div key={idx} className={`absolute inset-0 transition-opacity duration-1000 ${idx === 0 ? 'opacity-100' : 'opacity-0'}`}>
                    <img src={img.src} alt={img.title} className="w-full h-full object-cover" />
                  </div>
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-slate-950/50 to-black/60" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-black/60" />
              </div>

              {/* Background Slide Control Trigger */}
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setIsHeroSlideModalOpen(true)}
                  className="absolute top-4 right-4 z-20 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-purple-400/40 text-purple-300 text-xs font-extrabold flex items-center gap-2 shadow-2xl cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  <span>Manage Hero Slides ({heroSlides.length})</span>
                </button>
              )}

              {/* Hero Main Content */}
              <div className="relative z-10 text-center max-w-4xl mx-auto my-auto py-8">
                {/* Hero Badge */}
                {settings.heroBadgeText && (
                  <div
                    onClick={() => isEditMode && openEditorFor('hero_badge')}
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 backdrop-blur-md border border-purple-400/30 text-xs font-extrabold uppercase tracking-wider text-purple-300 mb-4 shadow-lg relative group ${
                      isEditMode ? 'cursor-pointer hover:bg-purple-500/40 border-2 border-dashed border-purple-400' : ''
                    }`}
                    title={isEditMode ? 'Click to edit Hero Badge' : undefined}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                    <span>{settings.heroBadgeText}</span>
                    {isEditMode && <Edit3 className="w-3 h-3 text-amber-300 ml-1 opacity-80" />}
                  </div>
                )}

                {/* Hero Title */}
                <h1
                  onClick={() => isEditMode && openEditorFor('hero_title')}
                  className={`text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-white drop-shadow-2xl relative p-2 rounded-2xl transition-all ${
                    isEditMode ? 'cursor-pointer hover:bg-purple-900/30 border-2 border-dashed border-transparent hover:border-purple-400' : ''
                  }`}
                  title={isEditMode ? 'Click to edit Hero Title' : undefined}
                >
                  {settings.heroTitle}
                </h1>

                {/* Hero Subtitle */}
                <div className="mt-4 sm:mt-6 max-w-2xl mx-auto">
                  <p
                    onClick={() => isEditMode && openEditorFor('hero_subtitle')}
                    className={`text-xs sm:text-sm md:text-base font-semibold text-white leading-relaxed drop-shadow-xl bg-black/60 backdrop-blur-md px-5 sm:px-7 py-3 sm:py-4 rounded-2xl border border-white/20 shadow-2xl inline-block relative transition-all ${
                      isEditMode ? 'cursor-pointer hover:bg-purple-950/80 border-2 border-dashed border-purple-400' : ''
                    }`}
                    title={isEditMode ? 'Click to edit Hero Subtitle' : undefined}
                  >
                    {settings.heroSubtitle}
                  </p>
                </div>

                {/* CTA Buttons preview */}
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => isEditMode && openEditorFor('cta_primary')}
                    className={`px-6 py-3 bg-purple-600 text-white font-extrabold text-xs sm:text-sm rounded-full shadow-lg shadow-purple-600/40 flex items-center gap-2 cursor-pointer ${
                      isEditMode ? 'border-2 border-dashed border-purple-300' : ''
                    }`}
                  >
                    <span>{settings.heroPrimaryCtaText}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => isEditMode && openEditorFor('cta_secondary')}
                    className={`px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs sm:text-sm rounded-full backdrop-blur-md border border-white/30 flex items-center gap-2 cursor-pointer ${
                      isEditMode ? 'border-2 border-dashed border-purple-300' : ''
                    }`}
                  >
                    <span>{settings.heroSecondaryCtaText}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* ========================================================================= */}
            {/* ADMISSIONS INSTRUCTIONS SECTION                                         */}
            {/* ========================================================================= */}
            <section
              onClick={() => isEditMode && openEditorFor('instructions')}
              className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-b border-stone-200/80 bg-stone-50/50 relative group ${
                isEditMode ? 'cursor-pointer hover:bg-purple-50/40 border-2 border-dashed border-transparent hover:border-purple-400' : ''
              }`}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1 max-w-2xl">
                  <span className="text-xs font-black text-purple-700 uppercase tracking-widest block">
                    Admissions Guidance & Fee
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">Application Instructions</h3>
                  <p className="text-xs sm:text-sm text-stone-600 whitespace-pre-line leading-relaxed">
                    {settings.applicationInstructions}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs text-center shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">Registration Fee</span>
                  <div className="text-2xl font-black text-purple-900 mt-0.5">${settings.applicationFee}</div>
                </div>
              </div>
            </section>

            {/* ========================================================================= */}
            {/* PROGRAMS & OFFERINGS SECTION                                            */}
            {/* ========================================================================= */}
            {settings.showPrograms && (
              <section id="programs" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                      <span>Curriculum & Placement</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                      Accredited <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Programs & Classes</span>
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {programs.slice(0, 6).map((prog) => (
                    <div
                      key={prog.id}
                      onClick={() => isEditMode && openEditorFor('program', prog)}
                      className={`p-6 rounded-3xl border bg-white shadow-xs space-y-3 relative group transition-all duration-300 ${
                        isEditMode ? 'cursor-pointer hover:border-purple-500 hover:shadow-md hover:bg-purple-50/10' : 'border-slate-200/90'
                      }`}
                    >
                      {isEditMode && (
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 bg-purple-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 z-10 shadow-xs">
                          <Edit3 className="w-3 h-3" /> Edit
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-base group-hover:text-purple-600 transition-colors">{prog.name}</h4>
                          <span className="text-xs text-purple-600 font-semibold">{prog.section || 'General Track'}</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            prog.admissionStatus === 'available' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' : 'bg-rose-50 text-rose-700 border border-rose-200/70'
                          }`}
                        >
                          {prog.admissionStatus === 'available' ? '● Open' : '○ Closed'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {prog.publicDescription || 'Comprehensive curriculum with specialized instruction.'}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Small text-only See All Classes button in Preview */}
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => programs.length > 0 && openEditorFor('program', programs[0])}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer group"
                  >
                    <span>See all classes</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-purple-600" />
                  </button>
                </div>
              </section>
            )}

            {/* ========================================================================= */}
            {/* IMPORTANT DATES SECTION                                                 */}
            {/* ========================================================================= */}
            {settings.showImportantDates && (
              <section id="dates" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 bg-slate-50/70 border-y border-slate-200/80">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>Academic Milestones</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                      Key <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Dates & Deadlines</span>
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {importantDatesList.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => isEditMode && openEditorFor('date', d)}
                      className={`p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative group transition-all duration-300 ${
                        isEditMode ? 'cursor-pointer hover:border-purple-500 hover:shadow-md hover:bg-purple-50/10' : ''
                      }`}
                    >
                      {isEditMode && (
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 bg-purple-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 z-10 shadow-xs">
                          <Edit3 className="w-3 h-3" /> Edit
                        </div>
                      )}
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200/60 px-2 py-0.5 rounded-md inline-block">{d.category}</span>
                      <h4 className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors">{d.title}</h4>
                      <p className="text-xs font-mono font-bold text-purple-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-purple-500" />
                        <span>{d.eventDate} {d.eventTime ? `• ${d.eventTime}` : ''}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ========================================================================= */}
            {/* REQUIREMENTS SECTION                                                     */}
            {/* ========================================================================= */}
            {settings.showRequirements && (
              <section id="requirements" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                      <span>Prerequisites</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                      Admission <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Requirements</span>
                    </h2>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {requirementsList.map((r, idx) => (
                    <div
                      key={r.id}
                      onClick={() => isEditMode && openEditorFor('requirement', r)}
                      className={`p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-start gap-4 relative group transition-all duration-300 ${
                        isEditMode ? 'cursor-pointer hover:border-purple-500 hover:shadow-md hover:bg-purple-50/10' : ''
                      }`}
                    >
                      <span className="w-7 h-7 rounded-xl bg-purple-50 text-purple-700 font-extrabold text-xs flex items-center justify-center font-mono border border-purple-200/60 shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors">{r.title}</h4>
                          {r.isMandatory && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Mandatory
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{r.description}</p>
                      </div>
                      {isEditMode && (
                        <div className="opacity-0 group-hover:opacity-100 bg-purple-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shrink-0 shadow-xs">
                          <Edit3 className="w-3 h-3" /> Edit
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ========================================================================= */}
            {/* FAQ SECTION                                                              */}
            {/* ========================================================================= */}
            {settings.showFaqs && (
              <section id="faqs" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 bg-slate-50/70 border-t border-slate-200/80">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                      <span>Got Questions?</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                      Frequently Asked <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Questions</span>
                    </h2>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {faqsList.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => isEditMode && openEditorFor('faq', f)}
                      className={`p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative group transition-all duration-300 ${
                        isEditMode ? 'cursor-pointer hover:border-purple-500 hover:shadow-md hover:bg-purple-50/10' : ''
                      }`}
                    >
                      {isEditMode && (
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 bg-purple-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-xs">
                          <Edit3 className="w-3 h-3" /> Edit FAQ
                        </div>
                      )}
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 group-hover:text-purple-600 transition-colors">
                        <HelpCircle className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>{f.question}</span>
                      </h4>
                      <p
                        className="text-xs text-slate-600 pl-6 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(f.answer) }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ========================================================================= */}
            {/* CONTACT FOOTER SECTION                                                   */}
            {/* ========================================================================= */}
            {settings.showContact && (
              <footer
                onClick={() => isEditMode && openEditorFor('contact')}
                className={`bg-slate-950 text-white px-4 sm:px-8 py-12 border-t border-slate-800 relative group ${
                  isEditMode ? 'cursor-pointer hover:bg-slate-900 border-2 border-dashed border-purple-500/50' : ''
                }`}
              >
                {isEditMode && (
                  <div className="absolute top-3 right-4 opacity-0 group-hover:opacity-100 bg-purple-600 text-white px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5" /> Edit Contact Info
                  </div>
                )}
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <h4 className="font-extrabold text-base text-purple-400 mb-2">{schoolInfo.schoolName}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{settings.admissionsContactInfo}</p>
                  </div>
                  <div>
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">Office Hours</h5>
                    <p className="text-xs text-slate-300 font-mono">{settings.officeHours}</p>
                  </div>
                  <div>
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">Platform Identity</h5>
                    <p className="text-xs text-slate-400">Integrated Academic SaaS Admissions Portal</p>
                  </div>
                </div>
              </footer>
            )}
          </div>
        </div>

      {/* ========================================================================= */}
      {/* 3. HERO SLIDES MANAGER MODAL                                              */}
      {/* ========================================================================= */}
      {isHeroSlideModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 flex items-center justify-center animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 text-slate-100 space-y-4 sm:space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-purple-400 shrink-0" />
                <span>Hero Background Slides Manager</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsHeroSlideModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Slides Grid */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase text-purple-400 block">Active Hero Backgrounds</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1">
                {heroSlides.map((slide) => (
                  <div key={slide.id} className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 group">
                    <img src={slide.imageUrl} alt={slide.altText || 'Slide'} className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => handleToggleSlideActive(slide)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            slide.isActive ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {slide.isActive ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700"
                          title="Delete slide"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-200 truncate">{slide.title || slide.altText}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Slide Controls */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <span className="text-xs font-bold uppercase text-purple-400 block">Add New Hero Slide</span>

              {/* Preset Selection Buttons */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400">Quick Select Bundled Campus Photography</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { src: defaultHero1, name: 'Library Scholar' },
                    { src: defaultHero2, name: 'Study Circle' },
                    { src: defaultHero3, name: 'Campus Quad' },
                    { src: defaultHero4, name: 'Science Lab' },
                    { src: defaultHero5, name: 'Auditorium' },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddHeroSlide(preset.src, preset.name, preset.name)}
                      className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-purple-900/60 border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition-colors"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Local File Upload */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-400">Or Upload Custom Image (JPEG, PNG, WebP up to 10MB)</label>
                <div className="flex items-center gap-2">
                  <label className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-md flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose Image File</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLocalHeroFileUpload} className="hidden" />
                  </label>
                  {newSlideUrl && (
                    <button
                      type="button"
                      onClick={() => handleAddHeroSlide(newSlideUrl, newSlideTitle || 'Custom Slide', newSlideAlt || 'Custom Image')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Add Uploaded Slide
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHeroSlideModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close Slide Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. INLINE EDITING POPOVER MODAL DIALOG                                   */}
      {/* ========================================================================= */}
      {activeEditTarget && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 text-slate-100 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="truncate">Edit {activeEditTarget.replace('_', ' ')}</span>
              </h3>
              <button type="button" onClick={closeInlineEditor} className="text-slate-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Editors */}
            {activeEditTarget === 'hero_badge' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Hero Badge Text</label>
                <input
                  type="text"
                  value={settings.heroBadgeText}
                  onChange={(e) => handleFieldChange('heroBadgeText', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            {activeEditTarget === 'hero_title' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Hero Main Title / Headline</label>
                <input
                  type="text"
                  value={settings.heroTitle}
                  onChange={(e) => handleFieldChange('heroTitle', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            {activeEditTarget === 'hero_subtitle' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Hero Subtitle Paragraph</label>
                <textarea
                  rows={3}
                  value={settings.heroSubtitle}
                  onChange={(e) => handleFieldChange('heroSubtitle', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-hidden focus:border-purple-500 resize-none"
                />
              </div>
            )}

            {activeEditTarget === 'cta_primary' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Primary CTA Button Label</label>
                <input
                  type="text"
                  value={settings.heroPrimaryCtaText}
                  onChange={(e) => handleFieldChange('heroPrimaryCtaText', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            {activeEditTarget === 'cta_secondary' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Secondary CTA Button Label</label>
                <input
                  type="text"
                  value={settings.heroSecondaryCtaText}
                  onChange={(e) => handleFieldChange('heroSecondaryCtaText', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}

            {activeEditTarget === 'announcement' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Top Announcement Ticker Message</label>
                  <input
                    type="text"
                    value={settings.announcementMessage}
                    onChange={(e) => handleFieldChange('announcementMessage', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Opening Date</label>
                    <input
                      type="date"
                      value={settings.openingDate}
                      onChange={(e) => handleFieldChange('openingDate', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Closing Date</label>
                    <input
                      type="date"
                      value={settings.closingDate}
                      onChange={(e) => handleFieldChange('closingDate', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeEditTarget === 'instructions' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Application Instructions</label>
                  <textarea
                    rows={4}
                    value={settings.applicationInstructions}
                    onChange={(e) => handleFieldChange('applicationInstructions', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Application Fee ($)</label>
                  <input
                    type="text"
                    value={settings.applicationFee}
                    onChange={(e) => handleFieldChange('applicationFee', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {activeEditTarget === 'contact' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Admissions Office Contact Information</label>
                  <input
                    type="text"
                    value={settings.admissionsContactInfo}
                    onChange={(e) => handleFieldChange('admissionsContactInfo', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Office Hours</label>
                  <input
                    type="text"
                    value={settings.officeHours}
                    onChange={(e) => handleFieldChange('officeHours', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {/* Entity Item Editors */}
            {activeEditTarget === 'program' && editModalData.id && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Program Public Description</label>
                  <textarea
                    rows={3}
                    value={editModalData.publicDescription || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, publicDescription: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Admission Status</label>
                    <select
                      value={editModalData.admissionStatus || 'available'}
                      onChange={(e) => setEditModalData({ ...editModalData, admissionStatus: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="available">Available (Open)</option>
                      <option value="closed">Closed</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Duration</label>
                    <input
                      type="text"
                      value={editModalData.duration || ''}
                      onChange={(e) => setEditModalData({ ...editModalData, duration: e.target.value })}
                      placeholder="e.g. 3 Years"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveProgramEdit(editModalData.id, editModalData)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Save Program Setting
                </button>
              </div>
            )}

            {activeEditTarget === 'faq' && editModalData.id && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">FAQ Question</label>
                  <input
                    type="text"
                    value={editModalData.question || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, question: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">FAQ Answer</label>
                  <textarea
                    rows={4}
                    value={editModalData.answer || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, answer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveFaqEdit(editModalData.id, editModalData)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Save FAQ Record
                </button>
              </div>
            )}

            {activeEditTarget === 'date' && editModalData.id && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Event Title</label>
                  <input
                    type="text"
                    value={editModalData.title || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Event Date</label>
                    <input
                      type="date"
                      value={editModalData.eventDate || ''}
                      onChange={(e) => setEditModalData({ ...editModalData, eventDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Category</label>
                    <input
                      type="text"
                      value={editModalData.category || ''}
                      onChange={(e) => setEditModalData({ ...editModalData, category: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveDateEdit(editModalData.id, editModalData)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Save Date Record
                </button>
              </div>
            )}

            {activeEditTarget === 'requirement' && editModalData.id && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Requirement Title</label>
                  <input
                    type="text"
                    value={editModalData.title || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editModalData.description || ''}
                    onChange={(e) => setEditModalData({ ...editModalData, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveRequirementEdit(editModalData.id, editModalData)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Save Requirement
                </button>
              </div>
            )}

            {/* Standard Settings Target Action Buttons */}
            {['hero_badge', 'hero_title', 'hero_subtitle', 'cta_primary', 'cta_secondary', 'announcement', 'instructions', 'contact'].includes(
              activeEditTarget
            ) && (
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeInlineEditor}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
