import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  Mail,
  GraduationCap,
  Users,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  X,
  UserPlus,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { UserRole } from '../types.ts';
import { StudentPortalIllustration } from '../components/StudentPortalIllustration.tsx';
import { ParentPortalIllustration } from '../components/ParentPortalIllustration.tsx';
import { TeacherPortalIllustration } from '../components/TeacherPortalIllustration.tsx';
import { AdminPortalIllustration } from '../components/AdminPortalIllustration.tsx';

interface PortalConfig {
  role: UserRole;
  urlPath: string;
  badgeLabel: string;
  headerTitle: string;
  welcomeSubtext: string;
  bgGradient: string;
  illustration: React.ComponentType<{ className?: string }>;
  icon: React.ComponentType<{ className?: string }>;
  defaultEmail: string;
  defaultPass: string;
  signupTitle: string;
  signupPrompt: string;
  allowSignUp: boolean;
  allowGoogle: boolean;
  accessNote: string;
  accentHex: string;
  buttonClass: string;
  focusBorderClass: string;
  activeBadgeClass: string;
  subtextClass: string;
  footerClass: string;
}

const isDev = Boolean(import.meta.env?.DEV);

const PORTAL_CONFIGS: Record<UserRole, PortalConfig> = {
  student: {
    role: 'student',
    urlPath: '/student/login',
    badgeLabel: 'Student Portal',
    headerTitle: 'Welcome to\nstudent portal',
    welcomeSubtext: 'Login to access your account',
    bgGradient: 'from-[#8B5CF6] via-[#7C3AED] to-[#6D28D9]',
    illustration: StudentPortalIllustration,
    icon: BookOpen,
    defaultEmail: isDev ? 'student.chinedu@school.com' : '',
    defaultPass: isDev ? 'student123' : '',
    signupTitle: 'Student Portal Activation',
    signupPrompt: 'Activate student account with your registered Student ID',
    allowSignUp: true,
    allowGoogle: false,
    accessNote: 'Accessible by Students & Enrolled Scholars',
    accentHex: '#8B5CF6',
    buttonClass: 'bg-[#8B5CF6] hover:bg-[#7C3AED] shadow-purple-600/30',
    focusBorderClass: 'focus:border-[#8B5CF6]',
    activeBadgeClass: 'bg-white text-purple-900 shadow-xs',
    subtextClass: 'text-purple-100/90',
    footerClass: 'text-purple-200/80',
  },
  parent: {
    role: 'parent',
    urlPath: '/parent/login',
    badgeLabel: 'Parent Portal',
    headerTitle: 'Welcome to\nparent portal',
    welcomeSubtext: 'Login to access your account',
    bgGradient: 'from-[#059669] via-[#047857] to-[#064E3B]',
    illustration: ParentPortalIllustration,
    icon: Users,
    defaultEmail: isDev ? 'parent.ibrahim@school.com' : '',
    defaultPass: isDev ? 'parent123' : '',
    signupTitle: 'Parent Account Access',
    signupPrompt: 'Access your parent dashboard linked to your child\'s school profile',
    allowSignUp: true,
    allowGoogle: true,
    accessNote: 'Restricted strictly to registered Parents & Guardians',
    accentHex: '#059669',
    buttonClass: 'bg-[#059669] hover:bg-[#047857] shadow-emerald-600/30',
    focusBorderClass: 'focus:border-[#059669]',
    activeBadgeClass: 'bg-white text-emerald-900 shadow-xs',
    subtextClass: 'text-emerald-100/90',
    footerClass: 'text-emerald-200/80',
  },
  teacher: {
    role: 'teacher',
    urlPath: '/teacher/login',
    badgeLabel: 'Teacher Portal',
    headerTitle: 'Welcome to\nteacher portal',
    welcomeSubtext: 'Login to access your account',
    bgGradient: 'from-[#2563EB] via-[#1D4ED8] to-[#1E40AF]',
    illustration: TeacherPortalIllustration,
    icon: GraduationCap,
    defaultEmail: isDev ? 'teacher.adewale@school.com' : '',
    defaultPass: isDev ? 'teacher123' : '',
    signupTitle: 'Teacher Portal Setup',
    signupPrompt: 'Faculty credentials and classroom workstation access',
    allowSignUp: true,
    allowGoogle: true,
    accessNote: 'Faculty & Instructor authorization required',
    accentHex: '#2563EB',
    buttonClass: 'bg-[#2563EB] hover:bg-[#1D4ED8] shadow-blue-600/30',
    focusBorderClass: 'focus:border-[#2563EB]',
    activeBadgeClass: 'bg-white text-blue-900 shadow-xs',
    subtextClass: 'text-blue-100/90',
    footerClass: 'text-blue-200/80',
  },
  super_admin: {
    role: 'super_admin',
    urlPath: '/admin/login',
    badgeLabel: 'Admin Portal',
    headerTitle: 'Welcome to\nadmin portal',
    welcomeSubtext: 'Login to access your account',
    bgGradient: 'from-[#1E1B4B] via-[#2E1065] to-[#4A044E]',
    illustration: AdminPortalIllustration,
    icon: Shield,
    defaultEmail: isDev ? 'admin@school.com' : '',
    defaultPass: isDev ? 'admin123' : '',
    signupTitle: 'System Admin Authorization',
    signupPrompt: 'Executive management and administrative control access',
    allowSignUp: false, // Admin accounts cannot casually self-register
    allowGoogle: true,
    accessNote: 'Super Admin credentials with 2FA email confirmation',
    accentHex: '#9333EA',
    buttonClass: 'bg-[#9333EA] hover:bg-[#7E22CE] shadow-purple-900/40',
    focusBorderClass: 'focus:border-[#9333EA]',
    activeBadgeClass: 'bg-white text-purple-950 shadow-xs',
    subtextClass: 'text-purple-200/90',
    footerClass: 'text-purple-200/80',
  },
};

