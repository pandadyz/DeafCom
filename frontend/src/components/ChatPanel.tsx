"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_CHAT_URL = process.env.NEXT_PUBLIC_CHAT_WS_URL ?? "ws://localhost:8000/ws/chat";

type UserPublic = {
  id: string;
  username: string;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user: UserPublic;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: "text" | "sign_text";
  status: "sent" | "delivered" | "read";
  version: number;
  is_recalled: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

type MessageListResponse = {
  items: Message[];
  next_cursor: string | null;
  has_more: boolean;
};

type ChatPanelProps = {
  stableWord?: string | null;
  suggestedSigns?: string[];
  queuedSign?: string | null;
  onQueuedSignConsumed?: () => void;
};

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export default function ChatPanel({
  stableWord,
  suggestedSigns = [],
  queuedSign,
  onQueuedSignConsumed,
}: ChatPanelProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(true);
  const [peerId, setPeerId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [error, setError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!queuedSign) return;
    setInput((prev) => (prev ? `${prev} ${queuedSign}` : queuedSign));
    onQueuedSignConsumed?.();
  }, [queuedSign, onQueuedSignConsumed]);

  const canChat = Boolean(token && currentUser && peerId);

  const sortedSuggestedSigns = useMemo(() => {
    const values = stableWord ? [stableWord, ...suggestedSigns] : suggestedSigns;
    return [...new Set(values.filter(Boolean))].slice(0, 6) as string[];
  }, [stableWord, suggestedSigns]);

  const applyIncomingMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const next = [...prev];
      const idx = next.findIndex((item) => item.id === message.id);
      if (idx >= 0) next[idx] = message;
      else next.push(message);
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }, []);

  const connectChatSocket = useCallback(
    (accessToken: string) => {
      if (!peerId) return;
      wsRef.current?.close();
      const ws = new WebSocket(`${WS_CHAT_URL}?token=${encodeURIComponent(accessToken)}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "message.new" || data.event === "message.updated") {
            applyIncomingMessage(data.payload as Message);
          }
          if (data.event === "message.recalled") {
            const payload = data.payload as { message_id: string };
            setMessages((prev) =>
              prev.map((item) =>
                item.id === payload.message_id
                  ? { ...item, content: "This message was recalled.", is_recalled: true }
                  : item
              )
            );
          }
        } catch {
          // ignore non-json payload
        }
      };
    },
    [applyIncomingMessage, peerId]
  );

  const loadMessages = useCallback(async () => {
    if (!canChat || !token) return;
    setLoadingMessages(true);
    try {
      const data = await request<MessageListResponse>(`/chat/messages/${peerId}?limit=30`, undefined, token);
      setMessages(data.items ?? []);
      await request("/chat/messages/read", {
        method: "POST",
        body: JSON.stringify({ peer_id: peerId }),
      }, token);
    } catch (err: any) {
      setError(err?.message || "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, [canChat, token, peerId]);

  useEffect(() => {
    if (!token) return;
    connectChatSocket(token);
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, connectChatSocket]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const submitAuth = async () => {
    setError("");
    try {
      const endpoint = isRegisterMode ? "/auth/register" : "/auth/login";
      const data = await request<AuthResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.access_token);
      setCurrentUser(data.user);
    } catch (err: any) {
      setError(err?.message || "Authentication failed");
    }
  };

  const sendMessage = async () => {
    if (!token || !peerId) return;
    const content = input.trim();
    if (!content) return;
    setInput("");
    try {
      await request<Message>(
        "/chat/messages",
        {
          method: "POST",
          body: JSON.stringify({
            receiver_id: peerId,
            content,
            message_type: "text",
          }),
        },
        token
      );
    } catch (err: any) {
      setError(err?.message || "Failed to send message");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">Chat 1-1 (MVP)</h3>
        {!currentUser ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-1/2 rounded border px-2 py-1 bg-white dark:bg-gray-900"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-1/2 rounded border px-2 py-1 bg-white dark:bg-gray-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={submitAuth}
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
              >
                {isRegisterMode ? "Register" : "Login"}
              </button>
              <button
                onClick={() => setIsRegisterMode((v) => !v)}
                className="px-3 py-1 rounded border text-sm"
              >
                Switch to {isRegisterMode ? "Login" : "Register"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Signed in as <span className="font-semibold">{currentUser.username}</span>
            </p>
            <input
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              placeholder="Peer user UUID"
              className="w-full rounded border px-2 py-1 bg-white dark:bg-gray-900"
            />
            <button onClick={loadMessages} className="px-3 py-1 rounded border text-sm">
              Load conversation
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {sortedSuggestedSigns.map((sign) => (
            <button
              key={sign}
              onClick={() => setInput((prev) => (prev ? `${prev} ${sign}` : sign))}
              className="rounded-full bg-indigo-100 dark:bg-indigo-900 px-3 py-1 text-xs"
            >
              + {sign}
            </button>
          ))}
        </div>

        <div className="h-56 overflow-y-auto rounded border p-2 space-y-2 bg-gray-50 dark:bg-gray-900">
          {loadingMessages ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-500">No messages yet.</p>
          ) : (
            messages.map((msg) => {
              const mine = msg.sender_id === currentUser?.id;
              return (
                <div
                  key={msg.id}
                  className={`max-w-[80%] rounded px-3 py-2 text-sm ${
                    mine
                      ? "ml-auto bg-blue-600 text-white"
                      : "mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <div>{msg.content}</div>
                  <div className="mt-1 text-[10px] opacity-70">
                    {new Date(msg.created_at).toLocaleTimeString()}
                    {msg.edited_at ? " · edited" : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Type a message..."
            className="flex-1 rounded border px-3 py-2 bg-white dark:bg-gray-900"
          />
          <button
            onClick={sendMessage}
            disabled={!canChat || !input.trim()}
            className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

