import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  User,
  Search,
  Clock,
  Check,
  CheckCheck,
  Plus,
  Users,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useCommunications } from '../context/CommunicationsContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Modal } from '../components/Modal.tsx';

interface ThreadItem {
  id: number;
  otherPartyName: string;
  otherPartyRole: string;
  otherPartyId: number;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface MessageItem {
  id: number | string;
  senderId: number;
  senderName: string;
  senderRole: string;
  receiverId: number;
  content: string;
  createdAt: string;
  readAt?: string;
}

export const CommunicationsView: React.FC = () => {
  const { user } = useAuth();
  const {
    lastEventTimestamp,
    refreshUnread,
    targetThreadId,
    setTargetThreadId,
    broadcastLocalMessage,
  } = useCommunications();

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Start new conversation modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientsData, setRecipientsData] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('academic');
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [startingConv, setStartingConv] = useState(false);
  const [newConvError, setNewConvError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeThreadRef = useRef<ThreadItem | null>(null);
  activeThreadRef.current = activeThread;

  // Initial load when user auth is ready
  useEffect(() => {
    if (user) {
      loadThreads(true);
    }
  }, [user]);

  // When targetThreadId is specified (from notification toast click)
  useEffect(() => {
    if (targetThreadId && threads.length > 0) {
      const found = threads.find((t) => t.id === targetThreadId);
      if (found) {
        setActiveThread(found);
        setTargetThreadId(null);
      }
    }
  }, [targetThreadId, threads, setTargetThreadId]);

  // Load messages when activeThread changes
  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }

