import React, { RefObject } from 'react';
import { Message } from '@/services/api';
import type { Chat } from './types';
import { formatMessageTime, formatDateDivider } from './utils';

interface MessengerChatAreaProps {
  selectedChat: string | null;
  currentChat: Chat | undefined;
  messages: Message[];
  currentUserId: string | undefined;
  isLoadingMessages: boolean;
  chatError: string | null;
  messageInput: string;
  isConnected: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  isLoadingMore: boolean;
  showSignLanguagePanel: boolean;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
  onOpenUserList: () => void;
  onToggleSignLanguagePanel: () => void;
}

export default function MessengerChatArea({
  selectedChat,
  currentChat,
  messages,
  currentUserId,
  isLoadingMessages,
  chatError,
  messageInput,
  isConnected,
  messagesEndRef,
  messagesContainerRef,
  handleScroll,
  isLoadingMore,
  showSignLanguagePanel,
  onMessageInputChange,
  onSendMessage,
  onOpenUserList,
  onToggleSignLanguagePanel,
}: MessengerChatAreaProps) {
  return (
    <main className="flex-1 bg-background flex flex-col min-w-[400px]">
      {!selectedChat ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-primary text-[48px]">forum</span>
          </div>
          <h2 className="font-h2-header text-h2-header text-on-surface">Chọn một cuộc trò chuyện</h2>
          <p className="text-on-surface-variant font-body-md max-w-xs">
            Chọn một bạn bè từ danh sách bên trái hoặc thêm bạn mới để bắt đầu nhắn tin.
          </p>
          <button
            onClick={onOpenUserList}
            className="mt-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Thêm bạn mới
          </button>
        </div>
      ) : (
        <>
          <header className="w-full h-16 border-b border-surface-variant bg-surface/80 backdrop-blur-md sticky top-0 right-0 flex items-center justify-between px-6 z-30">
            <div className="flex items-center gap-sm cursor-pointer">
              <img
                alt={`${currentChat?.name} Active Chat Profile`}
                className="w-10 h-10 rounded-full object-cover border border-surface-variant"
                src={currentChat?.avatar}
              />
              <div>
                <h2 className="font-h2-header text-h2-header text-on-surface">{currentChat?.name}</h2>
                <p className="font-timestamp text-timestamp text-on-surface-variant">
                  {currentChat?.online ? 'Active now' : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-sm text-primary">
              <button className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150">
                <span className="material-symbols-outlined text-[24px]">call</span>
              </button>
              <button className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150">
                <span className="material-symbols-outlined text-[24px]">videocam</span>
              </button>
              <button
                onClick={onToggleSignLanguagePanel}
                className={`w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150 ${
                  showSignLanguagePanel ? 'bg-primary-fixed/30 text-primary' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">interpreter_mode</span>
              </button>
              <button className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150">
                <span className="material-symbols-outlined text-[24px]">info</span>
              </button>
            </div>
          </header>

          <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-lg flex flex-col relative"
          >
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-on-surface-variant">Loading messages...</span>
              </div>
            ) : chatError ? (
              <div className="flex items-center justify-center h-full p-4">
                <div className="bg-error-container/10 border border-error-container/30 rounded-lg p-4 max-w-md">
                  <div className="flex items-center gap-2 text-error mb-2">
                    <span className="material-symbols-outlined">error_outline</span>
                    <span className="font-body-md font-semibold">Cannot load messages</span>
                  </div>
                  <p className="text-on-error-container font-body-sm">{chatError}</p>
                </div>
              </div>
            ) : (
              <>
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-on-surface-variant">
                      No messages yet. Start a conversation!
                    </span>
                  </div>
                ) : (
                  <>
                    {isLoadingMore && (
                      <div className="flex items-center justify-center py-2">
                        <span className="text-on-surface-variant text-sm">Loading older messages...</span>
                      </div>
                    )}
                    {messages.map((message, index) => {
                      const isOwnMessage = message.sender_id === currentUserId;
                      const showAvatar =
                        !isOwnMessage &&
                        (index === 0 || messages[index - 1].sender_id !== message.sender_id);

                      // Hiển thị dải ngăn cách ngày nếu tin nhắn này thuộc ngày khác tin trước
                      const prevMessage = messages[index - 1];
                      const showDateDivider =
                        index === 0 ||
                        (prevMessage &&
                          new Date(message.created_at).toDateString() !==
                            new Date(prevMessage.created_at).toDateString());

                      return (
                        <React.Fragment key={message.id}>
                          {showDateDivider && (
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px bg-surface-variant" />
                              <span className="text-xs text-on-surface-variant font-medium px-2 flex-shrink-0">
                                {formatDateDivider(message.created_at)}
                              </span>
                              <div className="flex-1 h-px bg-surface-variant" />
                            </div>
                          )}
                          {isOwnMessage ? (
                            /* ── Tin nhắn GỬI (phải) ── */
                            <div className="flex flex-col items-end mb-md">
                              <div className="bg-primary text-on-primary font-body-lg text-body-lg py-2 px-4 rounded-[18px] rounded-br-[4px] max-w-[max-bubble-width] shadow-[0px_2px_8px_rgba(0,0,0,0.12)]">
                                {message.is_recalled ? (
                                  <span className="italic opacity-70">Tin nhắn đã thu hồi</span>
                                ) : (
                                  message.content
                                )}
                              </div>
                              <span className="text-xs text-on-surface-variant mt-1 mr-1">
                                {formatMessageTime(message.created_at)}
                              </span>
                            </div>
                          ) : (
                            /* ── Tin nhắn NHẬN (trái) ── */
                            <div className="flex items-end gap-2 mb-md">
                              {/* Avatar: hiện nếu là tin đầu nhóm, ẩn nhưng giữ chỗ nếu không */}
                              {showAvatar ? (
                                <img
                                  alt={`${currentChat?.name} avatar`}
                                  className="w-8 h-8 rounded-full object-cover border border-surface-variant flex-shrink-0 self-end"
                                  src={currentChat?.avatar}
                                />
                              ) : (
                                <div className="w-8 flex-shrink-0" />
                              )}

                              {/* Cột: bubble + timestamp */}
                              <div className="flex flex-col items-start">
                                <div className="bg-surface-container-high text-on-surface font-body-lg text-body-lg py-2 px-4 rounded-[18px] rounded-bl-[4px] max-w-[max-bubble-width] shadow-[0px_1px_4px_rgba(0,0,0,0.08)]">
                                  {message.is_recalled ? (
                                    <span className="italic text-on-surface-variant">Tin nhắn đã thu hồi</span>
                                  ) : (
                                    message.content
                                  )}
                                </div>
                                <span className="text-xs text-on-surface-variant mt-1 ml-1">
                                  {formatMessageTime(message.created_at)}
                                </span>
                              </div>
                            </div>
                          )}

                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} className="h-4 w-full" />
                  </>
                )}
              </>
            )}
          </div>

          <div className="p-md bg-surface border-t border-surface-variant">
            <div className="flex items-center gap-sm">
              <button className="w-8 h-8 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined">add_circle</span>
              </button>
              <button className="w-8 h-8 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined">photo_library</span>
              </button>
              <button className="w-8 h-8 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined">sticky_note_2</span>
              </button>
              <button className="w-8 h-8 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined">gif_box</span>
              </button>
              <div className="flex-1 relative bg-surface-container rounded-full flex items-center h-10 px-4">
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-body-md text-on-surface placeholder-on-surface-variant px-0"
                  placeholder="Type a message..."
                  type="text"
                  value={messageInput}
                  onChange={(e) => onMessageInputChange(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSendMessage();
                    }
                  }}
                  disabled={!selectedChat || !isConnected}
                />
                <button className="absolute right-3 text-primary hover:text-primary-container">
                  <span className="material-symbols-outlined text-[20px]">mood</span>
                </button>
              </div>
              <button
                onClick={onSendMessage}
                disabled={!messageInput.trim() || !selectedChat || !isConnected}
                className="w-10 h-10 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined" data-weight="fill">
                  send
                </span>
              </button>
            </div>
            {!isConnected && (
              <div className="mt-2 text-center text-xs text-error">Connecting to chat server...</div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
