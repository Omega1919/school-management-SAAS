import React, { useState, useEffect } from 'react';
import {
  Settings,
  School,
  Clock,
  DollarSign,
  Globe,
  Save,
  CheckCircle,
  AlertCircle,
  Calendar,
  Layers,
  Shield,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext.tsx';
import { apiRequest } from '../lib/api.ts';

export const SettingsView: React.FC = () => {
  const {
    settings,
    schoolName,
    motto,
    currencySymbol,
    refreshSettings,
  } = useSettings();

  const [formData, setFormData] = useState({
    schoolName: schoolName || 'Springfield International Academy',
    motto: motto || 'Excellence, Character & Integrity',
    email: (settings as any)?.email || 'contact@springfield.edu.ng',
    phone: (settings as any)?.phone || '+234 1 234 5678',
    address: (settings as any)?.address || '12 Academy Boulevard, Victoria Island, Lagos',
    currencySymbol: currencySymbol || '₦',
    timezone: (settings as any)?.timezone || 'Africa/Lagos',
    attendanceCutoffTime: (settings as any)?.attendanceCutoffTime || '08:30',
    termSystem: (settings as any)?.termSystem || 'term',
    levelSystem: (settings as any)?.levelSystem || 'class',
  });

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({
      schoolName: schoolName || 'Springfield International Academy',
      motto: motto || 'Excellence, Character & Integrity',
      email: (settings as any)?.contactEmail || (settings as any)?.email || 'contact@springfield.edu.ng',
      phone: (settings as any)?.contactPhone || (settings as any)?.phone || '+234 1 234 5678',
      address: (settings as any)?.address || '12 Academy Boulevard, Victoria Island, Lagos',
      currencySymbol: currencySymbol || '₦',
      timezone: (settings as any)?.timezone || 'Africa/Lagos',
      attendanceCutoffTime: (settings as any)?.attendanceCutoffTime || '08:30',
      termSystem: (settings as any)?.termSystem || 'term',
      levelSystem: (settings as any)?.levelSystem || 'class',
    });
  }, [settings, schoolName, motto, currencySymbol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiRequest('/settings', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      await refreshSettings();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-600" />
          <span>School Configuration & Global Settings</span>
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage institution details, operational timezone, currency symbols, and attendance policies
        </p>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Configuration saved successfully and applied across all client portals!</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Identity */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <School className="w-4 h-4 text-purple-600" />
            <span>Institution Branding</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official School Name *
              </label>
              <input
                type="text"
                required
                value={formData.schoolName}
                onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                School Motto / Tagline
              </label>
              <input
                type="text"
                value={formData.motto}
                onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Campus Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Operational & Regional Policies */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-600" />
            <span>Regional & Financial Settings</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                value={formData.currencySymbol}
                onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                <option value="UTC">UTC (Universal)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/New_York">America/New_York (EST)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Morning Roll Call Cutoff
              </label>
              <input
                type="time"
                value={formData.attendanceCutoffTime}
                onChange={(e) =>
                  setFormData({ ...formData, attendanceCutoffTime: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Institution-Agnostic Academic Nomenclature */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Academic Structure & Nomenclature</span>
          </h2>
          <p className="text-xs text-slate-500">
            Configure how academic calendar divisions and student level tiers are labelled across all portals and registration forms.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Academic Session Division *
              </label>
              <select
                value={formData.termSystem}
                onChange={(e) => setFormData({ ...formData, termSystem: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="term">Term System (First Term, Second Term, Third Term)</option>
                <option value="semester">Semester System (First Semester, Second Semester)</option>
              </select>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Primary and secondary schools typically use Terms; polytechnics and universities use Semesters.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Class / Student Tier Nomenclature *
              </label>
              <select
                value={formData.levelSystem}
                onChange={(e) => setFormData({ ...formData, levelSystem: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="class">Class (e.g. JSS 1, JSS 2, SS 1, Primary 5)</option>
                <option value="level">Level (e.g. 100 Level, 200 Level, 300 Level)</option>
                <option value="grade">Grade (e.g. Grade 1, Grade 7, Grade 10)</option>
                <option value="cohort">Cohort / Stage (e.g. ND 1, ND 2, HND 1)</option>
              </select>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Controls the naming conventions displayed on the public registration portal.
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save School Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
