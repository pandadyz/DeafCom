import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, Message } from '@/services/api';
import type { Chat } from '../types';

interface UseMessengerChatOptions {
  userId: string | undefined;
  selectedChat: string | null;
  chats: Chat[];
  lastMessage: unknown;
  sendMessage: (event: string, payload: Record<string, unknown>) => void;
}

export function useMessengerChat({
  userId,
  selectedChat,
  chats,
  lastMessage,
  sendMessage,
}: UseMessengerChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadMessages = useCallback(
    async (chatId: string) => {
      if (!userId) return;

      setIsLoadingMessages(true);
      setChatError(null);
      try {
        const chat = chats.find((c) => c.id === chatId);
        if (chat) {
          const response = await apiClient.getMessages(chat.userId);
          setMessages(response.items);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);

        if (error instanceof Error) {
          if (error.message.includes('403')) {
            setChatError(
              'You can only chat with accepted friends. Please wait for the friend request to be accepted.'
            );
          } else if (error.message.includes('401')) {
            setChatError('Your session has expired. Please log in again.');
          } else {
            setChatError('Failed to load messages. Please try again.');
          }
        }

        setMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [userId, chats]
  );

  const handleWebSocketMessage = useCallback(
    (message: { event: string; payload: Record<string, unknown> }) => {
      switch (message.event) {
        case 'message.new':
          if (
            selectedChat &&
            (message.payload.sender_id === selectedChat ||
              message.payload.receiver_id === selectedChat)
          ) {
            setMessages((prev) => [...prev, message.payload as unknown as Message]);
          }
          break;
        case 'message.updated':
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === (message.payload as unknown as Message).id
                ? (message.payload as unknown as Message)
                : msg
            )
          );
          break;
        case 'message.recalled':
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === message.payload.message_id
                ? {
                    ...msg,
                    is_recalled: true,
                    deleted_at: message.payload.recalled_at as string,
                  }
                : msg
            )
          );
          break;
      }
    },
    [selectedChat]
  );

  useEffect(() => {
    if (selectedChat && userId) {
      loadMessages(selectedChat);
    }
  }, [selectedChat, userId, loadMessages]);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage as { event: string; payload: Record<string, unknown> });
    }
  }, [lastMessage, handleWebSocketMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !selectedChat || !userId) return;

    const content = messageInput.trim();
    setMessageInput('');

    try {
      const chat = chats.find((c) => c.id === selectedChat);
      if (chat) {
        sendMessage('message.send', {
          receiver_id: chat.userId,
          content,
          message_type: 'text',
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      try {
        const chat = chats.find((c) => c.id === selectedChat);
        if (chat) {
          await apiClient.sendMessage(chat.userId, content);
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
      }
    }
  }, [messageInput, selectedChat, userId, chats, sendMessage]);

  const currentChat = chats.find((chat) => chat.id === selectedChat);

  return {
    messages,
    messageInput,
    setMessageInput,
    isLoadingMessages,
    chatError,
    messagesEndRef,
    handleSendMessage,
    currentChat,
  };
}
