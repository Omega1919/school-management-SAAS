import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

let cachedTransporter: Transporter | null = null;
let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

export function getAppUrl(): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  if (process.env.RESEND_API_KEY) {
    return 'School Management System <onboarding@resend.dev>';
  }
  return '"School Management System" <security@school.edu>';
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_PORT));
}

export function validateEmailEnvironment(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();

  if (isProd && !hasResend && (!host || !port)) {
    throw new Error('FATAL: RESEND_API_KEY or SMTP_HOST/SMTP_PORT is required in production for real email security delivery.');
  }
}

export function createMailTransporter(): Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST?.trim() || (process.env.RESEND_API_KEY ? 'smtp.resend.com' : undefined);
  const port = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
  const user = process.env.SMTP_USER?.trim() || (process.env.RESEND_API_KEY ? 'resend' : undefined);
  const pass = process.env.SMTP_PASS || process.env.RESEND_API_KEY?.trim();
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (host) {
    const config: SmtpConfig = {
      host,
      port,
      secure,
    };
    if (user && pass) {
      config.auth = { user, pass };
    }
    cachedTransporter = nodemailer.createTransport(config as any);
  } else {
    // Development / test fallback transporter: captures messages safely without remote SMTP
    cachedTransporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }

  return cachedTransporter;
}

/**
 * Sends a generic transactional email with safe error handling via Resend API or SMTP fallback.
 * Never logs credentials, tokens, or codes in error messages.
 */
export async function sendEmail({ to, subject, text, html }: EmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const from = getEmailFrom();
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
        }),
      });

      const data: any = await res.json().catch(() => ({}));

      if (res.ok && data?.id) {
        return { success: true, messageId: data.id };
      }

      // If Resend returns an error (such as 403 validation_error due to sandbox restrictions where testing emails
      // are limited to the account owner's email address):
      if (data?.error) {
        // In development or testing, fall back to safe stream transport so authentication & password reset flows complete seamlessly
        if (process.env.NODE_ENV !== 'production') {
          const fallbackTransporter = nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
            buffer: true,
          });
          const info = await fallbackTransporter.sendMail({ from, to, subject, text, html });
          return { success: true, messageId: info.messageId };
        }
        throw new Error(data.error.message || 'Resend API delivery failed.');
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'production') {
        const fallbackTransporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'unix',
          buffer: true,
        });
        const info = await fallbackTransporter.sendMail({ from, to, subject, text, html });
        return { success: true, messageId: info.messageId };
      }
      throw err;
    }
  }

  // SMTP or fallback stream transporter
  try {
    const transporter = createMailTransporter();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const fallbackTransporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'unix',
          buffer: true,
        });
        const info = await fallbackTransporter.sendMail({ from, to, subject, text, html });
        return { success: true, messageId: info.messageId };
      } catch (fallbackErr) {
        // safe fallback
      }
    }

    const safeError = (error?.message || 'Email delivery failed')
      .replace(/:\/\/[^@\s]+@/gi, '://***:***@')
      .replace(/(pass|password|pwd|api_key|re_[a-zA-Z0-9_]+)=[^;&\s]+/gi, '$1=***');
    throw new Error(`Failed to dispatch security email: ${safeError}`);
  }
}

/**
 * 1. Login Two-Factor Verification Code Email
 */