interface LoginViewProps {
  onOpenAdmissions?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onOpenAdmissions }) => {
  const { login, verifyAdminCode, resendAdminCode, loginWithGoogle } = useAuth();
  const { schoolName } = useSettings();

  // Determine initial role from URL pathname or query param
  const getInitialRole = (): UserRole => {
    if (typeof window === 'undefined') return 'super_admin';
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role') || params.get('portal');

    if (path.includes('/student') || roleParam === 'student') return 'student';
    if (path.includes('/parent') || roleParam === 'parent') return 'parent';
    if (path.includes('/teacher') || roleParam === 'teacher') return 'teacher';
    if (path.includes('/admin') || roleParam === 'admin' || roleParam === 'super_admin') return 'super_admin';
    return 'super_admin';
  };

  const [role, setRole] = useState<UserRole>(getInitialRole);
  const activeConfig = PORTAL_CONFIGS[role] || PORTAL_CONFIGS.super_admin;

  // Active form view: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  // Form states initialized to current role defaults
  const [identifier, setIdentifier] = useState(activeConfig.defaultEmail);
  const [password, setPassword] = useState(activeConfig.defaultPass);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // 2FA Admin Email Verification State
  const [verifySession, setVerifySession] = useState<{
    verifyToken: string;
    email: string;
    devCode?: string;
    message?: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendSuccessMessage, setResendSuccessMessage] = useState<string | null>(null);

  // Sign up form state
  const [signupStudentId, setSignupStudentId] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Forgot password modal
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Sync role changes with URL
  const switchPortal = (newRole: UserRole, updateHistory = true) => {
    setRole(newRole);
    const cfg = PORTAL_CONFIGS[newRole];
    setIdentifier(cfg.defaultEmail);
    setPassword(cfg.defaultPass);
    setError(null);
    setVerifySession(null);
    setVerificationCode('');
    if (!cfg.allowSignUp && activeTab === 'signup') {
      setActiveTab('login');
    }
    if (updateHistory && typeof window !== 'undefined') {
      window.history.pushState({ role: newRole }, '', cfg.urlPath);
    }
  };

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const detected = getInitialRole();
      setRole(detected);
      const cfg = PORTAL_CONFIGS[detected];
      setIdentifier(cfg.defaultEmail);
      setPassword(cfg.defaultPass);
      setVerifySession(null);
      setVerificationCode('');
      if (!cfg.allowSignUp && activeTab === 'signup') {
        setActiveTab('login');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);

  // Touch swipe gesture handling on input boxes container (mobile/tablet)
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 45;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && activeTab === 'login' && activeConfig.allowSignUp) {
      setActiveTab('signup');
      setError(null);
    } else if (isRightSwipe && activeTab === 'signup') {
      setActiveTab('login');
      setError(null);
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please enter your username/email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await login(identifier, password, role);
      if (res && res.requiresVerification && res.verifyToken) {
        setVerifySession({
          verifyToken: res.verifyToken,
          email: res.email || identifier,
          devCode: res.devCode,
          message: res.message,
        });
        setVerificationCode(res.devCode || '');
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please verify and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifySession || !verificationCode) {
      setError('Please enter the 6-digit confirmation code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyAdminCode(verifySession.verifyToken, verificationCode);
    } catch (err: any) {
      setError(err.message || 'Verification code failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!verifySession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await resendAdminCode(verifySession.verifyToken);
      if (res.devCode) {
        setVerifySession((prev) => (prev ? { ...prev, devCode: res.devCode } : null));
        setVerificationCode(res.devCode);
      }
      setResendSuccessMessage(res.message || 'New verification code sent!');
      setTimeout(() => setResendSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not be completed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotSent(true);
  };

  const [signupLoading, setSignupLoading] = useState(false);

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupStudentId || !signupPassword) {
      setError('Please provide identifier and create a password.');
      return;
    }
    setSignupLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/activate-portal-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: signupStudentId,
          email: signupEmail || undefined,
          password: signupPassword,
          role,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate portal account.');
      }

      setSignupSuccess(true);
      setTimeout(() => {
        setIdentifier(data.email || signupStudentId);
        setPassword(signupPassword);
        setActiveTab('login');
        setSignupSuccess(false);
      }, 1400);
    } catch (err: any) {
      setError(err.message || 'Account activation failed. Please check your ID.');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleCopyUrl = (urlPath: string) => {
    const fullUrl = `${window.location.origin}${urlPath}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(urlPath);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="w-full min-h-screen lg:h-screen lg:overflow-hidden bg-[#16171b] text-white flex flex-col lg:flex-row selection:bg-[#8B5CF6] selection:text-white">
      {/* ========================================================================= */}
      {/* LEFT PANEL: Dark Theme Form Section (Desktop Left, Mobile Bottom)         */}
      {/* "Only the input box is scrollable" -> Independent full-height scroll container */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[40%] h-full flex flex-col justify-between order-2 lg:order-1 bg-[#16171b] z-10 shrink-0 relative overflow-hidden">
        
        {/* Scrollable Container for Inputs / Form Content */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 sm:p-10 lg:p-12 xl:p-14 2xl:p-16 flex flex-col justify-between min-h-0"
        >
          {/* Top Form Header Area with animated header text */}
          <div className="shrink-0 mb-6 sm:mb-8 overflow-hidden">
            <div className="relative min-h-[64px] sm:min-h-[72px]">
              {/* Login Header */}
              <div
                className={`transition-all duration-300 ease-out transform ${
                  activeTab === 'login'
                    ? 'opacity-100 translate-x-0 pointer-events-auto relative'
                    : 'opacity-0 -translate-x-8 pointer-events-none absolute inset-0'
                }`}
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  Login
                </h2>
                <p className="text-sm text-zinc-400 mt-1.5 font-normal">
                  Enter your account details
                </p>
              </div>

              {/* Sign Up Header */}
              <div
                className={`transition-all duration-300 ease-out transform ${
                  activeTab === 'signup'
                    ? 'opacity-100 translate-x-0 pointer-events-auto relative'
                    : 'opacity-0 translate-x-8 pointer-events-none absolute inset-0'
                }`}
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  Sign Up
                </h2>
                <p className="text-sm text-zinc-400 mt-1.5 font-normal">
                  {activeConfig.signupPrompt}
                </p>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-200 text-xs sm:text-sm animate-fadeIn shadow-xs">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-rose-300 text-xs uppercase tracking-wider">Access Notice</div>
                  <p className="font-normal text-rose-200/90 leading-relaxed text-xs sm:text-sm">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sliding Form Container (Slide in & Slide out animation) */}
          <div className="my-auto py-2 w-full overflow-hidden">
            <div
              className={`flex w-[200%] transition-transform duration-350 ease-in-out ${
                activeTab === 'login' ? 'translate-x-0' : '-translate-x-1/2'
              }`}
            >
              {/* ================= PANEL 1: LOGIN FORM ================= */}
              <div
                className={`w-1/2 shrink-0 pr-4 sm:pr-6 transition-opacity duration-300 ${
                  activeTab === 'login' ? 'opacity-100' : 'opacity-20 pointer-events-none'
                }`}
                aria-hidden={activeTab !== 'login'}
              >
                <form onSubmit={handleLoginSubmit} className="space-y-6 sm:space-y-7">
                  {/* Username / Email field */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      tabIndex={activeTab === 'login' ? 0 : -1}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter your username or email"
                      required={activeTab === 'login'}
                      className={`w-full bg-transparent border-b border-zinc-700/80 pb-2.5 pt-1 text-white placeholder-zinc-500/70 focus:outline-hidden ${activeConfig.focusBorderClass} text-sm sm:text-base transition-colors`}
                    />
                  </div>

                  {/* Password field */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        tabIndex={activeTab === 'login' ? 0 : -1}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required={activeTab === 'login'}
                        className={`w-full bg-transparent border-b border-zinc-700/80 pb-2.5 pt-1 pr-10 text-white placeholder-zinc-500/70 focus:outline-hidden ${activeConfig.focusBorderClass} text-sm sm:text-base transition-colors`}
                      />
                      <button
                        type="button"
                        tabIndex={activeTab === 'login' ? 0 : -1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-0 text-zinc-400 hover:text-zinc-200 p-1.5 transition-colors cursor-pointer"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Quick Demo Credentials Assistant */}
                  {activeConfig.defaultEmail && (
                    <div className="p-3.5 rounded-xl bg-[#202228] border border-zinc-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                          <span>Demo {activeConfig.badgeLabel} Acc:</span>
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          <span className="text-zinc-300">{activeConfig.defaultEmail}</span>
                          <span className="text-zinc-600 mx-1.5">|</span>
                          <span className="text-emerald-300">{activeConfig.defaultPass}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIdentifier(activeConfig.defaultEmail);
                          setPassword(activeConfig.defaultPass);
                          setError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors cursor-pointer shrink-0 border border-zinc-700/60 shadow-xs"
                      >
                        Auto-fill
                      </button>
                    </div>
                  )}

                  {/* Forgot Password Link */}
                  <div className="flex justify-start">
                    <button
                      type="button"
                      tabIndex={activeTab === 'login' ? 0 : -1}
                      onClick={() => {
                        setForgotSent(false);
                        setShowForgotPassword(true);
                      }}
                      className="text-xs sm:text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer font-normal"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Main Dynamic Portal Action Button */}
                  <div className="pt-2 space-y-3.5">
                    <button
                      type="submit"
                      disabled={loading}
                      tabIndex={activeTab === 'login' ? 0 : -1}
                      className={`w-full py-3.5 px-6 rounded-xl font-semibold text-base text-white ${activeConfig.buttonClass} active:scale-[0.99] transition-all duration-150 shadow-lg cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2`}
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>Login</span>
                      )}
                    </button>

                    {/* Google Sign-in Option */}
                    {activeConfig.allowGoogle && (
                      <button
                        type="button"
                        tabIndex={activeTab === 'login' ? 0 : -1}
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading}
                        className="w-full py-3 px-6 rounded-xl font-medium text-sm text-zinc-300 bg-zinc-900/90 hover:bg-zinc-800 hover:text-white active:scale-[0.99] border border-zinc-800 shadow-xs transition-all duration-150 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-3"
                      >
                        {googleLoading ? (
                          <div className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                              />
                              <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              />
                              <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                              />
                              <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                              />
                            </svg>
                            <span>Sign in with Google</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* ================= PANEL 2: SIGN UP / ACTIVATION FORM ================= */}
              <div
                className={`w-1/2 shrink-0 pl-4 sm:pl-6 transition-opacity duration-300 ${
                  activeTab === 'signup' ? 'opacity-100' : 'opacity-20 pointer-events-none'
                }`}
                aria-hidden={activeTab !== 'signup'}
              >
                {signupSuccess ? (
                  <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2 font-bold text-white text-base">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>Account Activated!</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Your portal login has been registered. Switching to sign-in view...
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSignUpSubmit} className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        {role === 'student'
                          ? 'Student ID'
                          : role === 'teacher'
                          ? 'Staff / Employee ID'
                          : role === 'parent'
                          ? 'Registered Phone or Parent Email'
                          : 'Admin Identity Code'}
                      </label>
                      <input
                        type="text"
                        tabIndex={activeTab === 'signup' ? 0 : -1}
                        value={signupStudentId}
                        onChange={(e) => setSignupStudentId(e.target.value)}
                        placeholder={
                          role === 'student'
                            ? 'e.g. STU-2026-0001'
                            : role === 'teacher'
                            ? 'e.g. TCH-2026-001'
                            : 'e.g. parent@example.com'
                        }
                        required={activeTab === 'signup'}
                        className={`w-full bg-transparent border-b border-zinc-700 pb-2.5 pt-1 text-white placeholder-zinc-500 focus:outline-hidden ${activeConfig.focusBorderClass} text-sm sm:text-base transition-colors`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Email Address (Optional)
                      </label>
                      <input
                        type="email"
                        tabIndex={activeTab === 'signup' ? 0 : -1}
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="user@school.com"
                        className={`w-full bg-transparent border-b border-zinc-700 pb-2.5 pt-1 text-white placeholder-zinc-500 focus:outline-hidden ${activeConfig.focusBorderClass} text-sm sm:text-base transition-colors`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Create Password
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showSignupPassword ? 'text' : 'password'}
                          tabIndex={activeTab === 'signup' ? 0 : -1}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Create strong password"
                          required={activeTab === 'signup'}
                          className={`w-full bg-transparent border-b border-zinc-700 pb-2.5 pt-1 pr-10 text-white placeholder-zinc-500 focus:outline-hidden ${activeConfig.focusBorderClass} text-sm sm:text-base transition-colors`}
                        />
                        <button
                          type="button"
                          tabIndex={activeTab === 'signup' ? 0 : -1}
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute right-1 text-zinc-400 hover:text-zinc-200 p-1.5 transition-colors cursor-pointer"
                          aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                        >
                          {showSignupPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={signupLoading}
                        tabIndex={activeTab === 'signup' ? 0 : -1}
                        className={`w-full py-3.5 px-6 rounded-xl font-semibold text-base text-white ${activeConfig.buttonClass} active:scale-[0.99] transition-all duration-150 shadow-lg cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2`}
                      >
                        {signupLoading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            <span>Activate {activeConfig.badgeLabel}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

            {/* Bottom Footer: "Don't have an account? [Sign up]" (Disabled for Admin) */}
            <div className="shrink-0 pt-6 mt-6 border-t border-zinc-800/80 flex items-center justify-start gap-3 text-sm text-zinc-400">
              {activeConfig.allowSignUp ? (
                activeTab === 'login' ? (
                  <>
                    <span>Don't have an account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('signup');
                        setError(null);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#28292e] hover:bg-[#34363d] text-zinc-200 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    <span>Already have an account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('login');
                        setError(null);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#28292e] hover:bg-[#34363d] text-zinc-200 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      Sign in
                    </button>
                  </>
                )
              ) : (
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                  <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Administrative accounts are provisioned by institution directors only.</span>
                </div>
              )}
            </div>

            {/* Public Student Registration & Admissions Link */}
            <div className="mt-5 p-4 rounded-2xl bg-[#1b1c22] border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs sm:text-sm">Prospective Student Admissions</h4>
                  <p className="text-[11px] text-zinc-400">
                    Apply for admission or track an existing application status
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                  }
                  if (onOpenAdmissions) {
                    onOpenAdmissions();
                  } else {
                    window.location.hash = '#/admissions';
                  }
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-md shadow-purple-600/30 cursor-pointer self-start sm:self-center whitespace-nowrap"
              >
                Apply Online
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: FIXED Purple Hero Section (Stays Fixed, Never Scrolls)       */}
        {/* ========================================================================= */}
        <div
          className={`w-full lg:w-[60%] min-h-[380px] sm:min-h-[440px] lg:min-h-full lg:h-full bg-linear-to-b ${activeConfig.bgGradient} p-6 sm:p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden order-1 lg:order-2 shrink-0 select-none lg:sticky lg:top-0`}
        >
          {/* Layered Organic Wave Blobs & Fluid Curves (Matching the screenshot's purple aesthetic) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <svg
              className="absolute w-full h-full object-cover opacity-25"
              viewBox="0 0 600 500"
              preserveAspectRatio="none"
              fill="none"
            >
              {/* Top fluid wave */}
              <path
                d="M 0 120 Q 180 30 320 140 T 600 100 L 600 0 L 0 0 Z"
                fill="white"
                fillOpacity="0.12"
              />
              {/* Mid-lower fluid curve */}
              <path
                d="M 0 320 C 140 240, 260 360, 400 280 C 520 220, 560 300, 600 260 L 600 0 L 0 0 Z"
                fill="white"
                fillOpacity="0.1"
              />
              {/* Floating ambient circular blobs */}
              <circle cx="530" cy="110" r="180" fill="white" fillOpacity="0.08" />
              <circle cx="90" cy="380" r="160" fill="white" fillOpacity="0.08" />
            </svg>
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-purple-950/40 blur-3xl" />
          </div>

          {/* Top Header: Portal Header & Role Switcher */}
          <div className="relative z-10">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-white text-xs font-semibold">
                <activeConfig.icon className="w-3.5 h-3.5" />
                <span className="font-mono text-[11px]">{activeConfig.urlPath}</span>
              </div>

              {/* Quick portal selector buttons */}
              <div className="flex items-center gap-1 bg-black/25 backdrop-blur-md p-1 rounded-xl border border-white/15">
                {(Object.keys(PORTAL_CONFIGS) as UserRole[]).map((r) => {
                  const isSelected = role === r;
                  const item = PORTAL_CONFIGS[r];
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => switchPortal(r)}
                      title={`Switch to ${item.badgeLabel}`}
                      className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? activeConfig.activeBadgeClass
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {r === 'super_admin' ? 'Admin' : r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Welcome Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15] whitespace-pre-line drop-shadow-xs">
              {activeConfig.headerTitle}
            </h1>
            <p className={`mt-2 ${activeConfig.subtextClass} text-sm sm:text-base font-normal`}>
              {activeConfig.welcomeSubtext}
            </p>
          </div>

          {/* Centerpiece Vector Illustration (Dynamic for each portal) */}
          <div className="relative z-10 my-auto flex items-center justify-center py-4 lg:py-6">
            <activeConfig.illustration key={role} className="w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[440px] xl:max-w-[520px] 2xl:max-w-[580px] animate-fadeIn" />
          </div>

          {/* School Brand footer tag */}
          <div className={`relative z-10 flex items-center justify-between text-[11px] sm:text-xs ${activeConfig.footerClass} font-medium pt-2`}>
            <span>{schoolName || 'School Management Portal'}</span>
            <button
              type="button"
              onClick={() => handleCopyUrl(activeConfig.urlPath)}
              className="hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copiedUrl === activeConfig.urlPath ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span className="font-bold text-white">Copied URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Share link</span>
                </>
              )}
            </button>
          </div>
        </div>

      {/* ========================================================================= */}
      {/* 2FA EMAIL VERIFICATION CODE MODAL (SUPER ADMIN)                           */}
      {/* ========================================================================= */}
      {verifySession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#181822] border border-purple-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-white">
            <button
              type="button"
              onClick={() => {
                setVerifySession(null);
                setVerificationCode('');
                setError(null);
              }}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Cancel verification"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Shield / Mail icon */}
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center mb-5 shadow-lg shadow-purple-900/30">
              <ShieldCheck className="w-7 h-7 text-purple-400" />
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Email Confirmation Code
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
              To protect administrative access, enter the 6-digit verification code sent to:
            </p>
            <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-200 text-xs font-mono font-semibold">
              <Mail className="w-3.5 h-3.5 text-purple-400" />
              <span>{verifySession.email}</span>
            </div>

            {/* In-app preview banner / Simulated Mail Delivery */}
            {verifySession.devCode && (
              <div className="mt-4 p-3.5 rounded-2xl bg-purple-900/30 border border-purple-500/30 text-purple-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Simulated Email Dispatch
                  </div>
                  <p className="text-[11px] text-purple-200/80 mt-0.5">
                    Verification Code: <span className="font-mono font-bold text-white text-sm tracking-widest">{verifySession.devCode}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVerificationCode(verifySession.devCode || '')}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[11px] transition-all cursor-pointer shadow-xs self-start sm:self-center shrink-0"
                >
                  Autofill Code
                </button>
              </div>
            )}

            {/* Resend success notice */}
            {resendSuccessMessage && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{resendSuccessMessage}</span>
              </div>
            )}

            {/* Error notice */}
            {error && (
              <div className="mt-3 p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyCodeSubmit} className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  6-Digit Confirmation Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    value={verificationCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setVerificationCode(val);
                      setError(null);
                    }}
                    placeholder="• • • • • •"
                    required
                    className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-2xl px-4 py-3.5 text-center text-2xl font-mono tracking-[0.4em] text-white placeholder-zinc-600 focus:outline-hidden focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || verificationCode.length < 6}
                  className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 active:scale-[0.99] transition-all duration-150 shadow-lg shadow-purple-900/40 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirm & Access Admin Portal</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="hover:text-purple-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Didn't receive code? <span className="font-semibold text-purple-400 underline">Resend code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifySession(null);
                      setVerificationCode('');
                      setError(null);
                    }}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FORGOT PASSWORD MODAL                                                     */}
      {/* ========================================================================= */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#18181f] border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-white">
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-2">Reset Password</h3>
            <p className="text-xs sm:text-sm text-zinc-400 mb-6">
              Enter your registered email address or identifier to receive instructions to reset your password.
            </p>

            {forgotSent ? (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Password Reset Dispatched</span>
                </div>
                <p className="text-xs text-emerald-300">
                  If an account exists for <span className="font-semibold text-white">{forgotEmail}</span>, recovery instructions have been sent.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                    Email Address or Identifier
                  </label>
                  <input
                    type="text"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="e.g. user@school.com"
                    required
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-hidden focus:border-[#8B5CF6]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-[#8B5CF6] hover:bg-[#7C3AED] transition-colors cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  Send Reset Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
