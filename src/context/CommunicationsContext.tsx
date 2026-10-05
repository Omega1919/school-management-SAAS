import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { apiRequest, API_BASE, getStoredToken } from '../lib/api.ts';

export interface MessageNotification {
  id: number | string;
  threadId: number | string;
  senderId: number;
  senderName: string;
  senderRole: string;
  teacherName?: string;
  content: string;
  createdAt: string;
}

interface CommunicationsContextType {
  unreadCount: number;
  activeNotification: MessageNotification | null;
  dismissNotification: () => void;
  refreshUnread: () => Promise<void>;
  lastEventTimestamp: number;
  targetThreadId: number | null;
  setTargetThreadId: (id: number | null) => void;
  broadcastLocalMessage: (payload: any) => void;
}

const CommunicationsContext = createContext<CommunicationsContextType | undefined>(undefined);

export const CommunicationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeNotification, setActiveNotification] = useState<MessageNotification | null>(null);
  const [lastEventTimestamp, setLastEventTimestamp] = useState<number>(Date.now());
  const [targetThreadId, setTargetThreadId] = useState<number | null>(null);

  const lastSeenMsgIdRef = useRef<any>(null);
  const prevUnreadCountRef = useRef<number>(0);
  const hasInitializedRef = useRef<boolean>(false);
  const dismissTimerRef = useRef<any>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const showNotification = useCallback((notif: MessageNotification) => {
    setActiveNotification(notif);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    // Auto-dismiss toast banner after 7 seconds
    dismissTimerRef.current = setTimeout(() => {
      setActiveNotification(null);
    }, 7000);
  }, []);

  const dismissNotification = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    setActiveNotification(null);
  }, []);

  // Fetch unread count & latest summary from PostgreSQL (called on boot and SSE reconnect)
  const checkLatestSummary = useCallback(async () => {
    if (!user) return;
    try {
      const summary = await apiRequest<{
        unreadCount: number;
        latestMessage: {
          id: number;
          conversationId: number;
          senderId: number;
          senderName: string;
          senderRole: string;
          isFromTeacher: boolean;
          teacherName?: string;
          content: string;
          createdAt: string;
          isRead: boolean;
        } | null;
      }>('/communications/latest-summary');

      if (summary) {
        const count = summary.unreadCount || 0;
        setUnreadCount(count);

        if (hasInitializedRef.current && count !== prevUnreadCountRef.current) {
          setLastEventTimestamp(Date.now());
        }
        prevUnreadCountRef.current = count;

        if (summary.latestMessage) {
          const msg = summary.latestMessage;
          if (
            hasInitializedRef.current &&
            lastSeenMsgIdRef.current !== null &&
            String(msg.id) !== String(lastSeenMsgIdRef.current) &&
            msg.senderId !== user.id
          ) {
            const resolvedTeacherName =
              msg.teacherName || (msg.senderRole === 'teacher' ? msg.senderName : undefined);

            showNotification({
              id: msg.id,
              threadId: msg.conversationId,
              senderId: msg.senderId,
              senderName: msg.senderName,
              senderRole: msg.senderRole,
              teacherName: resolvedTeacherName,
              content: msg.content,
              createdAt: msg.createdAt,
            });

            // Dispatch event for open view components
            window.dispatchEvent(
              new CustomEvent('sms_message_received', {
                detail: {
                  threadId: msg.conversationId,
                  message: msg,
                  senderName: msg.senderName,
                  senderRole: msg.senderRole,
                  teacherName: resolvedTeacherName,
                },
              })
            );

            setLastEventTimestamp(Date.now());
          }

          if (lastSeenMsgIdRef.current === null) {
            lastSeenMsgIdRef.current = msg.id;
          }
        }
        hasInitializedRef.current = true;
      }
    } catch {
      // Non-blocking on network hiccups
    }
  }, [user, showNotification]);

  const refreshUnread = useCallback(async () => {
    await checkLatestSummary();
  }, [checkLatestSummary]);

  // Method to broadcast local outbound message to other open tabs / windows in same browser
  const broadcastLocalMessage = useCallback(
    (payload: any) => {
      try {
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage(payload);
        }
      } catch {}
      setLastEventTimestamp(Date.now());
      refreshUnread();
    },
    [refreshUnread]
  );

  // Setup Authenticated Real-time SSE Stream + BroadcastChannel (Zero Polling)
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setActiveNotification(null);
      hasInitializedRef.current = false;
      lastSeenMsgIdRef.current = null;
      return;
    }

    // Initial load from PostgreSQL
    checkLatestSummary();

    let isMounted = true;
    let eventSource: EventSource | null = null;

    // 1. Cross-tab BroadcastChannel for instant same-browser multi-tab sync
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('sms_communications_channel');
        broadcastChannelRef.current = bc;
        bc.onmessage = (event) => {
          if (!isMounted) return;
          const data = event.data;
          if (data && data.type === 'new_message' && data.message) {
            const m = data.message;
            if (m.senderId !== user.id) {
              const teacherName =
                data.teacherName || (data.senderRole === 'teacher' ? data.senderName : undefined);
              showNotification({
                id: m.id,
                threadId: data.threadId || m.conversationId,
                senderId: m.senderId,
                senderName: data.senderName || m.senderName,
                senderRole: data.senderRole || m.senderRole,
                teacherName,
                content: m.content,
                createdAt: m.createdAt,
              });
            }

            window.dispatchEvent(new CustomEvent('sms_message_received', { detail: data }));
            setLastEventTimestamp(Date.now());
            checkLatestSummary();
          } else if (data && data.type === 'messages_read') {
            window.dispatchEvent(new CustomEvent('sms_messages_read', { detail: data }));
            setLastEventTimestamp(Date.now());
          }
        };
      } catch {}
    }

    // 2. Authenticated Server-Sent Events (SSE) stream (Primary Realtime Transport via Dedicated Stream Token)
    let reconnectTimeout: any = null;

    const connectSSE = async () => {
      if (!isMounted || !user) return;

      try {
        // Request dedicated short-lived (60s) stream token using standard Bearer authorization
        const tokenRes = await apiRequest<{ streamToken: string }>('/communications/stream-token');
        if (!tokenRes || !tokenRes.streamToken || !isMounted) return;

        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        const streamUrl = `${API_BASE}/communications/stream?streamToken=${encodeURIComponent(tokenRes.streamToken)}`;
        const es = new EventSource(streamUrl);
        eventSource = es;

        es.onopen = () => {
          if (!isMounted) return;
          // Reconnect recovery: perform single sync check when SSE opens or reconnects
          checkLatestSummary();
        };

        es.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const event = JSON.parse(e.data);
            if (event.type === 'new_message' && event.message) {
              const m = event.message;
              if (m.senderId !== user.id) {
                const teacherName =
                  event.teacherName || (event.senderRole === 'teacher' ? event.senderName : undefined);
                showNotification({
                  id: m.id,
                  threadId: event.threadId || m.conversationId,
                  senderId: m.senderId,
                  senderName: event.senderName || m.senderName,
                  senderRole: event.senderRole || m.senderRole,
                  teacherName,
                  content: m.content,
                  createdAt: m.createdAt,
                });
              }

              // Dispatch for active view
              window.dispatchEvent(new CustomEvent('sms_message_received', { detail: event }));
              setLastEventTimestamp(Date.now());
              checkLatestSummary();
            } else if (event.type === 'messages_read') {
              window.dispatchEvent(new CustomEvent('sms_messages_read', { detail: event }));
              setLastEventTimestamp(Date.now());
              checkLatestSummary();
            }
          } catch {}
        };

        es.onerror = () => {
          if (!isMounted) return;
          // When EventSource fails, close and schedule fresh stream-token reconnection with backoff
          if (es.readyState === EventSource.CLOSED) {
            es.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              if (isMounted) connectSSE();
            }, 3000);
          }
        };
      } catch {
        if (isMounted) {
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            if (isMounted) connectSSE();
          }, 4000);
        }
      }
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [user, checkLatestSummary, showNotification]);

  return (
    <CommunicationsContext.Provider
      value={{
        unreadCount,
        activeNotification,
        dismissNotification,
        refreshUnread,
        lastEventTimestamp,
        targetThreadId,
        setTargetThreadId,
        broadcastLocalMessage,
      }}
    >
      {children}
    </CommunicationsContext.Provider>
  );
};

export const useCommunications = (): CommunicationsContextType => {
  const context = useContext(CommunicationsContext);
  if (!context) {
    throw new Error('useCommunications must be used within a CommunicationsProvider');
  }
  return context;
};