export async function sendLoginVerificationEmail(params: {
  to: string;
  name?: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<{ success: boolean }> {
  const { to, name = 'User', code, expiresInMinutes = 10 } = params;
  const subject = `Your Security Verification Code: ${code}`;

  const text = `Hello ${name},

Your single-use login verification code is: ${code}

This code will expire in ${expiresInMinutes} minutes. If you did not attempt to sign in to your School Management account, please contact school administration immediately and secure your credentials.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">School Management Portal</h1>
      <p style="color: #e0e7ff; margin: 8px 0 0; font-size: 14px;">Two-Factor Authentication Code</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
        Please enter the single-use verification code below to confirm your sign-in request:
      </p>
      <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.35em; color: #4f46e5;">${escapeHtml(code)}</span>
      </div>
      <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">
        ⏱️ This code is valid for <strong>${expiresInMinutes} minutes</strong> and can only be used once.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px; margin-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5;">
          <strong>Security Notice:</strong> If you did not attempt to sign in, someone may know your password. Please contact your school administrator immediately.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      Institutional Security & Identity Protection Service
    </div>
  </div>
</body>
</html>`;

  await sendEmail({ to, subject, text, html });
  return { success: true };
}

/**
 * 2. New Successful Login Security Alert Email
 */
export async function sendNewLoginAlertEmail(params: {
  to: string;
  name?: string;
  ipAddress?: string;
  userAgent?: string;
  loginTime?: string;
}): Promise<{ success: boolean }> {
  const { to, name = 'User', ipAddress = 'Unknown IP', userAgent = 'Unknown device', loginTime = new Date().toUTCString() } = params;
  const subject = 'Security Notice: New Login to Your School Account';

  const text = `Hello ${name},

A new login was verified for your School Management account.

Login Details:
- Time: ${loginTime}
- IP Address: ${ipAddress}
- Device: ${userAgent}

If this was you, you can safely ignore this notice. If you did not authorize this login, please reset your password immediately and notify the school administrator.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert: New Sign-in</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Account Security Alert</h1>
      <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">New Successful Sign-In Detected</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
        Your School Management account was just accessed with successful two-factor verification.
      </p>
      <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 10px; overflow: hidden; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 10px 14px; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 35%;">Date & Time</td>
          <td style="padding: 10px 14px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${escapeHtml(loginTime)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">IP Address</td>
          <td style="padding: 10px 14px; color: #0f172a; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${escapeHtml(ipAddress)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; color: #64748b;">Device / Agent</td>
          <td style="padding: 10px 14px; color: #0f172a; word-break: break-all;">${escapeHtml(userAgent)}</td>
        </tr>
      </table>
      <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
        If this was you, no further action is required. If you did not log in, please reset your password immediately.
      </p>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
      Automated Security Notification
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err) {
    // Non-blocking alert failure log
    console.warn('Could not dispatch new login security email:', err);
    return { success: false };
  }
}

/**
 * 3. Password Reset Link Email
 */
export async function sendPasswordResetEmail(params: {
  to?: string;
  recipientEmail?: string;
  name?: string;
  recipientName?: string;
  resetToken?: string;
  resetUrl?: string;
  expiresInMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const to = params.to || params.recipientEmail || '';
  const name = params.name || params.recipientName || 'User';
  const expiresInMinutes = params.expiresInMinutes || 60;
  const resetUrl = params.resetUrl || `${getAppUrl()}/reset-password?token=${params.resetToken || ''}`;
  const subject = 'Password Reset Request for Your School Account';

  const text = `Hello ${name},

We received a request to reset the password for your School Management account.

To choose a new password, visit the link below:
${resetUrl}

This link is single-use and will expire in ${expiresInMinutes} minutes. If you did not request a password reset, you can safely ignore this email; your existing password will remain unchanged.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Password Reset Request</h1>
      <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">Institutional Account Recovery</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
        We received a request to reset your password. Click the button below to choose a new, secure password:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(resetUrl)}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);">Reset My Password</a>
      </div>
      <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">
        This reset link will expire in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
      </p>
      <p style="margin: 0; font-size: 12px; color: #94a3b8; word-break: break-all;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <span style="color: #2563eb;">${escapeHtml(resetUrl)}</span>
      </p>
      <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
          If you did not request this reset, your account is still secure. No changes have been made.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      Institutional Security & Identity Protection Service
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Email delivery failed' };
  }
}

/**
 * 4. Password Changed Security Alert Email
 */
export async function sendPasswordChangedAlertEmail(params: {
  to?: string;
  recipientEmail?: string;
  name?: string;
  recipientName?: string;
  ipAddress?: string;
  userAgent?: string;
  changeTime?: string;
}): Promise<{ success: boolean; error?: string }> {
  const to = params.to || params.recipientEmail || '';
  const name = params.name || params.recipientName || 'User';
  const ipAddress = params.ipAddress || 'Unknown IP';
  const changeTime = params.changeTime || new Date().toUTCString();
  const subject = 'Security Notice: Your Password Has Been Changed';

  const text = `Hello ${name},

The password for your School Management account was successfully changed on ${changeTime} (IP: ${ipAddress}).

All existing active sessions have been invalidated as a security precaution.

If you made this change, you can safely disregard this email. If you did NOT change your password, someone may have compromised your account. Please contact school administration immediately.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Changed Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #059669; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Password Changed</h1>
      <p style="color: #a7f3d0; margin: 6px 0 0; font-size: 13px;">Security Confirmation</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">
        The password for your School Management account was changed successfully on <strong>${escapeHtml(changeTime)}</strong>.
      </p>
      <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.5;">
        All existing active sessions and tokens have been invalidated for security. You must sign in with your new password.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px;">
        <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5;">
          <strong>Crucial Notice:</strong> If you did not perform this password change, your account has been compromised. Contact institution administration immediately.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
      Automated Security Notification
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err: any) {
    console.warn('Could not dispatch password changed security email:', err);
    return { success: false, error: err?.message || 'Email delivery failed' };
  }
}

/**
 * 5. Password Change Request OTP Verification Email
 */
export async function sendPasswordChangeOtpEmail(params: {
  to: string;
  name?: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name = 'User', code, expiresInMinutes = 10 } = params;
  const subject = `Your Password Change Verification Code: ${code}`;

  const text = `Hello ${name},

You requested to change the password for your School Management account.

Your single-use password change verification code is: ${code}

This code will expire in ${expiresInMinutes} minutes. If you did not request to change your password, please secure your account credentials and contact the school administrator immediately.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Change Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Password Change Verification</h1>
      <p style="color: #ede9fe; margin: 8px 0 0; font-size: 14px;">Institutional Account Security</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
        A request was made to update your account password. Enter the single-use verification code below to authorize this change:
      </p>
      <div style="background-color: #f5f3ff; border: 2px dashed #c4b5fd; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.35em; color: #6d28d9;">${escapeHtml(code)}</span>
      </div>
      <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">
        ⏱️ This verification code is valid for <strong>${expiresInMinutes} minutes</strong> and can only be used once.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px; margin-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5;">
          <strong>Security Notice:</strong> If you did not request this password change, someone may be attempting to access your account. Please notify your institution administrator immediately.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      Institutional Security & Identity Protection Service
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err: any) {
    console.warn('Could not dispatch password change OTP email:', err);
    return { success: false, error: err?.message || 'Email delivery failed' };
  }
}

