import { useEffect, useRef, useCallback } from 'react';
import type {
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from '@/types';

type WsPayload =
  | { type: 'connected' }
  | { type: 'connection_status'; status: string }
  | ({ type: 'session_state' } & WsSessionStatusPayload)
  | ({ type: 'conversation_summaries' } & WsConversationSummariesPayload)
  | ({ type: 'conversation_message' } & WsConversationMessagePayload)
  | { type: 'subscribed'; accountId?: string; conversationId: string }
  | { type: 'error'; error?: string; code?: string; message?: string }
  | { type: 'ws_sync_status'; accountId: string; status: string; requ18Received?: number; requ18Inserted?: number; historySynced?: number; historyMsgs?: number; error?: string };

interface WsHandlers {
  onStatus?: (payload: WsSessionStatusPayload) => void;
  onConversations?: (payload: WsConversationSummariesPayload) => void;
  onMessage?: (payload: WsConversationMessagePayload) => void;
  onSyncStatus?: (payload: { accountId: string; status: string; requ18Received?: number; historySynced?: number; historyMsgs?: number; error?: string }) => void;
}

export function useWebSocket(handlers: WsHandlers) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const activeConversationId = useRef<string>('');
  const activeAccountId = useRef<string>('');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const getReconnectDelay = useCallback(() => {
    const delays = [1000, 2000, 4000, 8000, 16000, 30000];
    return delays[Math.min(reconnectAttempts.current, delays.length - 1)];
  }, []);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/bff/ws`);
    ws.current = socket;

    socket.addEventListener('open', () => {
      reconnectAttempts.current = 0;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (activeConversationId.current && activeAccountId.current) {
        socket.send(JSON.stringify({ type: 'subscribe', accountId: activeAccountId.current, conversationId: activeConversationId.current }));
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as WsPayload;
        if (payload.type === 'session_state') handlersRef.current.onStatus?.({ accountId: payload.accountId, status: payload.status });
        if (payload.type === 'conversation_summaries') handlersRef.current.onConversations?.({ accountId: payload.accountId, conversations: payload.conversations });
        if (payload.type === 'conversation_message') handlersRef.current.onMessage?.({ accountId: payload.accountId, message: payload.message });
        if (payload.type === 'ws_sync_status') handlersRef.current.onSyncStatus?.(payload);
      } catch { /* ignore */ }
    });

    socket.addEventListener('close', () => {
      if (ws.current === socket) ws.current = null;
      reconnectAttempts.current += 1;
      reconnectTimer.current = setTimeout(connect, getReconnectDelay());
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }, [getReconnectDelay]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const subscribe = useCallback((accountId: string, conversationId: string) => {
    activeAccountId.current = accountId;
    activeConversationId.current = conversationId;
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'subscribe', accountId, conversationId }));
    }
  }, []);

  const unsubscribe = useCallback(() => {
    activeAccountId.current = '';
    activeConversationId.current = '';
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'unsubscribe' }));
    }
  }, []);

  return { subscribe, unsubscribe };
}
