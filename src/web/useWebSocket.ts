import { useEffect, useRef, useCallback } from 'react';
import type { ConversationSummary, Message, SessionStatus } from './types';

type WsPayload =
  | { type: 'connected' }
  | { type: 'session_state'; status: SessionStatus }
  | { type: 'conversation_summaries'; conversations: ConversationSummary[] }
  | { type: 'conversation_message'; message: Message }
  | { type: 'subscribed'; conversationId: string }
  | { type: 'error'; error: string };

interface WsHandlers {
  onStatus?: (status: SessionStatus) => void;
  onConversations?: (conversations: ConversationSummary[]) => void;
  onMessage?: (message: Message) => void;
}

export function useWebSocket(handlers: WsHandlers) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConversationId = useRef<string>('');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.current = socket;

    socket.addEventListener('open', () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (activeConversationId.current) {
        socket.send(JSON.stringify({ type: 'subscribe', conversationId: activeConversationId.current }));
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as WsPayload;
        if (payload.type === 'session_state') handlersRef.current.onStatus?.(payload.status);
        if (payload.type === 'conversation_summaries') handlersRef.current.onConversations?.(payload.conversations);
        if (payload.type === 'conversation_message') handlersRef.current.onMessage?.(payload.message);
      } catch { /* ignore */ }
    });

    socket.addEventListener('close', () => {
      if (ws.current === socket) ws.current = null;
      reconnectTimer.current = setTimeout(connect, 2000);
    });

    socket.addEventListener('error', () => socket.close());
  }, []);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const subscribe = useCallback((conversationId: string) => {
    activeConversationId.current = conversationId;
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'subscribe', conversationId }));
    }
  }, []);

  const unsubscribe = useCallback(() => {
    activeConversationId.current = '';
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'unsubscribe' }));
    }
  }, []);

  return { subscribe, unsubscribe };
}
