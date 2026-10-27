import React from 'react';
import { LogOut, X } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      aria-labelledby="logout-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xs sm:max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="p-1 -mr-1 -mt-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shadow-2xs">
          <LogOut className="w-5 h-5 ml-0.5" />
        </div>

        <div className="space-y-1">
          <h3 id="logout-modal-title" className="text-base font-bold text-slate-900">
            Sign Out
          </h3>
          <p className="text-xs text-slate-500">
            Are you sure you want to log out?
          </p>
        </div>

        <div className="flex items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[38px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-all shadow-sm shadow-rose-600/20 cursor-pointer min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

