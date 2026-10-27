import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Download,
  Receipt,
  ArrowUpRight,
  TrendingDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useSettings } from '../context/SettingsContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Badge } from '../components/Badge.tsx';
import { Modal } from '../components/Modal.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useProfileModal } from '../context/ProfileModalContext.tsx';

interface FeeRecord {
  id: number;
  studentId: number;
  studentName: string;
  studentCode: string;
  className: string;
  feeCategory: string;
  amount: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  dueDate: string;
}

export const FeesView: React.FC = () => {
  const { user } = useAuth();
  const { currencySymbol } = useSettings();
  const { openStudentProfile } = useProfileModal();
  const isSuperAdmin = user?.role === 'super_admin' || user?.permissions?.includes('fee_management');

  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Record Payment Modal
  const [selectedFee, setSelectedFee] = useState<FeeRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);

  useEffect(() => {
    loadFees();
  }, []);

  const loadFees = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/fees');
      const list = Array.isArray(res) ? res : [];
      const mapped: FeeRecord[] = list.map((f: any) => ({
        id: f.id,
        studentId: f.studentId,
        studentName: f.studentName,
        studentCode: f.studentCode,
        className: f.className || 'General',
        feeCategory: f.feeCategory,
        amount: Number(f.amount || 0),
        amountPaid: Number(f.amountPaid || 0),
        balance: Number(f.outstandingBalance !== undefined ? f.outstandingBalance : (f.balance || 0)),
        paymentStatus: f.paymentStatus,
        dueDate: f.dueDate,
      }));
      setFees(mapped);
    } catch (err) {
      console.error('Error fetching fees:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee) return;
    setSubmittingPayment(true);

    try {
      const res: any = await apiRequest('/fees/pay', {
        method: 'POST',
        body: JSON.stringify({
          feeId: selectedFee.id,
          amount: parseFloat(paymentAmount),
          paymentMethod,
        }),
      });

      setReceiptData({
        studentName: selectedFee.studentName,
        studentCode: selectedFee.studentCode,
        category: selectedFee.feeCategory,
        paid: parseFloat(res?.newPayment?.amount || paymentAmount),
        method: res?.newPayment?.paymentMethod || paymentMethod,
        date: res?.newPayment?.paymentDate || new Date().toLocaleDateString(),
        ref: res?.newPayment?.receiptNumber || `REC-${Date.now().toString().slice(-6)}`,
      });

      setSelectedFee(null);
      setPaymentAmount('');
      await loadFees();
    } catch (err: any) {
      alert(err.message || 'Payment processing failed');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const totalInvoiced = fees.reduce((acc, f) => acc + Number(f.amount || 0), 0);
  const totalCollected = fees.reduce((acc, f) => acc + Number(f.amountPaid || 0), 0);
  const totalOutstanding = fees.reduce((acc, f) => acc + Number(f.balance || 0), 0);

  const filtered = fees.filter((f) => {
    const matchesQuery =
      f.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.studentCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.feeCategory?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || f.paymentStatus === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-purple-600" />
            <span>Fees & Billing Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor tuition collections, fee ledgers, receipts, and outstanding arrears
          </p>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Invoiced"
          value={`${currencySymbol}${totalInvoiced.toLocaleString()}`}
          icon={CreditCard}
          color="indigo"
          subtitle="Cumulative fees assessed"
        />
        <StatCard
          title="Total Collected"
          value={`${currencySymbol}${totalCollected.toLocaleString()}`}
          icon={Receipt}
          color="emerald"
          subtitle="Payments recorded by authorized staff"
        />
        <StatCard
          title="Outstanding Arrears"
          value={`${currencySymbol}${totalOutstanding.toLocaleString()}`}
          icon={TrendingDown}
          color="amber"
          subtitle="Pending student balances"
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, ID or fee category..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All Payment Statuses</option>
          <option value="paid">Fully Paid</option>
          <option value="partial">Partially Paid</option>
          <option value="unpaid">Unpaid / Due</option>
        </select>
      </div>

      {/* Fees Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading billing ledger...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold text-slate-700">No invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Fee Category</th>
                  <th className="py-3 px-4 text-right">Total Due</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {isSuperAdmin && <th className="py-3 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div
                        onClick={() => openStudentProfile(f.studentId)}
                        className="cursor-pointer group"
                      >
                        <p className="font-semibold text-slate-900 group-hover:text-purple-600 transition-colors">
                          {f.studentName}
                        </p>
                        <p className="text-[11px] font-mono text-purple-600 font-semibold">
                          {f.studentCode}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{f.className}</td>
                    <td className="py-3 px-4 font-medium text-slate-800 text-xs">{f.feeCategory}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">
                      {currencySymbol}{Number(f.amount).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-semibold">
                      {currencySymbol}{Number(f.amountPaid).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      {currencySymbol}{Number(f.balance).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        status={
                          f.paymentStatus === 'paid'
                            ? 'success'
                            : f.paymentStatus === 'partial'
                            ? 'warning'
                            : 'danger'
                        }
                        label={f.paymentStatus.toUpperCase()}
                      />
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-4 text-right">
                        {f.balance > 0 ? (
                          <button
                            onClick={() => {
                              setSelectedFee(f);
                              setPaymentAmount(String(f.balance));
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Record Pay
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Cleared</span>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={selectedFee !== null}
        onClose={() => setSelectedFee(null)}
        title="Record Payment for Student"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Student:</span>
              <span className="font-bold text-slate-800">{selectedFee?.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="font-semibold text-slate-800">{selectedFee?.feeCategory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Remaining Balance:</span>
              <span className="font-bold text-rose-600">
                {currencySymbol}{selectedFee ? Number(selectedFee.balance).toLocaleString() : 0}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Amount ({currencySymbol}) *
            </label>
            <input
              type="number"
              required
              max={selectedFee?.balance}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            >
              <option value="Bank Transfer">Bank Transfer / Electronic</option>
              <option value="POS / Card">POS Terminal / Debit Card</option>
              <option value="Cash">Cash at Bursary</option>
              <option value="Cheque">Bank Draft / Cheque</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedFee(null)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingPayment}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 cursor-pointer"
            >
              {submittingPayment ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        isOpen={receiptData !== null}
        onClose={() => setReceiptData(null)}
        title="Payment Receipt"
      >
        <div className="p-4 border border-dashed border-slate-300 rounded-2xl bg-slate-50 space-y-3 font-mono text-xs">
          <div className="text-center pb-2 border-b border-slate-200">
            <h4 className="font-bold text-sm text-slate-900">OFFICIAL BURSARY RECEIPT</h4>
            <p className="text-slate-500 text-[11px]">{receiptData?.ref}</p>
          </div>
          <div className="space-y-1 text-slate-700">
            <div className="flex justify-between">
              <span>Date:</span>
              <span className="font-semibold">{receiptData?.date}</span>
            </div>
            <div className="flex justify-between">
              <span>Student:</span>
              <span className="font-semibold">{receiptData?.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span>Student Code:</span>
              <span className="font-semibold">{receiptData?.studentCode}</span>
            </div>
            <div className="flex justify-between">
              <span>Category:</span>
              <span className="font-semibold">{receiptData?.category}</span>
            </div>
            <div className="flex justify-between">
              <span>Method:</span>
              <span className="font-semibold">{receiptData?.method}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm text-purple-700">
              <span>Amount Paid:</span>
              <span>
                {currencySymbol}{receiptData?.paid?.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="text-center pt-2 text-[10px] text-slate-400">
            Thank you for your prompt settlement. Keep for records.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
          <button
            onClick={() => setReceiptData(null)}
            className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-xl text-xs hover:bg-purple-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
};
