import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, KeyRound } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';

interface ResetPasswordViewProps {
  onBackToLogin: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ onBackToLogin }) => {
  const [token, setToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    // Extract token from either window.location.search (?token=...) or window.location.hash (#/reset-password?token=...)
    try {
      const searchParams = new URLSearchParams(window.location.search);
      let extractedToken = searchParams.get('token');

      if (!extractedToken && window.location.hash.includes('?')) {
        const hashQuery = window.location.hash.substring(window.location.hash.indexOf('?'));
        const hashParams = new URLSearchParams(hashQuery);
        extractedToken = hashParams.get('token');
      }

      if (extractedToken) {
        setToken(extractedToken.trim());
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Password requirements calculation
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const strengthScore = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanToken = token.trim();
    if (!cleanToken) {
      setError('Please provide the security reset token from your email.');
      return;
    }

    if (!hasMinLength) {
      setError('Password must be at least 8 characters in length.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords entered do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          resetToken: cleanToken,
          newPassword,
        }),
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired password reset link. Please request a new recovery link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-reset min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="auth-reset-card w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/15 border border-purple-400/25 flex items-center justify-center text-purple-300 mb-4 shadow-inner shadow-purple-950/50">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Set New Password</h1>
          <p className="text-xs sm:text-sm text-slate-300/75 mt-2 max-w-xs leading-relaxed">
            Create a cryptographically secure, resilient password to protect your school account.
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* Success View */}
        {success ? (
          <div className="text-center py-4 space-y-5 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Password Successfully Updated</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Your credentials have been securely refreshed, outstanding sessions revoked, and a security alert has been dispatched to your email.
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Sign in with New Password
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Reset Token */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Security Reset Token
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste reset token from email"
                  required
                  className="w-full pl-3 pr-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-200 text-xs sm:text-sm placeholder-slate-500 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Embedded securely from your HTTPS email link or pasted manually.
              </p>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                New Secure Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-200 text-xs sm:text-sm placeholder-slate-500 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-200 text-xs sm:text-sm placeholder-slate-500 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Password Strength:</span>
                  <span
                    className={`font-semibold ${
                      strengthScore <= 2
                        ? 'text-rose-400'
                        : strengthScore <= 4
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {strengthScore <= 2 ? 'Weak' : strengthScore <= 4 ? 'Good' : 'Strong'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 h-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-full rounded-full transition-all ${
                        level <= strengthScore
                          ? strengthScore <= 2
                            ? 'bg-rose-500'
                            : strengthScore <= 4
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400 pt-1">
                  <span className={hasMinLength ? 'text-emerald-400' : 'text-slate-500'}>
                    ✓ 8+ characters
                  </span>
                  <span className={hasUppercase && hasLowercase ? 'text-emerald-400' : 'text-slate-500'}>
                    ✓ Upper & lower case
                  </span>
                  <span className={hasNumber ? 'text-emerald-400' : 'text-slate-500'}>✓ Number</span>
                  <span className={hasSpecial ? 'text-emerald-400' : 'text-slate-500'}>
                    ✓ Special symbol
                  </span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !token || !hasMinLength || newPassword !== confirmPassword}
              className="w-full mt-2 py-3 px-4 rounded-xl font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Validating & Updating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Set New Password</span>
                </>
              )}
            </button>

            {/* Back to Login */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Portal Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
