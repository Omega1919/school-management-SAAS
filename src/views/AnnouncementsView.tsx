import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Search,
  Pin,
  Calendar,
  AlertTriangle,
  User,
  Users,
  GraduationCap,
  BookOpen,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  targetAudience: 'all' | 'teachers' | 'parents' | 'students';
  priority?: 'normal' | 'urgent';
  isPinned?: boolean;
  authorName?: string;
  createdAt: string;
}

export const AnnouncementsView: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.permissions?.includes('announcements_management');

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAudience, setFilterAudience] = useState('all');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newNotice, setNewNotice] = useState({
    title: '',
    content: '',
    targetAudience: 'all',
    priority: 'normal',
    isPinned: false,
  });

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/announcements');
      const list = Array.isArray(res) ? res : [];
      const mapped: AnnouncementItem[] = list.map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        targetAudience: a.targetAudience || a.targetRole || 'all',
        priority: a.priority || 'normal',
        isPinned: Boolean(a.isPinned),
        authorName: a.authorName,
        createdAt: a.createdAt,
      }));
      setAnnouncements(mapped);
    } catch (err) {
      console.error('Error fetching announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: newNotice.title,
          content: newNotice.content,
          targetAudience: newNotice.targetAudience,
          priority: newNotice.priority,
          isPinned: newNotice.isPinned,
        }),
      });
      setShowCreateModal(false);
      setNewNotice({
        title: '',
        content: '',
        targetAudience: 'all',
        priority: 'normal',
        isPinned: false,
      });
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = announcements.filter(
    (a) => filterAudience === 'all' || a.targetAudience === filterAudience || a.targetAudience === 'all'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-purple-600" />
            <span>Notice & Announcement Board</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Broadcast official bulletins, circulars, and urgent school notices
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Publish Announcement</span>
          </button>
        )}
      </div>

      {/* Audience Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All Notices' },
          { id: 'teachers', label: 'Faculty Only' },
          { id: 'parents', label: 'Parents Only' },
          { id: 'students', label: 'Students Only' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterAudience(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filterAudience === tab.id
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Announcements Stream */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading notice board...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center text-slate-500">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-base font-semibold text-slate-700">No notices posted</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`p-5 sm:p-6 rounded-2xl border transition-all ${
                item.isPinned
                  ? 'bg-purple-50/40 border-purple-200 shadow-xs'
                  : 'bg-white border-slate-200/80 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.isPinned && (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center gap-1">
                      <Pin className="w-3 h-3" />
                      <span>PINNED</span>
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px] uppercase tracking-wider">
                    To: {item.targetAudience}
                  </span>
                  {item.priority === 'urgent' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>URGENT</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <h3 className="text-base font-bold text-slate-900 mt-2">{item.title}</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">
                {item.content}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Published by: {item.authorName || 'School Administration'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Publish Announcement"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Title *</label>
            <input
              type="text"
              required
              value={newNotice.title}
              onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
              placeholder="e.g. Mid-Term Break Schedule & PTA Meeting"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Audience
              </label>
              <select
                value={newNotice.targetAudience}
                onChange={(e) => setNewNotice({ ...newNotice, targetAudience: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Everyone (School-Wide)</option>
                <option value="teachers">Teaching Staff Only</option>
                <option value="parents">Parents / Guardians</option>
                <option value="students">Students Only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={newNotice.priority}
                onChange={(e) => setNewNotice({ ...newNotice, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Content *</label>
            <textarea
              required
              rows={5}
              value={newNotice.content}
              onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
              placeholder="Write the full body of the circular..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPinned"
              checked={newNotice.isPinned}
              onChange={(e) => setNewNotice({ ...newNotice, isPinned: e.target.checked })}
              className="w-4 h-4 text-purple-600 rounded-sm border-slate-300 focus:ring-purple-500"
            />
            <label htmlFor="isPinned" className="text-xs font-medium text-slate-700 cursor-pointer">
              Pin to the top of notice boards
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
