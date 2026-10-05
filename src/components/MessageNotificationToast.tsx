import React from 'react';
import { MessageSquare, X, ArrowRight, GraduationCap, Bell } from 'lucide-react';
import { useCommunications } from '../context/CommunicationsContext.tsx';

interface MessageNotificationToastProps {
  onNavigateToMessages: (threadId?: number | string) => void;
}

export const MessageNotificationToast: React.FC<MessageNotificationToastProps> = ({
  onNavigateToMessages,
}) => {
  const { activeNotification, dismissNotification } = useCommunications();

  if (!activeNotification) return null;

  const isTeacher =
    activeNotification.senderRole === 'teacher' || !!activeNotification.teacherName;
  const displayName = activeNotification.teacherName || activeNotification.senderName;
  const displayRole = isTeacher ? 'Teacher / Faculty' : activeNotification.senderRole;

  const handleOpen = () => {
    const parsedId =
      typeof activeNotification.threadId === 'string' && !isNaN(Number(activeNotification.threadId))
        ? Number(activeNotification.threadId)
        : activeNotification.threadId;
    onNavigateToMessages(parsedId as any);
    dismissNotification();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white border border-purple-500/40 rounded-2xl p-4 shadow-2xl shadow-purple-950/40 relative overflow-hidden ring-1 ring-white/10">
        {/* Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-purple-500 via-pink-500 to-indigo-500 animate-pulse" />

        <div className="flex items-start gap-3">
          {/* Avatar Icon */}
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/30 text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
            {isTeacher ? (
              <GraduationCap className="w-5 h-5 text-purple-300" />
            ) : (
              <MessageSquare className="w-5 h-5 text-purple-300" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <h4 className="text-xs font-bold text-white truncate">
                  {isTeacher ? `Message from ${displayName}` : `New Message from ${displayName}`}
                </h4>
              </div>
              <button
                type="button"
                onClick={dismissNotification}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-purple-300 font-medium capitalize mt-0.5">
              {displayRole}
            </p>

            <p className="text-xs text-slate-300 line-clamp-2 mt-1.5 leading-relaxed bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
              "{activeNotification.content}"
            </p>

            <div className="mt-3 flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono">
                {new Date(activeNotification.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>

              <button
                type="button"
                onClick={handleOpen}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer group"
              >
                <span>Open Chat</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
