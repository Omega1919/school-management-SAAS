import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  School,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Search,
  ArrowLeft,
  Calendar,
  Layers,
  Building2,
  User,
  Users,
  Mail,
  Phone,
  MapPin,
  Clock,
  FileText,
  ShieldCheck,
  ArrowRight,
  Quote,
  Sparkles,
  BookOpen,
  Award,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Heart,
  ArrowUpRight,
  Star,
  Compass,
  CheckCircle,
  Globe,
  HelpCircle,
  Send,
  X,
  Menu,
  AlertTriangle,
  ExternalLink,
  Share2,
  Upload,
  Trash2,
  Printer,
  Edit2,
  Camera,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { DatePicker } from '../components/DatePicker.tsx';
import { sanitizeHtml } from '../lib/sanitize.ts';
import { ScrollReveal } from '../components/ScrollReveal.tsx';

// Direct ES module image imports for 100% reliable Vite bundling & rendering
import heroBg1 from '../assets/images/library_scholar_top_banner_1790844349643.jpg';
import heroBg2 from '../assets/images/library_study_circle_1790843982330.jpg';
import heroBg3 from '../assets/images/campus_quad_walkway_1790843995898.jpg';
import heroBg4 from '../assets/images/science_lab_scholar_1790844011577.jpg';
import heroBg5 from '../assets/images/modern_auditorium_hall_1790844023473.jpg';
import heroBg6 from '../assets/images/library_scholar_female_1790793440390.jpg';

import progCard1 from '../assets/images/campus_library_student_1790788853708.jpg';
import progCard2 from '../assets/images/study_commons_lounge_1790788903218.jpg';
import progCard3 from '../assets/images/modern_lecture_hall_1790788892283.jpg';

interface PublicPortalContentResponse {
  settings: {
    portalEnabled: boolean;
    admissionsOpen: boolean;
    openingDate?: string | null;
    closingDate?: string | null;
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
    schoolName: string;
    motto?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    currencySymbol?: string;
    timezone?: string;
    currentSessionId?: number | null;
    currentSessionName?: string;
    isAdmissionsActive: boolean;
  };
  admissionsControl: {
    admissionsOpen: boolean;
    openingDate?: string | null;
    closingDate?: string | null;
    currentSessionId?: number | null;
    currentSessionName?: string;
    announcementMessage?: string;
    applicationInstructions?: string;
    applicationFee?: string;
    admissionsContactInfo?: string;
    isAdmissionsActive: boolean;
  };
  programs: Array<{
    id: number;
    name: string;
    section?: string;
    gradeLevel?: string;
    sessionId?: number;
    departmentId?: number;
    departmentName?: string;
    departmentCode?: string;
    capacity: number;
    duration?: string;
    publicDescription?: string;
    requirements?: string;
    admissionStatus: 'available' | 'closed';
    isFeatured: boolean;
  }>;
  news: Array<{
    id: number;
    title: string;
    slug: string;
    summary?: string;
    content: string;
    featuredImage?: string;
    category: string;
    authorName: string;
    publishedAt?: string;
    isFeatured: boolean;
    viewsCount: number;
  }>;
  dates: Array<{
    id: number;
    title: string;
    description?: string;
    eventDate: string;
    eventTime?: string;
    category: string;
    status: string;
    displayOrder: number;
  }>;
  requirements: Array<{
    id: number;
    title: string;
    description: string;
    scope: 'general' | 'department' | 'class';
    departmentName?: string;
    className?: string;
    isMandatory: boolean;
  }>;
  faqs: Array<{
    id: number;
    question: string;
    answer: string;
    category: string;
  }>;
  departments: Array<{
    id: number;
    code: string;
    name: string;
    description?: string;
  }>;
  sessions: Array<{
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }>;
}

interface ApplicationSuccess {
  applicationNumber: string;
  accessKey: string;
  sessionName: string;
  className: string;
}

interface TrackedApplication {
  applicationNumber: string;
  applicantName: string;
  email: string;
  phone: string;
  status: 'pending' | 'under_review' | 'needs_information' | 'approved' | 'rejected';
  sessionName: string;
  className: string;
  gradeLevel?: string;
  departmentName?: string;
  adminNotes?: string;
  reviewedAt?: string;
  enrolledStudentId?: string;
  submissionDate: string;
  lastUpdated: string;
  timeline: Array<{
    action: string;
    previousStatus?: string;
    newStatus?: string;
    notes?: string;
    createdAt: string;
  }>;
}

interface AdmissionsPublicViewProps {
  onBackToLogin: () => void;
}

const BACKGROUND_IMAGES = [
  {
    src: heroBg1,
    title: 'Academic Library & Student Scholar Life',
    subtitle: 'Dedicated student scholars thriving in state-of-the-art campus library commons',
    tag: 'Student Experience',
  },
  {
    src: heroBg2,
    title: 'Modern Library & Research Commons',
    subtitle: 'State-of-the-art academic library with expansive digital and print resources',
    tag: 'Academic Excellence',
  },
  {
    src: heroBg3,
    title: 'Inspiring Campus Quadrangle & Student Life',
    subtitle: 'Thriving multicultural student community collaborating across disciplines',
    tag: 'Campus Community',
  },
  {
    src: heroBg4,
    title: 'Advanced STEM & Innovation Laboratories',
    subtitle: 'Hands-on experiential learning in cutting-edge science and technology labs',
    tag: 'Science & Discovery',
  },
  {
    src: heroBg5,
    title: 'Interactive Auditoriums & Lecture Halls',
    subtitle: 'Distinguished faculty delivering engaging lectures in modern amphitheaters',
    tag: 'World-Class Faculty',
  },
  {
    src: heroBg6,
    title: 'Collaborative Study Lounges & Workspaces',
    subtitle: 'Spacious collaborative commons designed for group research and peer learning',
    tag: 'Collaborative Growth',
  },
];

