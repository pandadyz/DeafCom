"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  event: string;
  payload?: any;
  error?: string;
}

export function useWebSocket(token: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const isManualClose = useRef(false);

  const buildWsUrl = useCallback(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/ws/chat?token=${encodeURIComponent(token ?? '')}`;
  }, [token]);

  const connect = useCallback(() => {
    if (!token) {
      setIsConnected(false);
      return;
    }

    if (
      ws.current &&
      (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    isManualClose.current = false;

    // WebSocket connection enabled

    const wsUrl = buildWsUrl();
    console.log('Attempting WebSocket connection to:', wsUrl);
    
    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected successfully');
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);

        if (isManualClose.current) {
          return;
        }
        
        // Don't reconnect if it's an authentication error
        if (event.code === 1003 || event.code === 1008) {
          console.log('Authentication error, not reconnecting');
          return;
        }
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.current.onerror = (error) => {
        const state = ws.current?.readyState;
        if (
          isManualClose.current ||
          state === WebSocket.CONNECTING ||
          state === WebSocket.CLOSING ||
          state === WebSocket.CLOSED
        ) {
          return;
        }
        // Browsers often emit a generic Event here; useful diagnostics are state/url.
        console.error('WebSocket error:', error);
        console.error('WebSocket state:', state);
        console.error('WebSocket URL:', wsUrl);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [buildWsUrl, token]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (ws.current) {
      isManualClose.current = true;
      if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
        ws.current.close(1000, 'Client disconnect');
      }
      ws.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = (event: string, payload: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event, payload }));
    }
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, token]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    disconnect,
    connect,
  };
}
