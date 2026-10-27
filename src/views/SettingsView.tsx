import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Globe2,
  Layers3,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  School,
  Settings2,
  UserRound,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { AccountManagementSection } from '../components/AccountManagementSection.tsx';
import type { SchoolSettings } from '../types.ts';

type SettingsForm = {
  schoolName: string;
  motto: string;
  email: string;
  phone: string;
  address: string;
  currencySymbol: string;
  timezone: string;
  attendanceCutoffTime: string;
  termSystem: string;
  levelSystem: string;
};

const createFormData = (settings: SchoolSettings): SettingsForm => ({
  schoolName: settings.schoolName || '',
  motto: settings.motto || '',
  email: settings.contactEmail || '',
  phone: settings.contactPhone || '',
  address: settings.address || '',
  currencySymbol: settings.currencySymbol || '₦',
  timezone: settings.timezone || 'Africa/Lagos',
  attendanceCutoffTime: settings.attendanceCutoffTime || '08:30',
  termSystem: settings.termSystem || 'term',
  levelSystem: settings.levelSystem || 'class',
});

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-purple-400 focus:ring-4 focus:ring-purple-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-700';
const currencyOptions = [
  { symbol: '₦', name: 'Nigerian naira' },
  { symbol: 'GH₵', name: 'Ghanaian cedi' },
  { symbol: 'KSh', name: 'Kenyan shilling' },
  { symbol: 'R', name: 'South African rand' },
  { symbol: '$', name: 'US dollar' },
  { symbol: '£', name: 'British pound' },
  { symbol: '€', name: 'Euro' },
  { symbol: '₹', name: 'Indian rupee' },
  { symbol: '¥', name: 'Japanese yen / Chinese yuan' },
  { symbol: 'CFA', name: 'CFA franc' },
];

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const {
    settings,
    schoolName,
    currencySymbol,
    updateSettings,
    loading: settingsLoading,
  } = useSettings();

  const isSuperAdmin = user?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState<'account' | 'school'>('account');
  const [formData, setFormData] = useState<SettingsForm>(() => createFormData(settings));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedFormData = createFormData(settings);
  const hasChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData);

  useEffect(() => {
    setFormData(createFormData(settings));
  }, [settings]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(false), 3500);
    return () => window.clearTimeout(timer);
  }, [success]);

  const setField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
    setSuccess(false);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateSettings({
        schoolName: formData.schoolName.trim(),
        motto: formData.motto.trim(),
        contactEmail: formData.email.trim(),
        contactPhone: formData.phone.trim(),
        address: formData.address.trim(),
        currencySymbol: formData.currencySymbol.trim(),
        timezone: formData.timezone,
        attendanceCutoffTime: formData.attendanceCutoffTime,
        termSystem: formData.termSystem,
        levelSystem: formData.levelSystem,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Could not save school settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="relative isolate overflow-hidden rounded-[28px] border border-violet-100 bg-gradient-to-br from-white via-white to-violet-50 px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800 shadow-sm">
              <Settings2 className="h-3.5 w-3.5" /> Workspace settings
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {isSuperAdmin ? 'Settings & account' : 'My account & settings'}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {isSuperAdmin
                ? 'Manage your account and the school details families and staff see across the platform.'
                : 'Keep your profile information and account security up to date.'}
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex w-fit items-center gap-3 rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><School className="h-5 w-5" /></span>
              <span><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</span><span className="mt-0.5 block text-sm font-semibold text-slate-800">School administrator</span></span>
            </div>
          )}
        </div>
      </header>

      {isSuperAdmin && (
        <div role="tablist" aria-label="Settings sections" className="grid grid-cols-1 gap-3 rounded-[24px] border border-slate-200/80 bg-slate-100/70 p-2 sm:grid-cols-2">
          <button
            id="settings-account-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'account'}
            aria-controls="settings-account-panel"
            onClick={() => setActiveTab('account')}
            className={`group flex min-h-[76px] items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 ${activeTab === 'account' ? 'border-white bg-white text-slate-900 shadow-sm' : 'border-transparent text-slate-600 hover:border-white/80 hover:bg-white/60'}`}
          >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${activeTab === 'account' ? 'bg-violet-100 text-violet-700' : 'bg-white text-slate-500 group-hover:text-violet-700'}`}><UserRound className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold">My account</span><span className="mt-1 block text-xs font-normal text-slate-500">Profile, email and password security</span></span>
          </button>
          <button
            id="settings-school-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'school'}
            aria-controls="settings-school-panel"
            onClick={() => setActiveTab('school')}
            className={`group flex min-h-[76px] items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 ${activeTab === 'school' ? 'border-white bg-white text-slate-900 shadow-sm' : 'border-transparent text-slate-600 hover:border-white/80 hover:bg-white/60'}`}
          >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${activeTab === 'school' ? 'bg-violet-100 text-violet-700' : 'bg-white text-slate-500 group-hover:text-violet-700'}`}><School className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold">School settings</span><span className="mt-1 block text-xs font-normal text-slate-500">School identity and academic preferences</span></span>
          </button>
        </div>
      )}

      {(!isSuperAdmin || activeTab === 'account') && (
        <section id="settings-account-panel" role={isSuperAdmin ? 'tabpanel' : undefined} aria-labelledby={isSuperAdmin ? 'settings-account-tab' : undefined}>
          <AccountManagementSection />
        </section>
      )}

      {isSuperAdmin && activeTab === 'school' && (
        <section id="settings-school-panel" role="tabpanel" aria-labelledby="settings-school-tab" className="space-y-6">
          <div className="relative isolate overflow-hidden rounded-[26px] border border-violet-100 bg-gradient-to-br from-violet-100 via-white to-white p-5 shadow-sm sm:p-7">
            <div aria-hidden="true" className="absolute -right-10 -top-16 -z-10 h-56 w-56 rounded-full bg-violet-200/60 blur-3xl" />
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white bg-white text-violet-700 shadow-sm">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">School profile preview</p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formData.schoolName || schoolName}</h2>
                  <p className="mt-1 text-sm text-slate-600">{formData.motto || 'Add a motto to complete your school profile.'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full border border-violet-100 bg-white/90 px-3 py-1.5">{formData.currencySymbol || currencySymbol} Currency</span>
                <span className="rounded-full border border-violet-100 bg-white/90 px-3 py-1.5">{formData.timezone}</span>
              </div>
            </div>
          </div>

          {success && (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div><p className="font-semibold">School settings saved</p><p className="mt-0.5 text-emerald-700">Your changes are now in use across the school portals.</p></div>
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div><p className="font-semibold">Settings could not be saved</p><p className="mt-0.5 text-rose-700">{error}</p></div>
            </div>
          )}

          {settingsLoading ? (
            <div className="space-y-4" aria-label="Loading school settings" aria-busy="true">
              {[1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-3xl border border-slate-200 bg-white" />)}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700"><School className="h-5 w-5" /></div>
                  <div><h3 className="font-bold text-slate-900">School identity</h3><p className="mt-1 text-xs leading-5 text-slate-500">The public name and contact details shown to families and staff.</p></div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="school-name" className={labelClass}>School name <span className="text-rose-500">*</span></label>
                    <input id="school-name" required maxLength={120} value={formData.schoolName} onChange={(event) => setField('schoolName', event.target.value)} className={inputClass} placeholder="e.g. Springfield Academy" />
                  </div>
                  <div>
                    <label htmlFor="school-motto" className={labelClass}>Motto or tagline</label>
                    <input id="school-motto" maxLength={180} value={formData.motto} onChange={(event) => setField('motto', event.target.value)} className={inputClass} placeholder="A short phrase that represents your school" />
                  </div>
                  <div>
                    <label htmlFor="school-email" className={labelClass}>Contact email</label>
                    <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="school-email" type="email" maxLength={254} value={formData.email} onChange={(event) => setField('email', event.target.value)} className={`${inputClass} pl-10`} placeholder="office@school.edu" /></div>
                  </div>
                  <div>
                    <label htmlFor="school-phone" className={labelClass}>Phone number</label>
                    <div className="relative"><Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="school-phone" type="tel" maxLength={40} value={formData.phone} onChange={(event) => setField('phone', event.target.value)} className={`${inputClass} pl-10`} placeholder="+234 800 000 0000" /></div>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="school-address" className={labelClass}>School address</label>
                    <div className="relative"><MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="school-address" maxLength={240} value={formData.address} onChange={(event) => setField('address', event.target.value)} className={`${inputClass} pl-10`} placeholder="Street, city, and region" /></div>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><Globe2 className="h-5 w-5" /></div>
                  <div><h3 className="font-bold text-slate-900">Regional preferences</h3><p className="mt-1 text-xs leading-5 text-slate-500">Set the local time and currency used for dates and fee displays.</p></div>
                </div>
                <div className="grid gap-5 md:grid-cols-3">
                  <div>
                    <label htmlFor="school-currency" className={labelClass}>School currency</label>
                    <select id="school-currency" required value={formData.currencySymbol} onChange={(event) => setField('currencySymbol', event.target.value)} className={inputClass}>
                      {!currencyOptions.some((option) => option.symbol === formData.currencySymbol) && (
                        <option value={formData.currencySymbol}>{formData.currencySymbol} (current setting)</option>
                      )}
                      {currencyOptions.map((option) => (
                        <option key={option.symbol} value={option.symbol}>{option.symbol} — {option.name}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400">Used beside fee amounts.</p>
                  </div>
                  <div>
                    <label htmlFor="school-timezone" className={labelClass}>Timezone</label>
                    <select id="school-timezone" value={formData.timezone} onChange={(event) => setField('timezone', event.target.value)} className={inputClass}>
                      {!['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'UTC', 'Europe/London', 'America/New_York'].includes(formData.timezone) && <option value={formData.timezone}>{formData.timezone}</option>}
                      <option value="Africa/Lagos">Lagos (WAT, UTC+1)</option>
                      <option value="Africa/Accra">Accra (GMT)</option>
                      <option value="Africa/Nairobi">Nairobi (EAT, UTC+3)</option>
                      <option value="Africa/Johannesburg">Johannesburg (SAST, UTC+2)</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">London</option>
                      <option value="America/New_York">New York</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="attendance-cutoff" className={labelClass}>Attendance cutoff</label>
                    <div className="relative"><Clock3 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="attendance-cutoff" type="time" value={formData.attendanceCutoffTime} onChange={(event) => setField('attendanceCutoffTime', event.target.value)} className={`${inputClass} pl-10`} /></div>
                    <p className="mt-1.5 text-[11px] text-slate-400">Students arriving after this time may be marked late.</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Layers3 className="h-5 w-5" /></div>
                  <div><h3 className="font-bold text-slate-900">Academic structure</h3><p className="mt-1 text-xs leading-5 text-slate-500">Choose the terms and student levels used in school records and forms.</p></div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="term-system" className={labelClass}>Academic year divisions</label>
                    <select id="term-system" value={formData.termSystem} onChange={(event) => setField('termSystem', event.target.value)} className={inputClass}>
                      <option value="term">Terms</option>
                      <option value="semester">Semesters</option>
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400">For example, First Term or First Semester.</p>
                  </div>
                  <div>
                    <label htmlFor="level-system" className={labelClass}>Student level labels</label>
                    <select id="level-system" value={formData.levelSystem} onChange={(event) => setField('levelSystem', event.target.value)} className={inputClass}>
                      <option value="class">Class (JSS 1, Primary 5)</option>
                      <option value="level">Level (100 Level, 200 Level)</option>
                      <option value="grade">Grade (Grade 1, Grade 7)</option>
                      <option value="cohort">Cohort or stage (ND 1, HND 1)</option>
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400">Used for class names in the school and admission portals.</p>
                  </div>
                </div>
              </section>

              <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-slate-500">{hasChanges ? 'You have unsaved changes.' : 'Your school settings are up to date.'}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={!hasChanges || saving} onClick={() => { setFormData(savedFormData); setError(null); setSuccess(false); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                  <button type="submit" disabled={saving || !hasChanges} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">
                    {success && !saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving…' : success ? 'Saved' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      )}
    </main>
  );
};