export const AdmissionsPublicView: React.FC<AdmissionsPublicViewProps> = ({ onBackToLogin }) => {
  const [content, setContent] = useState<PublicPortalContentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Active sub-view or tab
  const [activeTab, setActiveTab] = useState<'apply' | 'track'>('apply');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isAllProgramsModalOpen, setIsAllProgramsModalOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // 10-Second Auto-Rotating Campus Background Carousel
  const [currentBgIndex, setCurrentBgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // 3D Parallax Scroll Tracking for Hero Section
  const [heroScrollY, setHeroScrollY] = useState(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setHeroScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (isFormModalOpen) setIsFormModalOpen(false);
        if (isAllProgramsModalOpen) setIsAllProgramsModalOpen(false);
        if (selectedArticle) setSelectedArticle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormModalOpen, isMobileMenuOpen, isAllProgramsModalOpen, selectedArticle]);

  // Lock body scroll when mobile menu drawer is open
  useEffect(() => {
    if (isMobileMenuOpen || isAllProgramsModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen, isAllProgramsModalOpen]);

  // Ensure the admissions page always starts cleanly at the top hero section on load/navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (!hash || hash === '#/admissions' || hash === '#hero' || hash === '#') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    }
  }, []);

  // Handle deep-linking hashes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#/apply') {
        openRegistrationForm();
      } else if (hash === '#/track') {
        setActiveTab('track');
        setIsFormModalOpen(true);
      } else if (hash === '#/programs' || hash.includes('all-programs')) {
        setIsAllProgramsModalOpen(true);
      } else if (hash.startsWith('#/news/')) {
        const slug = hash.replace('#/news/', '').trim();
        if (slug) {
          fetchArticleBySlug(slug);
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [content?.news]);

  // Filter and Accordion states
  const [programDeptFilter, setProgramDeptFilter] = useState<string>('all');
  const [programSearch, setProgramSearch] = useState('');
  const [newsSearch, setNewsSearch] = useState('');
  const [newsCategoryFilter, setNewsCategoryFilter] = useState<string>('all');
  const [faqCategoryFilter, setFaqCategoryFilter] = useState<string>('all');
  const [expandedFaqId, setExpandedFaqId] = useState<number | null>(null);

  // Newsletter state
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  // Registration Form State & Multi-Step Wizard
  const [formStep, setFormStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'Male',
    email: '',
    phone: '',
    address: '',
    sessionId: '',
    classId: '',
    departmentId: '',
    entryMode: 'Fresh Entry',
    nationality: 'Nigerian',
    stateOfOrigin: '',
    lga: '',
    passportPhoto: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    guardianRelationship: 'Father',
    guardianAddress: '',
    guardianSameAddress: false,
    guardianOccupation: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    applicantMessage: '',
    confirmedDeclaration: false,
  });

  interface AdmissionDocItem {
    id: string;
    title: string;
    description: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileData: string;
    isRequired: boolean;
  }

  const [documents, setDocuments] = useState<AdmissionDocItem[]>([
    {
      id: 'doc_passport',
      title: 'Passport Photograph',
      description: 'Recent clear colored passport photo (JPEG/PNG/WebP, Max 5MB)',
      fileName: '',
      fileType: '',
      fileSize: 0,
      fileData: '',
      isRequired: true,
    },
    {
      id: 'doc_birth_cert',
      title: 'Birth Certificate / Age Declaration',
      description: 'Official birth certificate or sworn declaration of age',
      fileName: '',
      fileType: '',
      fileSize: 0,
      fileData: '',
      isRequired: true,
    },
    {
      id: 'doc_transcript',
      title: 'Previous Academic Transcript / Result',
      description: 'Last term report card, SSCE / WAEC / BECE or previous school statement',
      fileName: '',
      fileType: '',
      fileSize: 0,
      fileData: '',
      isRequired: true,
    },
    {
      id: 'doc_id_proof',
      title: 'Identification Document',
      description: 'National Identification Number (NIN), Voter ID, or International Passport',
      fileName: '',
      fileType: '',
      fileSize: 0,
      fileData: '',
      isRequired: false,
    },
    {
      id: 'doc_testimonial',
      title: 'Character Reference / Testimonial',
      description: 'School testimonial, letter of recommendation, or character reference',
      fileName: '',
      fileType: '',
      fileSize: 0,
      fileData: '',
      isRequired: false,
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<ApplicationSuccess | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Draft persistence in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sms_admission_form_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) setFormData((prev) => ({ ...prev, ...parsed.formData }));
        if (parsed.documents && Array.isArray(parsed.documents)) setDocuments(parsed.documents);
        if (parsed.formStep) setFormStep(parsed.formStep);
      }
    } catch (e) {
      // ignore draft parse error
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sms_admission_form_draft_v2', JSON.stringify({ formData, documents, formStep }));
    } catch (e) {
      // ignore storage quota error
    }
  }, [formData, documents, formStep]);

  // Step validation helpers
  const validateStep1 = () => {
    if (!formData.sessionId) {
      setSubmitError('Please select a valid academic session.');
      return false;
    }
    if (!formData.classId) {
      setSubmitError('Please select an entry program or class level.');
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setSubmitError('First Name and Last Name are required.');
      return false;
    }
    if (!formData.dateOfBirth) {
      setSubmitError('Please select applicant date of birth.');
      return false;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setSubmitError('Please enter a valid email address.');
      return false;
    }
    if (!formData.phone.trim()) {
      setSubmitError('Please enter applicant phone number.');
      return false;
    }
    if (!formData.address.trim()) {
      setSubmitError('Please enter residential address.');
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const validateStep3 = () => {
    if (formData.guardianRelationship !== 'Self') {
      if (!formData.guardianName.trim()) {
        setSubmitError('Parent/Guardian Name is required.');
        return false;
      }
      if (!formData.guardianPhone.trim()) {
        setSubmitError('Parent/Guardian Phone number is required.');
        return false;
      }
    }
    setSubmitError(null);
    return true;
  };

  const validateStep4 = () => {
    const missing = documents.filter((d) => d.isRequired && !d.fileData);
    if (missing.length > 0) {
      setSubmitError(`Please upload required documents: ${missing.map((m) => m.title).join(', ')}.`);
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const handleNextStep = () => {
    if (formStep === 1 && !validateStep1()) return;
    if (formStep === 2 && !validateStep2()) return;
    if (formStep === 3 && !validateStep3()) return;
    if (formStep === 4 && !validateStep4()) return;
    setFormStep((prev) => Math.min(5, prev + 1) as any);
    setSubmitError(null);
  };

  const handlePrevStep = () => {
    setFormStep((prev) => Math.max(1, prev - 1) as any);
    setSubmitError(null);
  };

  // File upload handlers
  const handleFileUpload = (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setSubmitError('File size exceeds the 10MB limit. Please choose a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: result,
              }
            : doc
        )
      );
      if (docId === 'doc_passport') {
        setFormData((prev) => ({ ...prev, passportPhoto: result }));
      }
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDoc = (docId: string) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId ? { ...doc, fileName: '', fileType: '', fileSize: 0, fileData: '' } : doc
      )
    );
    if (docId === 'doc_passport') {
      setFormData((prev) => ({ ...prev, passportPhoto: '' }));
    }
  };

  // Track State
  const [trackNumber, setTrackNumber] = useState('');
  const [trackKey, setTrackKey] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedApp, setTrackedApp] = useState<TrackedApplication | null>(null);

  useEffect(() => {
    loadPortalContent();
  }, []);

  const loadPortalContent = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<PublicPortalContentResponse>('/public-portal/content');
      setContent(res);

      if (res?.sessions?.length) {
        const activeSess =
          res.sessions.find((s) => s.id === res.settings?.currentSessionId) ||
          res.sessions.find((s) => s.isCurrent) ||
          res.sessions[0];

        setFormData((prev) => ({
          ...prev,
          sessionId: activeSess ? activeSess.id.toString() : '',
        }));
      }
    } catch (err: any) {
      console.error('Error loading public portal content:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchArticleBySlug = async (slug: string) => {
    try {
      const res = await apiRequest<any>(`/public-portal/news/${slug}`);
      if (res?.post) {
        setSelectedArticle(res.post);
      }
    } catch (err) {
      console.error('Error loading article by slug:', err);
    }
  };

  // Filter available classes for application dropdown
  const availableClasses = (content?.programs || []).filter((cls) => {
    if (cls.admissionStatus !== 'available') return false;
    if (formData.sessionId && cls.sessionId && cls.sessionId !== parseInt(formData.sessionId)) {
      return false;
    }
    if (formData.departmentId && cls.departmentId && cls.departmentId !== parseInt(formData.departmentId)) {
      return false;
    }
    return true;
  });

  const openRegistrationForm = (prefill?: { sessionId?: string; classId?: string; departmentId?: string }) => {
    if (prefill) {
      setFormData((prev) => ({
        ...prev,
        sessionId: prefill.sessionId || prev.sessionId,
        classId: prefill.classId || prev.classId,
        departmentId: prefill.departmentId || prev.departmentId,
      }));
    }
    setActiveTab('apply');
    setIsFormModalOpen(true);
    setSuccessData(null);
    setSubmitError(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    // Frontend validation guard against closed admissions
    if (content && !content.settings.isAdmissionsActive) {
      setSubmitError('Admissions are currently closed. Applications cannot be submitted at this time.');
      setSubmitting(false);
      return;
    }

    try {
      if (!formData.confirmedDeclaration) {
        setSubmitError('Please confirm the accuracy declaration before submitting your application.');
        setSubmitting(false);
        return;
      }

      const payload: any = {
        firstName: formData.firstName.trim(),
        middleName: formData.middleName.trim() || undefined,
        lastName: formData.lastName.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        sessionId: parseInt(formData.sessionId, 10),
        classId: parseInt(formData.classId, 10),
        departmentId: formData.departmentId ? parseInt(formData.departmentId, 10) : undefined,
        entryMode: formData.entryMode,
        nationality: formData.nationality,
        stateOfOrigin: formData.stateOfOrigin.trim() || undefined,
        lga: formData.lga.trim() || undefined,
        passportPhoto: formData.passportPhoto || undefined,
        guardianName: formData.guardianName.trim() || undefined,
        guardianPhone: formData.guardianPhone.trim() || undefined,
        guardianEmail: formData.guardianEmail.trim() || undefined,
        guardianRelationship: formData.guardianRelationship,
        guardianAddress: (formData.guardianSameAddress ? formData.address : formData.guardianAddress).trim() || undefined,
        guardianOccupation: formData.guardianOccupation.trim() || undefined,
        emergencyContactName: formData.emergencyContactName.trim() || undefined,
        emergencyContactPhone: formData.emergencyContactPhone.trim() || undefined,
        applicantMessage: formData.applicantMessage.trim() || undefined,
        documents: JSON.stringify(documents.filter((d) => d.fileData)),
      };

      const res = await apiRequest<any>('/admissions/public/apply', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccessData({
        applicationNumber: res.applicationNumber,
        accessKey: res.accessKey,
        sessionName: res.sessionName,
        className: res.className,
      });

      // Clear draft on submission success
      localStorage.removeItem('sms_admission_form_draft_v2');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit application. Please check requirements.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingLoading(true);
    setTrackError(null);
    setTrackedApp(null);

    try {
      const res = await apiRequest<TrackedApplication>('/admissions/public/track', {
        method: 'POST',
        body: JSON.stringify({
          applicationNumber: trackNumber.trim(),
          accessKey: trackKey.trim(),
        }),
      });

      setTrackedApp(res);
    } catch (err: any) {
      setTrackError(err.message || 'Application not found. Please verify details.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Approved</span>;
      case 'under_review':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Under Review</span>;
      case 'needs_information':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Action Needed</span>;
      case 'rejected':
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">Not Accepted</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-200 text-stone-800">Pending</span>;
    }
  };

  const schoolName = content?.settings?.schoolName || 'School Management System';
  const motto = content?.settings?.motto || 'Excellence, Character & Global Leadership';
  const activeSessionName = content?.settings?.currentSessionName || '2026/2027 Academic Session';
  const isAdmissionsActive = content?.settings?.isAdmissionsActive ?? true;

  // Filtered Programs
  const filteredPrograms = (content?.programs || []).filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(programSearch.toLowerCase()) ||
      (p.gradeLevel && p.gradeLevel.toLowerCase().includes(programSearch.toLowerCase())) ||
      (p.departmentName && p.departmentName.toLowerCase().includes(programSearch.toLowerCase()));
    const matchesDept =
      programDeptFilter === 'all' || (p.departmentId && p.departmentId.toString() === programDeptFilter);
    return matchesSearch && matchesDept;
  });

  // Filtered News
  const filteredNews = (content?.news || []).filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(newsSearch.toLowerCase()) ||
      (n.summary && n.summary.toLowerCase().includes(newsSearch.toLowerCase())) ||
      n.category.toLowerCase().includes(newsSearch.toLowerCase());
    const matchesCat = newsCategoryFilter === 'all' || n.category === newsCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // Unique news categories
  const newsCategories = Array.from(new Set((content?.news || []).map((n) => n.category)));

  // Filtered FAQs
  const filteredFaqs = (content?.faqs || []).filter((f) => {
    return faqCategoryFilter === 'all' || f.category === faqCategoryFilter;
  });
  const faqCategories = Array.from(new Set((content?.faqs || []).map((f) => f.category)));

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans selection:bg-purple-500 selection:text-white">
      {/* ========================================================================= */}
      {/* 0. ADMISSIONS STATUS ALERT BANNER (Dynamically reflecting CMS)             */}
      {/* ========================================================================= */}
      {!isAdmissionsActive ? (
        <div className="bg-rose-600 text-white px-3 py-1.5 text-center text-xs font-bold flex items-center justify-center gap-2 shadow-md">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Admissions are currently closed. New online applications are not being accepted at this time.
            {content?.settings?.openingDate && new Date().toISOString().split('T')[0] < content.settings.openingDate && (
              <span className="ml-1 font-normal underline">
                Registration begins on {content.settings.openingDate}.
              </span>
            )}
            {content?.settings?.closingDate && new Date().toISOString().split('T')[0] > content.settings.closingDate && (
              <span className="ml-1 font-normal underline">
                The application deadline closed on {content.settings.closingDate}.
              </span>
            )}
          </span>
        </div>
      ) : content?.settings?.announcementMessage ? (
        <div className="w-full overflow-hidden py-1 border-b border-stone-200/60 bg-stone-50/60 text-slate-800 text-[11px] sm:text-xs font-semibold">
          <div className="animate-marquee flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-purple-600 shrink-0 inline-block" />
            <span>{content.settings.announcementMessage}</span>
            <span className="font-bold text-purple-700">({activeSessionName})</span>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION BAR (Sleek Compact White Bar with Portal Purple CTA)     */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-2xs">
        <div className="w-full px-3 sm:px-6 lg:px-10 xl:px-12 h-12 sm:h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Section: Mobile Left Hamburger Menu Toggle & Academy Brand */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-slate-700 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-stone-200 shadow-2xs active:scale-95"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="sr-only">Open Navigation Menu</span>
            </button>

            {/* School / Academy Brand Logo */}
            <a href="#hero" className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <GraduationCap className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 tracking-tight block truncate group-hover:text-purple-600 transition-colors leading-tight">
                  {schoolName.split(' ')[0]} <span className="text-purple-600 font-normal">Admissions</span>
                </span>
                <span className="text-[9px] sm:text-[10px] text-stone-500 font-semibold tracking-wider uppercase block truncate max-w-[120px] sm:max-w-[200px] leading-tight">
                  {motto}
                </span>
              </div>
            </a>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-xs font-semibold text-slate-600">
            <a href="#hero" className="text-purple-600 font-bold hover:text-purple-700 transition-colors">
              Home
            </a>
            {content?.settings?.showPrograms && (
              <a href="#programs" className="hover:text-purple-600 transition-colors">
                Programs
              </a>
            )}
            {content?.settings?.showRequirements && (
              <a href="#requirements" className="hover:text-purple-600 transition-colors">
                Requirements
              </a>
            )}
            {content?.settings?.showImportantDates && (
              <a href="#dates" className="hover:text-purple-600 transition-colors">
                Key Dates
              </a>
            )}
            {content?.settings?.showNews && (
              <a href="#news" className="hover:text-purple-600 transition-colors">
                News & Guides
              </a>
            )}
            {content?.settings?.showFaqs && (
              <a href="#faqs" className="hover:text-purple-600 transition-colors">
                FAQs
              </a>
            )}
            {content?.settings?.showContact && (
              <a href="#contact" className="hover:text-purple-600 transition-colors">
                Contact
              </a>
            )}
          </nav>

          {/* Right Side Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onBackToLogin}
              className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-purple-700 hover:text-purple-900 px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="w-3 h-3 text-purple-600" />
              <span>Back to Login</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('track');
                setIsFormModalOpen(true);
                formRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden xl:flex items-center gap-1.5 text-[11px] font-bold text-slate-700 hover:text-purple-600 px-3 py-1.5 rounded-lg border border-stone-200 hover:border-purple-300 transition-all cursor-pointer"
            >
              <Search className="w-3 h-3 text-purple-600" />
              <span>Track Status</span>
            </button>

            {/* Apply Online Button */}
            {isAdmissionsActive ? (
              <button
                type="button"
                onClick={() => openRegistrationForm()}
                className="px-3 sm:px-4 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-[11px] sm:text-xs rounded-full shadow-md shadow-purple-600/25 transition-all cursor-pointer flex items-center gap-1"
              >
                <span>Apply Online</span>
                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('track');
                  setIsFormModalOpen(true);
                }}
                className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[11px] rounded-full cursor-pointer flex items-center gap-1"
              >
                <span>Track Status</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* LEFT-SIDE SLIDING DRAWER NAVIGATION (Smooth Slide In / Out on < lg)       */}
      {/* Rendered at root level outside header to prevent backdrop filter clipping */}
      {/* ========================================================================= */}
      <div
        className={`fixed inset-0 z-[998] bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden={!isMobileMenuOpen}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[999] w-[320px] max-w-[85vw] h-screen h-[100dvh] bg-white shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile and Tablet Navigation"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-600/30 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-base font-black text-slate-900 block leading-tight truncate">
                {schoolName.split(' ')[0]} <span className="text-purple-600 font-normal">Admissions</span>
              </span>
              <span className="text-[11px] text-stone-500 font-medium truncate block">
                {motto}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs shrink-0 ml-2"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Nav Links (Scrollable middle section) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 text-sm font-bold text-slate-700">
          <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-purple-600">
            Menu Navigation
          </div>
          <a
            href="#hero"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
          >
            <School className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Home Admissions</span>
          </a>
          {content?.settings?.showPrograms && (
            <a
              href="#programs"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Programs & Offerings</span>
            </a>
          )}
          {content?.settings?.showRequirements && (
            <a
              href="#requirements"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Admission Requirements</span>
            </a>
          )}
          {content?.settings?.showImportantDates && (
            <a
              href="#dates"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Key Dates & Exams</span>
            </a>
          )}
          {content?.settings?.showNews && (
            <a
              href="#news"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <FileText className="w-4 h-4 text-purple-600 shrink-0" />
              <span>News & Campus Guides</span>
            </a>
          )}
          {content?.settings?.showFaqs && (
            <a
              href="#faqs"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Frequently Asked Questions</span>
            </a>
          )}
          {content?.settings?.showContact && (
            <a
              href="#contact"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-700 transition-colors"
            >
              <Mail className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Contact Information</span>
            </a>
          )}
        </div>

        {/* Drawer Footer Actions (Always visible at bottom) */}
        <div className="p-4 border-t border-stone-200/80 bg-stone-50/90 space-y-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setActiveTab('track');
              setIsFormModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white border border-purple-200 font-bold text-xs text-purple-800 hover:bg-purple-50 transition-colors shadow-2xs cursor-pointer active:scale-98"
          >
            <Search className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Track Application Status</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              onBackToLogin();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white border border-purple-200 font-bold text-xs text-purple-800 hover:bg-purple-50 transition-colors shadow-2xs cursor-pointer active:scale-98"
          >
            <ArrowLeft className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Back to Login</span>
          </button>

          {isAdmissionsActive ? (
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                openRegistrationForm();
              }}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Get Started With Application</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <div className="p-2.5 bg-rose-100 text-rose-800 text-center text-xs font-bold rounded-xl border border-rose-200">
              Admissions Currently Closed
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. TOP HERO SECTION WITH 3D SPATIAL SCROLL ANIMATION & CROSSFADING IMAGES  */}
      {/* ========================================================================= */}
      <section
        id="hero"
        className="relative overflow-hidden min-h-[540px] sm:min-h-[600px] lg:min-h-[660px] flex flex-col justify-between py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 text-white"
        style={{ perspective: '1200px' }}
      >
        {/* 3D Parallax Background Layer (scrolls at a slower rate so foreground moves over it in 3D) */}
        <div
          className="absolute inset-0 z-0 overflow-hidden select-none bg-slate-950 will-change-transform pointer-events-none"
          style={{
            transform: `translate3d(0, ${heroScrollY * 0.42}px, 0) scale(${1.02 + Math.min(Math.max(heroScrollY / 550, 0), 1) * 0.08})`,
            transformOrigin: 'center center',
          }}
        >
          {BACKGROUND_IMAGES.map((img, idx) => {
            const isActive = idx === currentBgIndex;
            return (
              <div
                key={img.src}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <img
                  src={img.src}
                  alt={img.title}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transform transition-transform duration-10000 ease-out ${
                    isActive ? 'scale-105' : 'scale-100'
                  }`}
                />
              </div>
            );
          })}
          {/* Cinematic Gradient Overlays with Good Contrast and dynamic 3D depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-slate-950/50 to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-black/60" />
          <div
            className="absolute inset-0 bg-slate-950 pointer-events-none transition-opacity duration-75"
            style={{ opacity: Math.min(0.2 + Math.min(Math.max(heroScrollY / 550, 0), 1) * 0.45, 0.75) }}
          />
        </div>

        {/* 3D Spatial Foreground Content Container (Content scrolls upward with 3D elevation over the background) */}
        <div
          className="relative z-10 flex flex-col justify-between h-full flex-1 w-full"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Hero Typography with 3D Elevation, Subtle Tilt, and Smooth Exit */}
          <div
            className="relative text-center max-w-4xl mx-auto my-auto py-6 sm:py-10 px-2 will-change-transform"
            style={{
              transform: `translate3d(0, -${heroScrollY * 0.18}px, ${Math.min(heroScrollY * 0.35, 75)}px) rotateX(${Math.min(heroScrollY * 0.015, 6)}deg)`,
              opacity: Math.max(1 - heroScrollY / 480, 0),
              transformOrigin: 'center bottom',
            }}
          >
            {content?.settings?.heroBadgeText && (
              <ScrollReveal direction="up" distance={20} duration={1400}>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 backdrop-blur-md border border-purple-400/30 text-xs font-extrabold uppercase tracking-wider text-purple-300 mb-4 shadow-lg">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  <span>{content.settings.heroBadgeText}</span>
                </div>
              </ScrollReveal>
            )}

            <ScrollReveal direction="up" distance={24} duration={1600} delay={150}>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-white drop-shadow-2xl">
                {content?.settings?.heroTitle || "Let's fly to your Dream Academy"}
              </h1>
            </ScrollReveal>

            <ScrollReveal direction="up" distance={24} duration={1600} delay={300}>
              <div className="mt-4 sm:mt-6 max-w-2xl mx-auto">
                <p className="text-xs sm:text-sm md:text-base font-semibold text-white leading-relaxed drop-shadow-xl bg-black/60 sm:bg-black/50 backdrop-blur-md px-5 sm:px-7 py-3 sm:py-4 rounded-2xl border border-white/20 shadow-2xl inline-block">
                  {content?.settings?.heroSubtitle ||
                    'Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.'}
                </p>
              </div>
            </ScrollReveal>
          </div>

          {/* Hero Floating Placement & Filter Bar with 3D Elevation & Dynamic Shadow */}
          <div
            className="relative max-w-4xl mx-auto w-full will-change-transform"
            style={{
              transform: `translate3d(0, -${heroScrollY * 0.08}px, ${Math.min(heroScrollY * 0.4, 90)}px) rotateX(${Math.min(heroScrollY * 0.012, 5)}deg)`,
              transformOrigin: 'center top',
            }}
          >
            <ScrollReveal direction="zoom" distance={24} duration={1700} delay={450} className="w-full">
              <div
                className="bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-slate-800 border border-white/50 w-full transition-shadow duration-150"
                style={{
                  boxShadow: `0 ${16 + Math.min(heroScrollY * 0.06, 30)}px ${30 + Math.min(heroScrollY * 0.08, 40)}px rgba(0,0,0,${0.25 + Math.min(heroScrollY * 0.0005, 0.2)})`,
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  {/* Session Selector */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Academic Session
                    </span>
                    <select
                      value={formData.sessionId}
                      onChange={(e) => setFormData({ ...formData, sessionId: e.target.value, classId: '' })}
                      className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                    >
                      {content?.sessions?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.isCurrent ? '• Active' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Class / Program Selector */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Program / Class
                    </span>
                    <select
                      value={formData.classId}
                      onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                      className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">Select Offering</option>
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.section ? `(${c.section})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Department */}
                  <div className="p-2 sm:p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Track / Department
                    </span>
                    <select
                      value={formData.departmentId}
                      onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                      className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">All Departments</option>
                      {content?.departments?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search & Apply Button */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={!isAdmissionsActive}
                      onClick={() => openRegistrationForm()}
                      className="w-full h-full min-h-[46px] bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      <span>{isAdmissionsActive ? 'Start Registration' : 'Admissions Closed'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. AVAILABLE ACADEMIC OFFERINGS & PROGRAMS SECTION                         */}
      {/* ========================================================================= */}
      {content?.settings?.showPrograms && (
        <section id="programs" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <ScrollReveal direction="up" distance={28} duration={1700}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-3 shadow-2xs">
                <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                <span>Curriculum & Placement Options</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
                Accredited <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Programs & Offerings</span>
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                Explore dynamic academic pathways designed for primary, secondary, and pre-university scholarly success.
              </p>

              {/* Department Filter Tabs (Refined segmented pill design) */}
              <div className="inline-flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80 mt-6 shadow-inner">
                <button
                  type="button"
                  onClick={() => setProgramDeptFilter('all')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    programDeptFilter === 'all'
                      ? 'bg-white text-purple-700 shadow-sm border border-slate-200/70 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  All Departments ({content?.programs?.length || 0})
                </button>
                {content?.departments?.map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setProgramDeptFilter(dept.id.toString())}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      programDeptFilter === dept.id.toString()
                        ? 'bg-white text-purple-700 shadow-sm border border-slate-200/70 font-extrabold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Programs Grid (Displaying 6 featured classes) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPrograms.slice(0, 6).map((prog, idx) => {
              const isAvailable = prog.admissionStatus === 'available';
              return (
                <ScrollReveal
                  key={prog.id}
                  direction="up"
                  distance={32}
                  duration={1700}
                  delay={(idx % 6) * 120}
                  className="h-full"
                >
                  <div
                    className="h-full bg-white rounded-3xl p-6 sm:p-7 shadow-xs hover:shadow-xl transition-all border border-slate-200/90 hover:border-purple-200 flex flex-col justify-between space-y-5 group hover:-translate-y-1.5 duration-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3.5">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                          {prog.departmentName || 'General Track'}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isAvailable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' : 'bg-amber-50 text-amber-800 border border-amber-200/70'
                          }`}
                        >
                          {isAvailable ? '● OPEN FOR ADMISSION' : '○ ADMISSION CLOSED'}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-purple-600 transition-colors">
                          {prog.name}
                        </h3>
                        {prog.isFeatured && (
                          <span className="p-1 text-amber-500" title="Featured Programme">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                          </span>
                        )}
                      </div>

                      {prog.duration && (
                        <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          <span>Duration: {prog.duration}</span>
                        </p>
                      )}

                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-3">
                        {prog.publicDescription ||
                          'Structured coursework cultivating disciplined mastery, laboratory investigations, and leadership skills.'}
                      </p>

                      {prog.requirements && (
                        <div className="mt-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 text-[11px] text-slate-700">
                          <span className="font-bold text-purple-900 block mb-0.5">Entry Criteria:</span>
                          <span>{prog.requirements}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">
                        Capacity: <strong className="text-slate-800 font-mono">{prog.capacity}</strong> scholars
                      </span>
                      {isAvailable && isAdmissionsActive ? (
                        <button
                          type="button"
                          onClick={() => openRegistrationForm({ classId: prog.id.toString(), departmentId: prog.departmentId?.toString() })}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-sm shadow-purple-600/30 cursor-pointer active:scale-95"
                        >
                          <span>Apply Now</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">Closed for Intake</span>
                      )}
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Small text-only see all classes button */}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setIsAllProgramsModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer group"
            >
              <span>See all classes</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-purple-600" />
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 4. ADMISSION REQUIREMENTS SECTION                                         */}
      {/* ========================================================================= */}
      {content?.settings?.showRequirements && (
        <section id="requirements" className="bg-slate-50/70 border-y border-slate-200/80 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal direction="up" distance={28} duration={1700}>
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-3 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Application Prerequisites</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
                  Admission <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Requirements</span>
                </h2>
                <p className="mt-3 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                  Ensure you have the required documentation ready for smooth credential verification.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {content?.requirements?.map((req, idx) => (
                <ScrollReveal
                  key={req.id || idx}
                  direction="up"
                  distance={30}
                  duration={1700}
                  delay={(idx % 6) * 120}
                  className="h-full"
                >
                  <div
                    className="h-full bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs hover:shadow-lg hover:border-purple-200 transition-all hover:-translate-y-1 duration-300 space-y-3.5 flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 font-extrabold text-xs flex items-center justify-center font-mono border border-purple-200/60 shadow-2xs">
                          {idx + 1}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            req.isMandatory ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {req.isMandatory ? 'Mandatory' : 'Optional'}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">{req.title}</h4>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{req.description}</p>
                    </div>
                    {req.departmentName && (
                      <span className="inline-block text-[10px] text-purple-700 font-semibold bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-lg mt-2 self-start">
                        Applies to: {req.departmentName}
                      </span>
                    )}
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. IMPORTANT DATES & ACADEMIC CALENDAR                                     */}
      {/* ========================================================================= */}
      {content?.settings?.showImportantDates && (
        <section id="dates" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <ScrollReveal direction="up" distance={28} duration={1700}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-3 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-purple-600" />
                <span>Academic Milestones</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
                Important <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Dates & Deadlines</span>
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                Key admission timeline events, entrance examinations, and orientation schedules.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {content?.dates?.map((dt, idx) => (
              <ScrollReveal
                key={dt.id}
                direction="up"
                distance={30}
                duration={1700}
                delay={(idx % 6) * 120}
                className="h-full"
              >
                <div
                  className="h-full bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs hover:shadow-lg hover:border-purple-200 transition-all hover:-translate-y-1 duration-300 flex items-start gap-4 sm:gap-5 group"
                >
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50/80 border border-purple-200/80 text-purple-900 rounded-2xl p-3 sm:p-3.5 text-center min-w-[76px] shrink-0 shadow-2xs">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 block">
                      {new Date(dt.eventDate).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="text-2xl sm:text-3xl font-black block leading-none mt-1 text-slate-900 font-mono">
                      {new Date(dt.eventDate).getDate()}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-1">
                      {new Date(dt.eventDate).getFullYear()}
                    </span>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                        {dt.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          dt.status === 'upcoming'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : dt.status === 'ongoing'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {dt.status.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-purple-600 transition-colors leading-snug">{dt.title}</h4>
                    {dt.eventTime && (
                      <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>{dt.eventTime}</span>
                      </p>
                    )}
                    {dt.description && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{dt.description}</p>}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. NEWS & BLOG SECTION (With Search, Filter & Article Reader)             */}
      {/* ========================================================================= */}
      {content?.settings?.showNews && (
        <section id="news" className="bg-slate-50/70 border-t border-slate-200/80 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal direction="up" distance={28} duration={1700}>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-3 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Articles & Announcements</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    News and <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Updates</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-lg">
                    Institutional announcements, admission notices, scholarship releases, and campus achievements.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search articles..."
                      value={newsSearch}
                      onChange={(e) => setNewsSearch(e.target.value)}
                      className="pl-8 pr-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:outline-hidden focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 shadow-2xs"
                    />
                  </div>

                  {newsCategories.length > 0 && (
                    <select
                      value={newsCategoryFilter}
                      onChange={(e) => setNewsCategoryFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 font-semibold focus:outline-hidden focus:border-purple-500 shadow-2xs"
                    >
                      <option value="all">All Categories</option>
                      {newsCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredNews.map((news, idx) => (
                <ScrollReveal
                  key={news.id}
                  direction="up"
                  distance={30}
                  duration={1700}
                  delay={(idx % 4) * 130}
                  className="h-full"
                >
                  <div
                    className="h-full bg-white rounded-3xl p-6 shadow-xs border border-slate-200/90 hover:border-purple-200 hover:shadow-xl transition-all hover:-translate-y-1 duration-300 flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200/60 px-2.5 py-1 rounded-lg inline-block">
                        {news.category}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-snug group-hover:text-purple-600 transition-colors line-clamp-2">
                        {news.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {news.summary || 'Read full article for complete guidelines and academic details.'}
                      </p>
                    </div>

                    <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium truncate max-w-[120px]">{news.authorName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArticle(news);
                          window.location.hash = `#/news/${news.slug}`;
                        }}
                        className="text-purple-600 hover:text-purple-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>Read</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 7. FAQS SECTION (Interactive Collapsible Accordion)                       */}
      {/* ========================================================================= */}
      {content?.settings?.showFaqs && (
        <section id="faqs" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <ScrollReveal direction="up" distance={28} duration={1700}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-3 shadow-2xs">
                <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                <span>Got Questions?</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
                Frequently Asked <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Questions</span>
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                Find immediate answers about the admissions process, fees, prerequisites, and tracking.
              </p>

              {faqCategories.length > 1 && (
                <div className="inline-flex flex-wrap items-center justify-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80 mt-6">
                  <button
                    type="button"
                    onClick={() => setFaqCategoryFilter('all')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      faqCategoryFilter === 'all'
                        ? 'bg-white text-purple-700 shadow-sm border border-slate-200/70 font-extrabold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    All Questions
                  </button>
                  {faqCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFaqCategoryFilter(c)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        faqCategoryFilter === c
                          ? 'bg-white text-purple-700 shadow-sm border border-slate-200/70 font-extrabold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollReveal>

          <div className="space-y-3.5">
            {filteredFaqs.map((faq, idx) => {
              const isOpen = expandedFaqId === faq.id;
              return (
                <ScrollReveal
                  key={faq.id}
                  direction="up"
                  distance={22}
                  duration={1600}
                  delay={(idx % 6) * 90}
                >
                  <div
                    className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isOpen ? 'border-purple-300 shadow-md ring-1 ring-purple-100' : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isOpen ? null : faq.id)}
                      className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-slate-900 hover:text-purple-600 transition-colors cursor-pointer"
                    >
                      <span className="leading-snug">{faq.question}</span>
                      <span className={`p-1.5 rounded-xl transition-colors shrink-0 ${isOpen ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        className="px-5 sm:px-6 pb-6 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(faq.answer) }}
                      />
                    )}
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 8. CAMPUS CONTACT & LOCATION SECTION                                      */}
      {/* ========================================================================= */}
      {content?.settings?.showContact && (
        <section id="contact" className="bg-gradient-to-b from-slate-50/70 to-white border-t border-slate-200/80 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal direction="up" distance={28} duration={1700}>
              <div className="text-center mb-12 space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/70 text-xs font-bold text-purple-700 mb-2 shadow-2xs">
                  <Phone className="w-3.5 h-3.5 text-purple-600" />
                  <span>Admissions Helpdesk</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  Get in Touch with our <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Admissions Team</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                  We are ready to guide you through application review, campus visits, and academic counseling.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* Email */}
              <ScrollReveal direction="up" distance={28} duration={1700} delay={0} className="h-full">
                <div className="h-full bg-white rounded-3xl p-7 border border-slate-200/90 shadow-xs text-center space-y-3.5 hover:shadow-xl hover:border-purple-200 hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-purple-600/20 group-hover:scale-105 transition-transform">
                      <Mail className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-4">Admissions Email</span>
                    <p className="font-bold text-xs sm:text-sm text-slate-900 mt-1 truncate">
                      {content?.settings?.contactEmail || 'admissions@school.edu'}
                    </p>
                  </div>
                  <a
                    href={`mailto:${content?.settings?.contactEmail || 'admissions@school.edu'}`}
                    className="inline-block text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
                  >
                    Send an Inquiry &bull; 24/7
                  </a>
                </div>
              </ScrollReveal>

              {/* Phone */}
              <ScrollReveal direction="up" distance={28} duration={1700} delay={150} className="h-full">
                <div className="h-full bg-white rounded-3xl p-7 border border-slate-200/90 shadow-xs text-center space-y-3.5 hover:shadow-xl hover:border-purple-200 hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-purple-600/20 group-hover:scale-105 transition-transform">
                      <Phone className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-4">Direct Telephone</span>
                    <p className="font-bold text-xs sm:text-sm text-slate-900 mt-1">
                      {content?.settings?.contactPhone || '+234 803 111 2233'}
                    </p>
                  </div>
                  <span className="inline-block text-xs font-semibold text-purple-600">
                    {content?.settings?.officeHours || 'Mon - Fri • 8:00 AM - 5:00 PM'}
                  </span>
                </div>
              </ScrollReveal>

              {/* Address */}
              <ScrollReveal direction="up" distance={28} duration={1700} delay={300} className="h-full">
                <div className="h-full bg-white rounded-3xl p-7 border border-slate-200/90 shadow-xs text-center space-y-3.5 hover:shadow-xl hover:border-purple-200 hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-purple-600/20 group-hover:scale-105 transition-transform">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-4">Campus Address</span>
                    <p className="font-bold text-xs sm:text-sm text-slate-900 mt-1 line-clamp-2">
                      {content?.settings?.address || '14 Academy Boulevard, Education District, Lagos'}
                    </p>
                  </div>
                  <span className="inline-block text-xs font-semibold text-purple-600">
                    Scheduled Campus Tours Available
                  </span>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 9. ARTICLE READER MODAL (For reading full blog post /news/:slug)          */}
      {/* ========================================================================= */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 py-8 flex justify-center items-start animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedArticle(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-3xl w-full p-6 sm:p-10 relative text-slate-900 my-4">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedArticle(null);
                  if (typeof window !== 'undefined') window.location.hash = '#/news';
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-purple-600" />
                <span>Back to Articles</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedArticle(null);
                  if (typeof window !== 'undefined') window.location.hash = '#/news';
                }}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  {selectedArticle.category}
                </span>
                {selectedArticle.publishedAt && (
                  <span className="text-xs text-stone-400">
                    {new Date(selectedArticle.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                {selectedArticle.title}
              </h1>

              <div className="flex items-center gap-2 text-xs text-stone-500 pb-4 border-b border-stone-100">
                <span>By {selectedArticle.authorName || 'Admissions Committee'}</span>
                <span>&bull;</span>
                <span>{selectedArticle.viewsCount || 0} views</span>
              </div>

              {selectedArticle.summary && (
                <p className="text-sm font-semibold text-stone-700 italic bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                  {selectedArticle.summary}
                </p>
              )}

              <div
                className="text-sm text-slate-800 leading-relaxed space-y-4 prose prose-purple max-w-none pt-2"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedArticle.content) }}
              />

              <div className="pt-8 border-t border-stone-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => openRegistrationForm()}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-xs font-bold transition-all shadow-md shadow-purple-600/25"
                >
                  Start Admission Application
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArticle(null);
                    window.location.hash = '#/news';
                  }}
                  className="text-xs font-semibold text-stone-500 hover:text-purple-600"
                >
                  Close Article
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9.5 ALL CLASSES & PROGRAMS DIRECTORY MODAL / TAB VIEW                      */}
      {/* ========================================================================= */}
      {isAllProgramsModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 py-6 sm:py-10 flex justify-center items-start animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAllProgramsModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-6xl w-full p-5 sm:p-8 md:p-10 relative text-slate-900 my-2 sm:my-4 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-600/30 shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      All Academic Classes & Programs
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-extrabold">
                      {content?.programs?.length || 0} Total
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Explore all available curricula, grade levels, departments, and enrollment requirements
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsAllProgramsModalOpen(false);
                    openRegistrationForm();
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Start Application</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAllProgramsModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer shadow-xs shrink-0"
                  title="Close Directory (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Bar & Department Tabs */}
            <div className="py-4 border-b border-stone-100 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={programSearch}
                    onChange={(e) => setProgramSearch(e.target.value)}
                    placeholder="Search classes by name, department, or grade..."
                    className="w-full pl-9.5 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition-all"
                  />
                  {programSearch && (
                    <button
                      type="button"
                      onClick={() => setProgramSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-semibold text-right">
                  Showing <strong className="text-purple-700">{filteredPrograms.length}</strong> of{' '}
                  <strong>{content?.programs?.length || 0}</strong> classes
                </div>
              </div>

              {/* Department Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setProgramDeptFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    programDeptFilter === 'all'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                  }`}
                >
                  All Departments ({content?.programs?.length || 0})
                </button>
                {content?.departments?.map((dept) => {
                  const deptCount = (content?.programs || []).filter(
                    (p) => p.departmentId && p.departmentId.toString() === dept.id.toString()
                  ).length;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => setProgramDeptFilter(dept.id.toString())}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        programDeptFilter === dept.id.toString()
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                      }`}
                    >
                      {dept.name} ({deptCount})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Programs List */}
            <div className="flex-1 overflow-y-auto py-5 pr-1 space-y-4">
              {filteredPrograms.length === 0 ? (
                <div className="text-center py-16 px-4 bg-stone-50 rounded-3xl border border-dashed border-stone-200">
                  <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="font-black text-slate-800 text-base">No Classes Found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No classes matched your search criteria. Try selecting another department or clearing your search.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setProgramSearch('');
                      setProgramDeptFilter('all');
                    }}
                    className="mt-4 px-4 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredPrograms.map((prog) => {
                    const isAvailable = prog.admissionStatus === 'available';
                    return (
                      <div
                        key={prog.id}
                        className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-xs hover:shadow-md hover:border-purple-300 transition-all flex flex-col justify-between space-y-4 group"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                              {prog.departmentName || 'General Track'}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isAvailable
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200/70'
                              }`}
                            >
                              {isAvailable ? '● Open' : '○ Closed'}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-extrabold text-slate-900 text-base group-hover:text-purple-600 transition-colors">
                              {prog.name}
                            </h4>
                            {prog.section && (
                              <span className="text-xs text-purple-700 font-semibold block mt-0.5">
                                Stream/Arm: {prog.section}
                              </span>
                            )}
                          </div>

                          {prog.duration && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                              <Clock className="w-3.5 h-3.5 text-purple-600" />
                              <span>Duration: {prog.duration}</span>
                            </p>
                          )}

                          <p className="text-xs text-slate-600 leading-relaxed">
                            {prog.publicDescription ||
                              'Structured curriculum designed for academic rigour and holistic student development.'}
                          </p>

                          {prog.requirements && (
                            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-[11px] text-slate-700">
                              <span className="font-bold text-purple-900 block mb-0.5">Entry Criteria:</span>
                              <span>{prog.requirements}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-3.5 border-t border-stone-100 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Cap: <strong className="text-slate-800 font-mono">{prog.capacity}</strong> seats
                          </span>
                          {isAvailable && isAdmissionsActive ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAllProgramsModalOpen(false);
                                openRegistrationForm({
                                  classId: prog.id.toString(),
                                  departmentId: prog.departmentId?.toString(),
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                            >
                              <span>Apply Now</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">Closed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
              <span>
                Need help deciding? Contact the admissions office at{' '}
                <strong className="text-purple-700">{content?.settings?.contactEmail || 'admissions@school.edu'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsAllProgramsModalOpen(false)}
                className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. IN-PAGE REGISTRATION FORM & TRACKING DRAWER MODAL                      */}
      {/* ========================================================================= */}
      {isFormModalOpen && (
        <div
          ref={formRef}
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 py-6 sm:py-12 flex justify-center items-start animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsFormModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-3xl w-full p-6 sm:p-10 relative text-slate-900 my-2 sm:my-6">
            {/* Top Navigation & Close Header inside Modal */}
            <div className="flex items-center justify-between gap-3 pb-5 mb-6 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer shadow-2xs"
                >
                  <ArrowLeft className="w-4 h-4 text-purple-600" />
                  <span>Back to Admissions Home</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer shadow-xs shrink-0"
                title="Close Form (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Switcher (Apply vs Track) */}
            <div className="inline-flex p-1 bg-stone-100 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('apply')}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'apply' ? 'bg-purple-600 text-white shadow-xs shadow-purple-600/20' : 'text-stone-600 hover:text-purple-600'
                }`}
              >
                Online Registration
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'track' ? 'bg-purple-600 text-white shadow-xs shadow-purple-600/20' : 'text-stone-600 hover:text-purple-600'
                }`}
              >
                Track Status
              </button>
            </div>

            {/* Application Flow */}
            {activeTab === 'apply' && (
              <div>
                {!isAdmissionsActive ? (
                  <div className="p-8 text-center space-y-4 bg-rose-50 border border-rose-200 rounded-2xl">
                    <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-black text-rose-900">Admissions Are Currently Closed</h3>
                    <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
                      Applications for the academic intake are currently closed by academy administration. Submissions are temporarily blocked.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('track')}
                        className="px-5 py-2.5 bg-white text-purple-700 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-50 transition-colors"
                      >
                        Track an Existing Application
                      </button>
                    </div>
                  </div>
                ) : successData ? (
                  /* ========================================================================= */
                  /* SUCCESS PAGE                                                             */
                  /* ========================================================================= */
                  <div className="text-center space-y-6 animate-fadeIn py-2">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-300 shadow-inner">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-extrabold uppercase tracking-wider mb-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Application Submitted</span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900">Online Registration Complete</h3>
                      <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-lg mx-auto">
                        Your application for <span className="font-bold text-purple-700">{successData.className}</span> ({successData.sessionName}) has been received and queued for committee review.
                      </p>
                    </div>

                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4 text-left shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-200 gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase text-stone-500 tracking-wider">Application Reference Number</span>
                          <div className="text-xl font-mono font-black text-purple-900">{successData.applicationNumber}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(successData.applicationNumber, 'num')}
                          className="self-start sm:self-auto px-3.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:bg-stone-50 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>{copiedField === 'num' ? 'Copied Reference' : 'Copy Reference'}</span>
                        </button>
                      </div>

                      <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                            <span>Applicant Tracking Access Key</span>
                          </span>
                          <div className="text-sm font-mono font-black text-purple-950 tracking-wide">{successData.accessKey}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(successData.accessKey, 'key')}
                          className="self-start sm:self-auto px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white border border-purple-700 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5 text-white" />
                          <span>{copiedField === 'key' ? 'Copied Key' : 'Copy Access Key'}</span>
                        </button>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          <strong>Important Security Notice:</strong> Please save your <strong>Application Reference Number</strong> and <strong>Access Key</strong> in a safe place. You will need both to track your admission status live.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTrackNumber(successData.applicationNumber);
                          setTrackKey(successData.accessKey);
                          setActiveTab('track');
                          setSuccessData(null);
                        }}
                        className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-purple-600/25 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Search className="w-4 h-4" />
                        <span>Track Status Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-4 py-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                      >
                        <Printer className="w-4 h-4 text-stone-600" />
                        <span>Print / Save Summary</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSuccessData(null);
                          setIsFormModalOpen(false);
                          setFormStep(1);
                        }}
                        className="px-5 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
                      >
                        Back to Admissions
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ========================================================================= */
                  /* MULTI-STEP WIZARD FORM                                                    */
                  /* ========================================================================= */
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Header & Step Indicator */}
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-700 block mb-1">
                          Online Application Portal
                        </span>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                          Student Admission Registration
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Complete the 5-step registration below to submit your profile for academic committee evaluation.
                        </p>
                      </div>

                      {/* Desktop 5-Step Stepper Bar */}
                      <div className="hidden sm:grid grid-cols-5 gap-2 p-1.5 bg-stone-100/90 rounded-2xl border border-stone-200/80">
                        {[
                          { num: 1, title: 'Academic', icon: Layers },
                          { num: 2, title: 'Applicant', icon: User },
                          { num: 3, title: 'Guardian', icon: Users },
                          { num: 4, title: 'Documents', icon: FileText },
                          { num: 5, title: 'Review', icon: CheckCircle2 },
                        ].map((s) => {
                          const isComplete = formStep > s.num;
                          const isActive = formStep === s.num;
                          const IconComp = s.icon;
                          return (
                            <button
                              key={s.num}
                              type="button"
                              onClick={() => {
                                if (s.num < formStep) setFormStep(s.num as any);
                              }}
                              className={`p-2 rounded-xl text-left transition-all cursor-pointer flex items-center gap-2 ${
                                isActive
                                  ? 'bg-purple-600 text-white shadow-xs font-bold'
                                  : isComplete
                                  ? 'bg-emerald-500/10 text-emerald-800 font-semibold border border-emerald-500/30'
                                  : 'text-stone-500 hover:text-slate-800 font-medium'
                              }`}
                            >
                              <div
                                className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                  isActive
                                    ? 'bg-white text-purple-700'
                                    : isComplete
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-stone-200 text-stone-600'
                                }`}
                              >
                                {isComplete ? <Check className="w-3.5 h-3.5" /> : s.num}
                              </div>
                              <span className="text-xs truncate">{s.title}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Mobile Stepper Bar */}
                      <div className="sm:hidden p-3 bg-stone-100 rounded-xl border border-stone-200 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-stone-700">
                          <span>Step {formStep} of 5</span>
                          <span className="text-purple-700 font-extrabold uppercase text-[11px]">
                            {formStep === 1 && '1. Academic Placement'}
                            {formStep === 2 && '2. Applicant Details'}
                            {formStep === 3 && '3. Parent / Guardian'}
                            {formStep === 4 && '4. Documents'}
                            {formStep === 5 && '5. Review & Submit'}
                          </span>
                        </div>
                        <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-purple-600 h-full transition-all duration-300 rounded-full"
                            style={{ width: `${(formStep / 5) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Error Alert */}
                      {submitError && (
                        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 animate-fadeIn">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-rose-900">Validation Notice</div>
                            <p className="mt-0.5">{submitError}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ========================================================================= */}
                    {/* STEP 1: ACADEMIC PLACEMENT                                                */}
                    {/* ========================================================================= */}
                    {formStep === 1 && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-purple-600" />
                              <span>STEP 1 — ACADEMIC PLACEMENT</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-stone-500">Intake Selection</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Academic Session *</label>
                              <select
                                required
                                value={formData.sessionId}
                                onChange={(e) => setFormData({ ...formData, sessionId: e.target.value, classId: '' })}
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:border-purple-500 shadow-2xs"
                              >
                                {content?.sessions?.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} {s.isCurrent ? '• Active Session' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Program / Class Level *</label>
                              <select
                                required
                                value={formData.classId}
                                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:border-purple-500 shadow-2xs"
                              >
                                <option value="">Select Academic Offering</option>
                                {availableClasses.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} {c.section ? `• ${c.section}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                            {content?.departments && content.departments.length > 0 && (
                              <div>
                                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Department / Programme Field</label>
                                <select
                                  value={formData.departmentId}
                                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-purple-500 shadow-2xs"
                                >
                                  <option value="">General (No Department Restriction)</option>
                                  {content.departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name} ({d.code})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Entry Mode / Admission Type</label>
                              <select
                                value={formData.entryMode}
                                onChange={(e) => setFormData({ ...formData, entryMode: e.target.value })}
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-purple-500 shadow-2xs"
                              >
                                <option value="Fresh Entry">Fresh Entry (Standard Admission)</option>
                                <option value="Transfer Student">Transfer Student (Inter-School)</option>
                                <option value="Direct Entry">Direct Entry / Advanced Standing</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 2: APPLICANT DETAILS                                                 */}
                    {/* ========================================================================= */}
                    {formStep === 2 && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                              <User className="w-4 h-4 text-purple-600" />
                              <span>STEP 2 — APPLICANT DETAILS</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-stone-500">Personal Profile</span>
                          </div>

                          {/* Passport Photo Upload */}
                          <div className="p-3.5 rounded-xl bg-white border border-stone-200 flex flex-col sm:flex-row items-center gap-4">
                            <div className="relative shrink-0">
                              {formData.passportPhoto ? (
                                <img
                                  src={formData.passportPhoto}
                                  alt="Passport"
                                  className="w-20 h-20 rounded-2xl object-cover border-2 border-purple-500 shadow-md"
                                />
                              ) : (
                                <div className="w-20 h-20 rounded-2xl bg-purple-50 border-2 border-dashed border-purple-300 flex flex-col items-center justify-center text-purple-600">
                                  <Camera className="w-6 h-6" />
                                  <span className="text-[9px] font-bold mt-1 uppercase">Photo</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-center sm:text-left space-y-1">
                              <label className="block text-xs font-bold text-slate-900">Passport Photograph *</label>
                              <p className="text-[11px] text-stone-500">
                                Upload a clear colored passport photo of the applicant (JPEG, PNG, or WebP up to 5MB).
                              </p>
                              <div className="pt-1.5 flex items-center justify-center sm:justify-start gap-2">
                                <label className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-2xs">
                                  <span>{formData.passportPhoto ? 'Change Photo' : 'Upload Photo'}</span>
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(e) => handleFileUpload('doc_passport', e)}
                                    className="hidden"
                                  />
                                </label>
                                {formData.passportPhoto && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDoc('doc_passport')}
                                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-rose-600 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">First Name *</label>
                              <input
                                type="text"
                                required
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                placeholder="e.g. Babatunde"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Middle Name</label>
                              <input
                                type="text"
                                value={formData.middleName}
                                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                                placeholder="e.g. Ayodele"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Last Name *</label>
                              <input
                                type="text"
                                required
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                placeholder="e.g. Adeleke"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Date of Birth *</label>
                              <DatePicker
                                required
                                value={formData.dateOfBirth}
                                onChange={(val) => setFormData({ ...formData, dateOfBirth: val })}
                                placeholder="Select date of birth..."
                                minYear={1970}
                                maxYear={new Date().getFullYear()}
                                theme="light"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Gender *</label>
                              <select
                                value={formData.gender}
                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Email Address *</label>
                              <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="applicant@example.com"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Phone Number *</label>
                              <input
                                type="tel"
                                required
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="+234 800 000 0000"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-stone-700 mb-1">Residential Address *</label>
                            <textarea
                              required
                              rows={2}
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                              placeholder="Street name, city, and state"
                              className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500 resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Nationality</label>
                              <input
                                type="text"
                                value={formData.nationality}
                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                placeholder="e.g. Nigerian"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">State of Origin</label>
                              <input
                                type="text"
                                value={formData.stateOfOrigin}
                                onChange={(e) => setFormData({ ...formData, stateOfOrigin: e.target.value })}
                                placeholder="e.g. Lagos State"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">LGA</label>
                              <input
                                type="text"
                                value={formData.lga}
                                onChange={(e) => setFormData({ ...formData, lga: e.target.value })}
                                placeholder="e.g. Eti-Osa"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 3: PARENT / GUARDIAN                                                */}
                    {/* ========================================================================= */}
                    {formStep === 3 && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-purple-600" />
                              <span>STEP 3 — PARENT / GUARDIAN DETAILS</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-stone-500">Sponsor Contact</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Relationship</label>
                              <select
                                value={formData.guardianRelationship}
                                onChange={(e) => setFormData({ ...formData, guardianRelationship: e.target.value })}
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              >
                                <option value="Father">Father</option>
                                <option value="Mother">Mother</option>
                                <option value="Guardian">Guardian</option>
                                <option value="Sponsor">Sponsor</option>
                                <option value="Self">Self (Adult Applicant)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">
                                {formData.guardianRelationship === 'Self' ? 'Self Responsible' : 'Parent / Guardian Name *'}
                              </label>
                              <input
                                type="text"
                                required={formData.guardianRelationship !== 'Self'}
                                value={formData.guardianName}
                                onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                                placeholder="e.g. Chief Ayodeji Adeleke"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Guardian Phone *</label>
                              <input
                                type="tel"
                                required={formData.guardianRelationship !== 'Self'}
                                value={formData.guardianPhone}
                                onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                                placeholder="+234 800 000 0000"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Guardian Email</label>
                              <input
                                type="email"
                                value={formData.guardianEmail}
                                onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                                placeholder="guardian@example.com"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-[11px] font-bold text-stone-700">Guardian Residential Address</label>
                              <label className="inline-flex items-center gap-1.5 text-xs text-purple-800 font-bold cursor-pointer selection:bg-none">
                                <input
                                  type="checkbox"
                                  checked={formData.guardianSameAddress}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      guardianSameAddress: e.target.checked,
                                      guardianAddress: e.target.checked ? prev.address : prev.guardianAddress,
                                    }))
                                  }
                                  className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500"
                                />
                                <span>Same as applicant address</span>
                              </label>
                            </div>
                            <textarea
                              rows={2}
                              disabled={formData.guardianSameAddress}
                              value={formData.guardianSameAddress ? formData.address : formData.guardianAddress}
                              onChange={(e) => setFormData({ ...formData, guardianAddress: e.target.value })}
                              placeholder="Guardian street address, city, and state"
                              className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-purple-500 resize-none disabled:bg-stone-100 disabled:text-stone-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Occupation / Profession</label>
                              <input
                                type="text"
                                value={formData.guardianOccupation}
                                onChange={(e) => setFormData({ ...formData, guardianOccupation: e.target.value })}
                                placeholder="e.g. Civil Servant / Engineer"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Emergency Contact Name</label>
                              <input
                                type="text"
                                value={formData.emergencyContactName}
                                onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                                placeholder="e.g. Dr. Kemi Adeleke"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-700 mb-1">Emergency Phone</label>
                              <input
                                type="tel"
                                value={formData.emergencyContactPhone}
                                onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                                placeholder="+234 800 000 0000"
                                className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-purple-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 4: DOCUMENTS                                                         */}
                    {/* ========================================================================= */}
                    {formStep === 4 && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-purple-600" />
                              <span>STEP 4 — REQUIRED DOCUMENT UPLOADS</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-stone-500">Digital Credentials</span>
                          </div>

                          <p className="text-xs text-stone-600 leading-relaxed">
                            Upload clear digital copies of your credentials below (PDF, PNG, JPEG or WebP up to 10MB each).
                          </p>

                          <div className="space-y-3">
                            {documents.map((doc) => {
                              const hasFile = Boolean(doc.fileData);
                              return (
                                <div
                                  key={doc.id}
                                  className={`p-3.5 rounded-xl border transition-all ${
                                    hasFile
                                      ? 'bg-emerald-50/60 border-emerald-300'
                                      : doc.isRequired
                                      ? 'bg-white border-stone-300'
                                      : 'bg-stone-50/50 border-stone-200'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs sm:text-sm text-slate-900">{doc.title}</span>
                                        {doc.isRequired ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                                            Required
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-600">
                                            Optional
                                          </span>
                                        )}
                                        {hasFile && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span>Uploaded</span>
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-stone-500">{doc.description}</p>
                                      {hasFile && (
                                        <div className="text-[11px] font-mono font-bold text-emerald-800 pt-1 flex items-center gap-1.5">
                                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                          <span className="truncate max-w-[200px] sm:max-w-[300px]">{doc.fileName}</span>
                                          <span className="text-stone-400">({(doc.fileSize / 1024).toFixed(0)} KB)</span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {hasFile ? (
                                        <>
                                          <label className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-2xs">
                                            <span>Replace</span>
                                            <input
                                              type="file"
                                              onChange={(e) => handleFileUpload(doc.id, e)}
                                              className="hidden"
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveDoc(doc.id)}
                                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                            title="Remove File"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </>
                                      ) : (
                                        <label className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5">
                                          <Upload className="w-3.5 h-3.5" />
                                          <span>Upload File</span>
                                          <input
                                            type="file"
                                            onChange={(e) => handleFileUpload(doc.id, e)}
                                            className="hidden"
                                          />
                                        </label>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 5: REVIEW & SUBMIT                                                  */}
                    {/* ========================================================================= */}
                    {formStep === 5 && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-purple-600" />
                              <span>STEP 5 — APPLICATION SUMMARY REVIEW</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-stone-500">Final Verification</span>
                          </div>

                          <p className="text-xs text-stone-600">
                            Please review your application summary below. Use the <strong>Edit</strong> button beside any section to modify details before final submission.
                          </p>

                          <div className="space-y-3 text-xs">
                            {/* Academic Review Card */}
                            <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2">
                              <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                                <span className="font-extrabold uppercase text-[11px] text-purple-800">01 Academic Placement</span>
                                <button
                                  type="button"
                                  onClick={() => setFormStep(1)}
                                  className="text-purple-600 hover:text-purple-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                                <div><span className="text-stone-400">Session: </span><strong>{content?.sessions?.find(s => s.id.toString() === formData.sessionId)?.name || formData.sessionId}</strong></div>
                                <div><span className="text-stone-400">Program / Class: </span><strong>{availableClasses.find(c => c.id.toString() === formData.classId)?.name || formData.classId}</strong></div>
                                {formData.entryMode && <div><span className="text-stone-400">Entry Mode: </span><span>{formData.entryMode}</span></div>}
                                {formData.departmentId && <div><span className="text-stone-400">Department: </span><span>{content?.departments?.find(d => d.id.toString() === formData.departmentId)?.name}</span></div>}
                              </div>
                            </div>

                            {/* Applicant Details Review Card */}
                            <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2">
                              <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                                <span className="font-extrabold uppercase text-[11px] text-purple-800">02 Applicant Details</span>
                                <button
                                  type="button"
                                  onClick={() => setFormStep(2)}
                                  className="text-purple-600 hover:text-purple-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                                <div><span className="text-stone-400">Full Name: </span><strong>{formData.firstName} {formData.middleName} {formData.lastName}</strong></div>
                                <div><span className="text-stone-400">DOB & Gender: </span><span>{formData.dateOfBirth} ({formData.gender})</span></div>
                                <div><span className="text-stone-400">Email: </span><span>{formData.email}</span></div>
                                <div><span className="text-stone-400">Phone: </span><span>{formData.phone}</span></div>
                                <div className="sm:col-span-2"><span className="text-stone-400">Address: </span><span>{formData.address}</span></div>
                                <div><span className="text-stone-400">Origin: </span><span>{formData.nationality} • {formData.stateOfOrigin || 'N/A'} {formData.lga ? `(${formData.lga} LGA)` : ''}</span></div>
                              </div>
                            </div>

                            {/* Guardian Review Card */}
                            <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2">
                              <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                                <span className="font-extrabold uppercase text-[11px] text-purple-800">03 Parent / Guardian</span>
                                <button
                                  type="button"
                                  onClick={() => setFormStep(3)}
                                  className="text-purple-600 hover:text-purple-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                                <div><span className="text-stone-400">Guardian Name: </span><strong>{formData.guardianName || 'Self'}</strong> ({formData.guardianRelationship})</div>
                                <div><span className="text-stone-400">Phone & Email: </span><span>{formData.guardianPhone} {formData.guardianEmail ? `• ${formData.guardianEmail}` : ''}</span></div>
                                {formData.guardianOccupation && <div><span className="text-stone-400">Occupation: </span><span>{formData.guardianOccupation}</span></div>}
                                {formData.emergencyContactName && <div><span className="text-stone-400">Emergency Contact: </span><span>{formData.emergencyContactName} ({formData.emergencyContactPhone})</span></div>}
                              </div>
                            </div>

                            {/* Documents Review Card */}
                            <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2">
                              <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                                <span className="font-extrabold uppercase text-[11px] text-purple-800">04 Uploaded Credentials</span>
                                <button
                                  type="button"
                                  onClick={() => setFormStep(4)}
                                  className="text-purple-600 hover:text-purple-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                              <div className="space-y-1 text-slate-800">
                                {documents.map((d) => (
                                  <div key={d.id} className="flex items-center justify-between text-[11px]">
                                    <span>{d.title}</span>
                                    {d.fileData ? (
                                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> {d.fileName}
                                      </span>
                                    ) : (
                                      <span className="text-stone-400 italic">Not Uploaded</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Accuracy Declaration Checkbox */}
                          <div className="p-3.5 bg-purple-500/10 border border-purple-200 rounded-xl space-y-2">
                            <label className="flex items-start gap-2.5 cursor-pointer selection:bg-none">
                              <input
                                type="checkbox"
                                required
                                checked={formData.confirmedDeclaration}
                                onChange={(e) => setFormData({ ...formData, confirmedDeclaration: e.target.checked })}
                                className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-xs font-bold text-slate-900 leading-relaxed">
                                I confirm that all information and documents provided in this application are accurate, authentic, and complete. I understand that falsification of credentials will result in immediate disqualification.
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step Navigation Controls */}
                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-stone-200">
                      {formStep > 1 ? (
                        <button
                          type="button"
                          onClick={handlePrevStep}
                          className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-800 font-bold text-xs sm:text-sm hover:bg-stone-100 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>Previous Step</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsFormModalOpen(false)}
                          className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      {formStep < 5 ? (
                        <button
                          type="button"
                          onClick={handleNextStep}
                          className="px-7 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-2"
                        >
                          <span>Continue to Step {formStep + 1}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={submitting || !formData.confirmedDeclaration}
                          className="px-8 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-2"
                        >
                          {submitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Submitting Application...</span>
                            </>
                          ) : (
                            <>
                              <span>Submit Application</span>
                              <CheckCircle2 className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Tracking Flow */}
            {activeTab === 'track' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Track Admission Status</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Enter your credentials to view committee decisions.</p>
                </div>

                {trackError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{trackError}</span>
                  </div>
                )}

                <form onSubmit={handleTrackSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">Application Number *</label>
                      <input
                        type="text"
                        required
                        value={trackNumber}
                        onChange={(e) => setTrackNumber(e.target.value)}
                        placeholder="e.g. APP-2026-89241"
                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:bg-white focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">Access Key *</label>
                      <input
                        type="text"
                        required
                        value={trackKey}
                        onChange={(e) => setTrackKey(e.target.value)}
                        placeholder="e.g. APP-KEY-..."
                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-hidden focus:bg-white focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={trackingLoading}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {trackingLoading ? 'Searching...' : 'Lookup Application Status'}
                  </button>
                </form>

                {/* Tracking Detail Result */}
                {trackedApp && (
                  <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                      <div>
                        <span className="text-xs font-mono font-bold text-purple-600">{trackedApp.applicationNumber}</span>
                        <h4 className="font-extrabold text-slate-900 text-base">{trackedApp.applicantName}</h4>
                      </div>
                      <div>{getStatusBadge(trackedApp.status)}</div>
                    </div>

                    {trackedApp.status === 'approved' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Admission Approved & Enrolled!</span>
                        </div>
                        <p>Admitted for {trackedApp.className} ({trackedApp.sessionName}).</p>
                        {trackedApp.enrolledStudentId && (
                          <div className="font-mono font-bold text-slate-900 mt-1">
                            Official Student ID: {trackedApp.enrolledStudentId}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase font-bold">Academic Target</span>
                        <span className="font-bold text-slate-800">{trackedApp.className} ({trackedApp.sessionName})</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase font-bold">Submission Date</span>
                        <span className="font-bold text-slate-800">{new Date(trackedApp.submissionDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 11. MULTI-COLUMN FOOTER                                                   */}
      {/* ========================================================================= */}
      <footer className="bg-white border-t border-stone-200/80 pt-12 pb-8 text-xs text-stone-500">
        <ScrollReveal direction="up" distance={28} duration={1700}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base">
                  <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white shadow-xs">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <span>{schoolName}</span>
                </div>
                <p className="text-stone-500 text-xs leading-relaxed max-w-xs">
                  Empowering future global leaders through accredited academic curriculum, modern science innovation, and character building.
                </p>
              </div>

              <div>
                <h5 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-3">Academic Navigation</h5>
                <ul className="space-y-2 text-xs">
                  <li><a href="#hero" className="hover:text-purple-600">Home Admissions</a></li>
                  {content?.settings?.showPrograms && <li><a href="#programs" className="hover:text-purple-600">Programs & Offerings</a></li>}
                  {content?.settings?.showRequirements && <li><a href="#requirements" className="hover:text-purple-600">Admission Requirements</a></li>}
                  {content?.settings?.showImportantDates && <li><a href="#dates" className="hover:text-purple-600">Key Dates & Deadlines</a></li>}
                  {content?.settings?.showNews && <li><a href="#news" className="hover:text-purple-600">News & Guides</a></li>}
                </ul>
              </div>

              <div>
                <h5 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-3">Applicant Support</h5>
                <ul className="space-y-2 text-xs">
                  {content?.settings?.showContact && <li><a href="#contact" className="hover:text-purple-600">Admissions Help Desk</a></li>}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('track');
                        setIsFormModalOpen(true);
                      }}
                      className="hover:text-purple-600 cursor-pointer"
                    >
                      Live Status Tracker
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={onBackToLogin} className="hover:text-purple-600 cursor-pointer">
                      Back to Login
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-3">Institutional Links</h5>
                <p className="text-xs text-stone-500 mb-3">
                  {content?.settings?.officeHours || 'Mon - Fri • 8:00 AM - 5:00 PM'}
                </p>
                <div className="flex items-center gap-3 text-stone-400">
                  {content?.settings?.websiteUrl && (
                    <a
                      href={content.settings.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                    >
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  {content?.settings?.facebookUrl && (
                    <a
                      href={content.settings.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 cursor-pointer text-xs font-bold"
                    >
                      Fb
                    </a>
                  )}
                  {content?.settings?.twitterUrl && (
                    <a
                      href={content.settings.twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 cursor-pointer text-xs font-bold"
                    >
                      X
                    </a>
                  )}
                  {content?.settings?.instagramUrl && (
                    <a
                      href={content.settings.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 cursor-pointer text-xs font-bold"
                    >
                      Ig
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-400 gap-2">
              <span>&copy; {new Date().getFullYear()} {schoolName}. All rights reserved.</span>
              <div className="flex items-center gap-4">
                <span className="hover:text-stone-600 cursor-pointer">Privacy Policy</span>
                <span className="hover:text-stone-600 cursor-pointer">Terms & Conditions</span>
                <span className="hover:text-stone-600 cursor-pointer">Accreditation Board</span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </footer>
    </div>
  );
};