    // Load initial server messages from PostgreSQL
    loadMessages(activeThread.id, true);
  }, [activeThread?.id]);

  // Direct instant message event receiver from SSE or BroadcastChannel
  useEffect(() => {
    const handleIncomingMessage = (e: any) => {
      const detail = e.detail;
      if (!detail) return;

      const incomingThreadId = detail.threadId || detail.conversationId;
      const raw = detail.message;
      if (!raw) return;

      // 1. If currently viewing this active thread, append or reconcile
      if (activeThreadRef.current && activeThreadRef.current.id === incomingThreadId) {
        setMessages((prev) => {
          // If message with exact server ID already exists, do not duplicate
          if (prev.some((m) => String(m.id) === String(raw.id))) return prev;

          // If current user sent message and has a temporary optimistic bubble, reconcile it
          const pendingTempIdx = prev.findIndex(
            (m) =>
              typeof m.id === 'string' &&
              m.id.startsWith('client_temp_') &&
              m.content === raw.content
          );

          if (pendingTempIdx !== -1) {
            const updated = [...prev];
            updated[pendingTempIdx] = {
              ...updated[pendingTempIdx],
              id: raw.id,
              createdAt: raw.createdAt
                ? new Date(raw.createdAt).toISOString()
                : updated[pendingTempIdx].createdAt,
            };
            return updated;
          }

          // Otherwise, append the incoming message
          const incomingMsg: MessageItem = {
            id: raw.id || Date.now(),
            senderId: raw.senderId || raw.senderUserId,
            senderName: detail.senderName || raw.senderName || 'Contact',
            senderRole: detail.senderRole || raw.senderRole || 'user',
            receiverId: raw.receiverId || 0,
            content: raw.content,
            createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
            readAt: raw.readAt,
          };
          return [...prev, incomingMsg];
        });

        // If message is from the other party and thread is active, mark read immediately
        if (raw.senderId !== user?.id) {
          apiRequest(`/communications/threads/${incomingThreadId}/read`, { method: 'POST' }).catch(
            () => {}
          );
        }
      }

      // 2. Immediately update conversation preview in left column & move to top
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === incomingThreadId);
        if (idx !== -1) {
          const thread = prev[idx];
          const isUnread =
            activeThreadRef.current?.id !== incomingThreadId && raw.senderId !== user?.id;
          const updatedThread: ThreadItem = {
            ...thread,
            lastMessage: raw.content,
            lastMessageTime: raw.createdAt
              ? new Date(raw.createdAt).toISOString()
              : new Date().toISOString(),
            unreadCount: isUnread
              ? (thread.unreadCount || 0) + 1
              : activeThreadRef.current?.id === incomingThreadId
              ? 0
              : thread.unreadCount,
          };
          return [updatedThread, ...prev.filter((_, i) => i !== idx)];
        } else {
          // New conversation thread not yet in list - refresh list
          loadThreads(false);
          return prev;
        }
      });
    };

    const handleReadReceipt = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      const targetId = detail.threadId || detail.conversationId;
      if (activeThreadRef.current && activeThreadRef.current.id === targetId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === user?.id && !m.readAt
              ? { ...m, readAt: detail.readAt || new Date().toISOString() }
              : m
          )
        );
      }
    };

    window.addEventListener('sms_message_received', handleIncomingMessage);
    window.addEventListener('sms_messages_read', handleReadReceipt);
    return () => {
      window.removeEventListener('sms_message_received', handleIncomingMessage);
      window.removeEventListener('sms_messages_read', handleReadReceipt);
    };
  }, [user?.id]);

  // Smooth scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const loadThreads = async (showLoading = false) => {
    if (!user) return [];
    try {
      if (showLoading) setLoading(true);
      const res = await apiRequest<ThreadItem[]>('/communications/threads');
      const list = Array.isArray(res) ? res : [];
      setThreads(list);

      // If active thread exists, keep it in sync with updated preview
      if (activeThreadRef.current) {
        const updated = list.find((t) => t.id === activeThreadRef.current?.id);
        if (updated) {
          if (
            updated.lastMessage !== activeThreadRef.current.lastMessage ||
            updated.lastMessageTime !== activeThreadRef.current.lastMessageTime ||
            updated.unreadCount !== activeThreadRef.current.unreadCount
          ) {
            setActiveThread(updated);
          }
        }
      } else if (list.length > 0) {
        setActiveThread(list[0]);
      }
      return list;
    } catch (err) {
      console.warn('Notice: Communication threads sync standby:', err);
      return [];
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadMessages = async (threadId: number, isInitial = false) => {
    if (!user || !threadId) return;
    try {
      const res = await apiRequest<MessageItem[]>(`/communications/threads/${threadId}/messages`);
      if (Array.isArray(res)) {
        setMessages((prev) => {
          if (isInitial) return res;
          // Synchronize if server has new messages or modifications (including readAt changes)
          const hasChanges =
            prev.length !== res.length ||
            prev.some(
              (m, idx) =>
                m.id !== res[idx]?.id ||
                m.content !== res[idx]?.content ||
                m.readAt !== res[idx]?.readAt
            );
          return hasChanges ? res : prev;
        });

        // Also trigger explicit read endpoint to ensure read receipt is registered
        apiRequest(`/communications/threads/${threadId}/read`, { method: 'POST' }).catch(() => {});

        // Reset local unread badge on this thread
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
        );

        if (isInitial) {
          refreshUnread();
        }
      }
    } catch (err) {
      console.warn('Notice: Messages sync standby:', err);
    }
  };

  const formatMessageTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return timeStr;
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeThread || sending) return;
    setSending(true);

    const text = inputText.trim();
    setInputText('');

    const tempId = `client_temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMsg: MessageItem = {
      id: tempId,
      senderId: user?.id || 0,
      senderName: user?.fullName || 'Me',
      senderRole: user?.role || 'user',
      receiverId: activeThread.otherPartyId || 0,
      content: text,
      createdAt: new Date().toISOString(),
      readAt: undefined,
    };

    // 1. Optimistically append immediately so user sees message with 0 delay (single checkmark)
    setMessages((prev) => [...prev, optimisticMsg]);

    // 2. Immediately update the conversation preview on left and move to top
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === activeThread.id);
      if (idx !== -1) {
        const updatedThread = {
          ...prev[idx],
          lastMessage: text,
          lastMessageTime: optimisticMsg.createdAt,
        };
        return [updatedThread, ...prev.filter((_, i) => i !== idx)];
      }
      return prev;
    });

    try {
      // 3. Persist to PostgreSQL backend
      const res = await apiRequest<any>(
        `/communications/threads/${activeThread.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: text }),
        }
      );

      const msgData = res?.message || res;
      const realId = res?.id || msgData?.id;

      // 4. Reconcile optimistic message with persisted PostgreSQL database ID
      if (realId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: realId,
                  createdAt: msgData?.createdAt
                    ? new Date(msgData.createdAt).toISOString()
                    : m.createdAt,
                }
              : m
          )
        );
      }

      // Broadcast to other open tabs in same browser for instant local sync
      broadcastLocalMessage({
        type: 'new_message',
        threadId: activeThread.id,
        conversationId: activeThread.id,
        message: {
          ...optimisticMsg,
          id: realId || optimisticMsg.id,
        },
        senderName: user?.fullName || 'Me',
        senderRole: user?.role || 'user',
      });

      refreshUnread();
    } catch (err) {
      console.error('Failed to send message:', err);
      // On failure, remove the optimistic message and restore input
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  // Open New Conversation Modal
  const handleOpenNewModal = async () => {
    setShowNewModal(true);
    setNewConvError(null);
    setNewSubject('');
    setNewFirstMessage('');
    setSelectedStudentId('');
    setSelectedRecipientId('');

    try {
      setLoadingRecipients(true);
      const data = await apiRequest<any>('/communications/recipients');
      setRecipientsData(data);

      if (user?.role === 'parent' && data?.children?.length > 0) {
        setSelectedStudentId(String(data.children[0].studentId));
        if (data.children[0].teachers?.length > 0) {
          setSelectedRecipientId(String(data.children[0].teachers[0].teacherUserId));
        }
      } else if (user?.role === 'teacher' && data?.students?.length > 0) {
        setSelectedStudentId(String(data.students[0].studentId));
        if (data.students[0].parents?.length > 0) {
          setSelectedRecipientId(String(data.students[0].parents[0].parentUserId));
        }
      }
    } catch (err: any) {
      setNewConvError('Failed to load eligible messaging recipients.');
    } finally {
      setLoadingRecipients(false);
    }
  };

  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedRecipientId || !newSubject.trim() || !newFirstMessage.trim()) {
      setNewConvError('Please fill out all required fields.');
      return;
    }

    try {
      setStartingConv(true);
      setNewConvError(null);
      const res = await apiRequest<any>('/communications/conversations', {
        method: 'POST',
        body: JSON.stringify({
          studentId: parseInt(selectedStudentId, 10),
          recipientUserId: parseInt(selectedRecipientId, 10),
          subject: newSubject.trim(),
          category: newCategory,
          message: newFirstMessage.trim(),
        }),
      });

      setShowNewModal(false);
      const list = await loadThreads(true);
      refreshUnread();

      if (res?.conversation?.id) {
        const found = list.find((t) => t.id === res.conversation.id);
        if (found) {
          setActiveThread(found);
        }
      }
    } catch (err: any) {
      setNewConvError(err?.message || 'Failed to start conversation');
    } finally {
      setStartingConv(false);
    }
  };

  const filteredThreads = threads.filter((t) =>
    t.otherPartyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-purple-600" />
            <span>Parent - Teacher Communications</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Instant real-time messaging between faculty members and parents
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 h-[650px]">
        {/* Left: Threads List */}
        <div className="border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
          <div className="p-3.5 border-b border-slate-200 bg-white flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              type="button"
              onClick={() => loadThreads(true)}
              className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
              title="Refresh threads"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading messages...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <p>No active conversations yet</p>
                <button
                  type="button"
                  onClick={handleOpenNewModal}
                  className="text-purple-600 font-semibold hover:underline"
                >
                  Start a new conversation
                </button>
              </div>
            ) : (
              filteredThreads.map((t) => {
                const isActive = activeThread?.id === t.id;
                const hasUnread = (t.unreadCount || 0) > 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveThread(t);
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 cursor-pointer relative ${
                      isActive ? 'bg-purple-50/80 border-l-4 border-purple-600' : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {t.otherPartyName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {t.otherPartyName}
                        </h4>
                        {t.lastMessageTime && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatMessageTime(t.lastMessageTime)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] text-purple-600 font-medium capitalize truncate">
                          {t.otherPartyRole}
                        </p>
                        {hasUnread && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-600 text-white animate-pulse shrink-0">
                            {t.unreadCount} NEW
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {t.lastMessage || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Messages Stream */}
        <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col h-full bg-white">
          {activeThread ? (
            <>
              {/* Active Header */}
              <div className="p-3.5 px-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                    {activeThread.otherPartyName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        {activeThread.otherPartyName}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                        {activeThread.otherPartyRole}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 capitalize flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Live sync active</span>
                      <span>•</span>
                      <span>Thread #{activeThread.id}</span>
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70">
                  <span className="text-slate-400">Current Session:</span>
                  <span className="font-semibold text-slate-800">{user?.fullName}</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    {user?.role}
                  </span>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-50/40">
                {messages.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-xs">
                    Start conversation with {activeThread.otherPartyName}
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.senderId === user?.id;
                    const isRead = !!m.readAt;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs ${
                            isMine
                              ? 'bg-purple-600 text-white rounded-br-xs'
                              : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                          }`}
                        >
                          <p>{m.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 px-1 font-mono">
                          <span>{formatMessageTime(m.createdAt)}</span>
                          {isMine && (
                            isRead ? (
                              <span className="inline-flex items-center gap-0.5 text-purple-600 font-semibold" title="Read by recipient">
                                <CheckCheck className="w-3.5 h-3.5 text-purple-600" />
                                <span className="text-[9px]">Read</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-slate-400" title="Delivered to server">
                                <Check className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[9px]">Sent</span>
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Write a message to ${activeThread.otherPartyName}...`}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No conversation selected</p>
              <p className="text-xs text-slate-400 mt-0.5">Select a thread from the left or start a new conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Start New Parent-Teacher Conversation"
      >
        <form onSubmit={handleStartConversation} className="space-y-4">
          {newConvError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {newConvError}
            </div>
          )}

          {loadingRecipients ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading eligible participants...</div>
          ) : (
            <>
              {user?.role === 'parent' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Your Child
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value);
                        const child = recipientsData?.children?.find(
                          (c: any) => String(c.studentId) === e.target.value
                        );
                        if (child?.teachers?.length > 0) {
                          setSelectedRecipientId(String(child.teachers[0].teacherUserId));
                        } else {
                          setSelectedRecipientId('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      {recipientsData?.children?.map((c: any) => (
                        <option key={c.studentId} value={c.studentId}>
                          {c.studentName} ({c.className} • {c.studentCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Teacher
                    </label>
                    <select
                      value={selectedRecipientId}
                      onChange={(e) => setSelectedRecipientId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      <option value="">-- Choose Teacher --</option>
                      {recipientsData?.children
                        ?.find((c: any) => String(c.studentId) === selectedStudentId)
                        ?.teachers?.map((t: any) => (
                          <option key={t.teacherUserId} value={t.teacherUserId}>
                            {t.teacherName} ({t.role})
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              ) : user?.role === 'teacher' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Student
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value);
                        const st = recipientsData?.students?.find(
                          (s: any) => String(s.studentId) === e.target.value
                        );
                        if (st?.parents?.length > 0) {
                          setSelectedRecipientId(String(st.parents[0].parentUserId));
                        } else {
                          setSelectedRecipientId('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      {recipientsData?.students?.map((s: any) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.studentName} ({s.className} • {s.studentCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Parent / Guardian
                    </label>
                    <select
                      value={selectedRecipientId}
                      onChange={(e) => setSelectedRecipientId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      <option value="">-- Choose Parent --</option>
                      {recipientsData?.students
                        ?.find((s: any) => String(s.studentId) === selectedStudentId)
                        ?.parents?.map((p: any) => (
                          <option key={p.parentUserId} value={p.parentUserId}>
                            {p.parentName} ({p.relationship})
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              ) : null}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Topic / Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mid-term Academic Performance, Attendance Inquiry"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                >
                  <option value="academic">Academic Progress</option>
                  <option value="attendance">Attendance & Punctuality</option>
                  <option value="behavioral">Conduct & Behavioral</option>
                  <option value="general">General Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Message
                </label>
                <textarea
                  rows={4}
                  placeholder="Type your message..."
                  value={newFirstMessage}
                  onChange={(e) => setNewFirstMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingConv}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
                >
                  {startingConv ? 'Starting...' : 'Send Initial Message'}
                </button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
};