/**
 * 6. Email Address Changed Security Confirmation Email
 */
export async function sendEmailChangedAlertEmail(params: {
  to: string;
  name?: string;
  oldEmail: string;
  newEmail: string;
  ipAddress?: string;
  changeTime?: string;
}): Promise<{ success: boolean; error?: string }> {
  const {
    to,
    name = 'User',
    oldEmail,
    newEmail,
    ipAddress = 'Unknown IP',
    changeTime = new Date().toUTCString(),
  } = params;
  const subject = 'Security Alert: Your Account Email Address Was Updated';

  const text = `Hello ${name},

This notice confirms that the email address for your School Management account was successfully changed.

Change Details:
- Previous Email: ${oldEmail}
- New Email: ${newEmail}
- Date & Time: ${changeTime}
- IP Address: ${ipAddress}

If you made this change, you can safely disregard this message. If you did not authorize this change, please contact your school administrator immediately to secure your account.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Account Email Updated</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Account Email Changed</h1>
      <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Security Confirmation Notice</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
        The email address associated with your School Management account was successfully updated.
      </p>
      <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 10px; overflow: hidden; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 10px 14px; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 35%;">Previous Email</td>
          <td style="padding: 10px 14px; color: #475569; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${escapeHtml(oldEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">New Email</td>
          <td style="padding: 10px 14px; color: #0f172a; font-family: monospace; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${escapeHtml(newEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Date & Time</td>
          <td style="padding: 10px 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(changeTime)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; color: #64748b;">IP Address</td>
          <td style="padding: 10px 14px; color: #0f172a; font-family: monospace;">${escapeHtml(ipAddress)}</td>
        </tr>
      </table>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px;">
        <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5;">
          <strong>Security Warning:</strong> If you did not authorize this email update, someone may have compromised your account. Please alert your institution administrator immediately.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
      Automated Security Notification
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err: any) {
    console.warn('Could not dispatch email changed alert email:', err);
    return { success: false, error: err?.message || 'Email delivery failed' };
  }
}

/**
 * 7. Email Address Change Request OTP Verification Email
 */
export async function sendEmailChangeOtpEmail(params: {
  to: string;
  name?: string;
  newEmail: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name = 'User', newEmail, code, expiresInMinutes = 10 } = params;
  const subject = `Your Email Change Verification Code: ${code}`;

  const text = `Hello ${name},

You requested to change the email address for your School Management account to: ${newEmail}.

Your single-use verification code is: ${code}

This code will expire in ${expiresInMinutes} minutes. If you did not request to update your email address, please ignore this email or notify your school administrator immediately.

Best regards,
School Management Security Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email Change Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Email Change Verification</h1>
      <p style="color: #e0f2fe; margin: 8px 0 0; font-size: 14px;">Institutional Account Security</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
        A request was made to update your School Management account email to <strong>${escapeHtml(newEmail)}</strong>. Enter the single-use verification code below to authorize this change:
      </p>
      <div style="background-color: #f0f9ff; border: 2px dashed #7dd3fc; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.35em; color: #0284c7;">${escapeHtml(code)}</span>
      </div>
      <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">
        ⏱️ This verification code is valid for <strong>${expiresInMinutes} minutes</strong> and can only be used once.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px; margin-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5;">
          <strong>Security Notice:</strong> If you did not request this email change, please notify your institution administrator immediately.
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      Institutional Security & Identity Protection Service
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to, subject, text, html });
    return { success: true };
  } catch (err: any) {
    console.warn('Could not dispatch email change OTP email:', err);
    return { success: false, error: err?.message || 'Email delivery failed' };
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
