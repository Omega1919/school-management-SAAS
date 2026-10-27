import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Lock,
  Phone,
  Shield,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  Send,
  Timer,
  RefreshCw,
  X,
  Pencil,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useAccountModal } from '../context/AccountModalContext.tsx';
import { apiRequest } from '../lib/api.ts';

function validatePasswordStrengthClient(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  return { valid: true };
}

export const AccountManagementSection: React.FC = () => {
  const { user, setAuth, token, refreshProfile } = useAuth();
  const { openLogoutConfirm } = useAccountModal();

  // Profile Form State (Name & Phone)
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email Change State (Modal with Email OTP Verification)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [emailOtpSent, setEmailOtpSent] = useState<boolean>(false);
  const [emailChallengeToken, setEmailChallengeToken] = useState<string>('');
  const [emailVerificationCode, setEmailVerificationCode] = useState<string>('');
  const [sendingEmailOtp, setSendingEmailOtp] = useState<boolean>(false);
  const [emailSaving, setEmailSaving] = useState<boolean>(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailResendCooldown, setEmailResendCooldown] = useState<number>(0);

  // Password Change State (Modal with Email OTP Verification)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [showConfirmPass, setShowConfirmPass] = useState<boolean>(false);

  // OTP State for Password Change
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [passwordSaving, setPasswordSaving] = useState<boolean>(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Sync user details on mount or user change
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  // Handle password resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Handle email resend countdown timer
  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailResendCooldown]);

  if (!user) return null;

  // Password strength checklist
  const passLengthOk = newPassword.length >= 8;
  const passUpperOk = /[A-Z]/.test(newPassword);
  const passLowerOk = /[a-z]/.test(newPassword);
  const passNumberOk = /[0-9]/.test(newPassword);
  const passSpecialOk = /[^A-Za-z0-9]/.test(newPassword);
  const passMatches = newPassword.length > 0 && newPassword === confirmPassword;

  // Update Profile Name and Phone
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string; user: any }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          phone,
        }),
      });

      if (res.user && token) {
        setAuth(token, {
          ...user,
          fullName: res.user.fullName,
          phone: res.user.phone,
        });
      }

      setProfileMessage({ type: 'success', text: res.message || 'Profile information updated successfully.' });
      refreshProfile();
      setTimeout(() => setProfileMessage(null), 4000);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Step 1: Request Email Change Verification Code (OTP)
  const handleRequestEmailOtp = async () => {
    if (!newEmail || !newEmail.trim()) {
      setEmailMessage({ type: 'error', text: 'Please enter your new email address.' });
      return;
    }

    if (newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setEmailMessage({ type: 'error', text: 'The new email is identical to your current email address.' });
      return;
    }

    setSendingEmailOtp(true);
    setEmailMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; challengeToken: string; message: string }>(
        '/auth/request-email-change-otp',
        {
          method: 'POST',
          body: JSON.stringify({ newEmail: newEmail.trim() }),
        }
      );

      setEmailChallengeToken(res.challengeToken);
      setEmailOtpSent(true);
      setEmailResendCooldown(60);
      setEmailMessage({
        type: 'success',
        text: res.message || `Verification code sent to ${newEmail.trim()}. Please check your inbox.`,
      });
    } catch (err: any) {
      setEmailMessage({
        type: 'error',
        text: err.message || 'Failed to send verification code. Please check the email address.',
      });
    } finally {
      setSendingEmailOtp(false);
    }
  };

  // Step 2: Confirm Email Change with single-use OTP
  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailOtpSent) {
      await handleRequestEmailOtp();
      return;
    }

    if (!emailVerificationCode || emailVerificationCode.trim().length < 6) {
      setEmailMessage({ type: 'error', text: 'Please enter the 6-digit verification code sent to your new email.' });
      return;
    }

    setEmailSaving(true);
    setEmailMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string; user: any }>('/auth/confirm-email-change', {
        method: 'POST',
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          challengeToken: emailChallengeToken,
          code: emailVerificationCode.trim(),
        }),
      });

      if (res.user && token) {
        setAuth(token, {
          ...user,
          email: res.user.email,
        });
      }

      setEmailMessage({
        type: 'success',
        text: res.message || 'Email address successfully updated and verified! Confirmation alert sent.',
      });
      refreshProfile();

      setTimeout(() => {
        setIsEmailModalOpen(false);
        setNewEmail('');
        setEmailVerificationCode('');
        setEmailOtpSent(false);
        setEmailChallengeToken('');
        setEmailMessage(null);
      }, 2500);
    } catch (err: any) {
      setEmailMessage({
        type: 'error',
        text: err.message || 'Failed to verify code and update email. Please check your verification code.',
      });
    } finally {
      setEmailSaving(false);
    }
  };

  // Request Password Change OTP
  const handleRequestPasswordOtp = async () => {
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current password first.' });
      return;
    }

    setSendingOtp(true);
    setPasswordMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; challengeToken: string; message: string }>(
        '/auth/request-password-change-otp',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword }),
        }
      );

      setChallengeToken(res.challengeToken);
      setOtpSent(true);
      setResendCooldown(60);
      setPasswordMessage({
        type: 'success',
        text: res.message || `Verification code sent to ${user.email}. Please check your inbox.`,
      });
    } catch (err: any) {
      setPasswordMessage({
        type: 'error',
        text: err.message || 'Failed to send verification code. Please check your current password.',
      });
    } finally {
      setSendingOtp(false);
    }
  };

  // Confirm Password Change with OTP
  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpSent) {
      await handleRequestPasswordOtp();
      return;
    }

    if (!verificationCode || verificationCode.trim().length < 6) {
      setPasswordMessage({ type: 'error', text: 'Please enter the 6-digit verification code sent to your email.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    const strength = validatePasswordStrengthClient(newPassword);
    if (!strength.valid) {
      setPasswordMessage({ type: 'error', text: strength.error || 'Password does not meet strength requirements.' });
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          challengeToken,
          code: verificationCode.trim(),
        }),
      });

      setPasswordMessage({
        type: 'success',
        text: res.message || 'Password successfully updated! Security alert sent to your email.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVerificationCode('');
      setOtpSent(false);
      setChallengeToken('');

      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordMessage(null);
      }, 2500);
    } catch (err: any) {
      setPasswordMessage({
        type: 'error',
        text: err.message || 'Failed to change password. Please check your verification code.',
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Hero Banner - Cleaned per user request (removed role badge & email subtext) */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-xs flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-purple-600 text-white font-bold text-xl flex items-center justify-center shrink-0 shadow-md shadow-purple-900/40">
            {user.fullName?.charAt(0) || user.email?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white truncate leading-tight">
              {user.fullName}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openLogoutConfirm}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded-xl transition-all cursor-pointer min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Profile Details (Full Name & Phone) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-purple-600" />
              <span>Personal Profile</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your display name and official phone number
            </p>
          </div>
        </div>

        {profileMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
              profileMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {profileMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{profileMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 ... / Phone"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer min-h-[38px]"
            >
              {profileSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Email Address Row - With Action Button */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-purple-600">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">Email Address</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Verified
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate mt-0.5 font-mono">
                {user.email}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Used for authentication and institutional security notifications
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setNewEmail('');
                setEmailVerificationCode('');
                setEmailOtpSent(false);
                setEmailChallengeToken('');
                setEmailMessage(null);
                setIsEmailModalOpen(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all cursor-pointer min-h-[38px] shadow-2xs"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Change Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* Password Row - With Action Button */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-purple-600">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">Account Password</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  <Shield className="w-3 h-3 text-purple-600" />
                  2FA Protected
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-700 mt-0.5 tracking-widest font-mono">
                ••••••••••••••••
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Requires email OTP confirmation before updating password
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setVerificationCode('');
                setOtpSent(false);
                setChallengeToken('');
                setPasswordMessage(null);
                setIsPasswordModalOpen(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all cursor-pointer min-h-[38px] shadow-2xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        </div>
      </div>

      {/* Change Email Modal Dialog - Single-use Email OTP Protected */}
      {isEmailModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsEmailModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                  <Mail className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Change Account Email</h3>
                  <p className="text-[11px] text-slate-500">Requires email verification code (OTP)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailMessage && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  emailMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {emailMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{emailMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleConfirmEmailChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  New Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  />
                </div>
              </div>

              {/* Step 1: Request Code Button */}
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {emailOtpSent ? 'Verification Code Dispatched' : 'Step 1: Request Email Code'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Code will be sent to {newEmail || 'your new email address'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRequestEmailOtp}
                  disabled={sendingEmailOtp || emailResendCooldown > 0 || !newEmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {sendingEmailOtp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : emailResendCooldown > 0 ? (
                    <>
                      <Timer className="w-3.5 h-3.5" />
                      <span>Resend in {emailResendCooldown}s</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{emailOtpSent ? 'Resend Code' : 'Send Code'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Step 2: Verification Code Input (Shown after OTP requested) */}
              {emailOtpSent && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-amber-900">
                    Enter 6-Digit Email Verification Code *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={emailVerificationCode}
                      onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full pl-9 pr-3.5 py-2 text-base font-mono tracking-widest bg-white border border-amber-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Check your inbox at <strong>{newEmail}</strong> for the 6-digit code. Valid for 10 minutes.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Notice: Changing your email will immediately dispatch confirmation security notices to both your current address ({user.email}) and your new address.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSaving || sendingEmailOtp}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer min-h-[38px]"
                >
                  {emailSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : !emailOtpSent ? (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Send Code & Update Email</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Verify Code & Update Email</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal Dialog (Email OTP Protected) */}
      {isPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setIsPasswordModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-3xl shadow-2xl shadow-slate-950/20 border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800 my-auto relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-purple-500 via-violet-400 to-indigo-400" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                  <Lock className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Change account password</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Verify your identity with a one-time email code</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordMessage && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  passwordMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {passwordMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleConfirmPasswordChange} className="space-y-4">
              {/* Step 1: Current Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Current Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* OTP Dispatch Trigger */}
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {otpSent ? 'Verification Code Sent' : 'Step 1: Request Email Code'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Code will be sent to {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRequestPasswordOtp}
                  disabled={sendingOtp || resendCooldown > 0 || !currentPassword}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {sendingOtp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : resendCooldown > 0 ? (
                    <>
                      <Timer className="w-3.5 h-3.5" />
                      <span>Resend in {resendCooldown}s</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{otpSent ? 'Resend Code' : 'Send Code'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Step 2: Verification Code Input */}
              {otpSent && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-amber-900">
                    Enter 6-Digit Email Verification Code *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full pl-9 pr-3.5 py-2 text-base font-mono tracking-widest bg-white border border-amber-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Check your inbox ({user.email}). Code is valid for 10 minutes.
                  </p>
                </div>
              )}

              {/* Step 3: New Password and Confirmation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    New Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showNewPass ? 'Hide password' : 'Show password'}
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              {newPassword.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <span className={`flex items-center gap-1.5 ${passLengthOk ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passLengthOk ? 'text-emerald-600' : 'text-slate-300'}`} />
                      8+ characters
                    </span>
                    <span className={`flex items-center gap-1.5 ${passUpperOk ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passUpperOk ? 'text-emerald-600' : 'text-slate-300'}`} />
                      Uppercase letter
                    </span>
                    <span className={`flex items-center gap-1.5 ${passLowerOk ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passLowerOk ? 'text-emerald-600' : 'text-slate-300'}`} />
                      Lowercase letter
                    </span>
                    <span className={`flex items-center gap-1.5 ${passNumberOk ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passNumberOk ? 'text-emerald-600' : 'text-slate-300'}`} />
                      Number (0-9)
                    </span>
                    <span className={`flex items-center gap-1.5 ${passSpecialOk ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passSpecialOk ? 'text-emerald-600' : 'text-slate-300'}`} />
                      Special char
                    </span>
                    <span className={`flex items-center gap-1.5 ${passMatches ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <Check className={`w-3.5 h-3.5 ${passMatches ? 'text-emerald-600' : 'text-slate-300'}`} />
                      Passwords match
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[38px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving || sendingOtp}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer min-h-[38px]"
                >
                  {passwordSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying & Updating...</span>
                    </>
                  ) : !otpSent ? (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Send Code & Change Password</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Password Change</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
