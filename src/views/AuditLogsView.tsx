import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Clock,
  User,
  ShieldCheck,
  Activity,
  Calendar,
  Lock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { Badge } from '../components/Badge.tsx';

interface AuditLogItem {
  id: number;
  userId?: number;
  userEmail?: string;
  role?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadLogs(page);
  }, [page]);

  const loadLogs = async (currentPage = 1) => {
    try {
      setLoading(true);
      const res = await apiRequest<any>(`/audit-logs?page=${currentPage}&limit=30`);
      if (Array.isArray(res)) {
        setLogs(res);
        setTotalCount(res.length);
        setTotalPages(1);
      } else if (res && Array.isArray(res.data)) {
        setLogs(res.data);
        setTotalCount(res.pagination?.total || res.data.length);
        setTotalPages(res.pagination?.totalPages || 1);
      } else {
        setLogs([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const safeLogs = Array.isArray(logs) ? logs : [];
  const filtered = safeLogs.filter((l) => {
    if (!l) return false;
    const q = searchQuery.toLowerCase();
    return (
      (l.action && l.action.toLowerCase().includes(q)) ||
      (l.userEmail && l.userEmail.toLowerCase().includes(q)) ||
      (l.resource && l.resource.toLowerCase().includes(q)) ||
      (l.ipAddress && l.ipAddress.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-purple-600" />
            <span>System Security & Audit Trail</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable forensic log of all administrative actions, grading events, and financial adjustments ({totalCount} total events recorded)
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLogs(page)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          <span>Refresh Audit Logs</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, user email, resource, or IP address..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Retrieving audit records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold text-slate-700">No audit logs matching query</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          <span>{log.action}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {log.userEmail || 'System Process'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                          {log.role || 'system'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {log.resource} {log.resourceId ? `#${log.resourceId}` : ''}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 text-xs text-slate-600">
                <span>
                  Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
