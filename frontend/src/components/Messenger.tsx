"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import MessengerNavRail from '@/components/messenger/MessengerNavRail';
import MessengerSidebar from '@/components/messenger/MessengerSidebar';
import MessengerChatArea from '@/components/messenger/MessengerChatArea';
import SignLanguagePanel from '@/components/messenger/SignLanguagePanel';
import UserListModal from '@/components/messenger/UserListModal';
import FriendRequestsModal from '@/components/messenger/FriendRequestsModal';
import MessengerToast from '@/components/messenger/MessengerToast';
import { useToast } from '@/components/messenger/hooks/useToast';
import { useMessengerData } from '@/components/messenger/hooks/useMessengerData';
import { useMessengerChat } from '@/components/messenger/hooks/useMessengerChat';
import { useSignLanguageComposer } from '@/components/messenger/hooks/useSignLanguageComposer';

export default function Messenger() {
  const { user, logout } = useAuth();
  const token = user && typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  useEffect(() => {
    console.log('User:', user ? 'exists' : 'null');
    console.log('Token:', token ? 'exists' : 'null');
    console.log('Window:', typeof window !== 'undefined' ? 'available' : 'not available');
  }, [user, token]);

  const { isConnected, lastMessage, sendMessage } = useWebSocket(token);
  const { toast, showToast, dismissToast } = useToast();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  const data = useMessengerData({
    userId: user?.id,
    hasToken: !!token,
    showToast,
  });

  const chat = useMessengerChat({
    userId: user?.id,
    selectedChat,
    chats: data.chats,
    lastMessage,
    sendMessage,
  });

  const signLanguage = useSignLanguageComposer({
    userId: user?.id,
    selectedChat,
    chats: data.chats,
    sendMessage,
    showToast,
    onCopyToMessageInput: chat.setMessageInput,
  });

  return (
    <div className="h-screen flex bg-background">
      <MessengerNavRail onLogout={logout} />

      <MessengerSidebar
        chats={data.chats}
        selectedChat={selectedChat}
        isLoadingConversations={data.isLoadingConversations}
        friendRequestCount={data.friendRequests.length}
        onSelectChat={setSelectedChat}
        onOpenUserList={() => data.setShowUserList(true)}
        onOpenFriendRequests={() => data.setShowFriendRequests(true)}
      />

      <MessengerChatArea
        selectedChat={selectedChat}
        currentChat={chat.currentChat}
        messages={chat.messages}
        currentUserId={user?.id}
        isLoadingMessages={chat.isLoadingMessages}
        chatError={chat.chatError}
        messageInput={chat.messageInput}
        isConnected={isConnected}
        messagesEndRef={chat.messagesEndRef}
        showSignLanguagePanel={signLanguage.showSignLanguagePanel}
        onMessageInputChange={chat.setMessageInput}
        onSendMessage={chat.handleSendMessage}
        onOpenUserList={() => data.setShowUserList(true)}
        onToggleSignLanguagePanel={() =>
          signLanguage.setShowSignLanguagePanel((prev) => !prev)
        }
      />

      <SignLanguagePanel
        isOpen={signLanguage.showSignLanguagePanel}
        selectedChat={selectedChat}
        transcribedText={signLanguage.transcribedText}
        transcribedWordsHistory={signLanguage.transcribedWordsHistory}
        composedWords={signLanguage.composedWords}
        messageDraft={signLanguage.messageDraft}
        suggestedSentence={signLanguage.suggestedSentence}
        isSuggestingLoading={signLanguage.isSuggestingLoading}
        onClose={() => signLanguage.setShowSignLanguagePanel(false)}
        onDetection={signLanguage.handleDetection}
        onClearAll={signLanguage.handleClearAll}
        onClearHistory={signLanguage.handleClearHistory}
        onSelectWord={signLanguage.handleSelectWordToSend}
        onClearComposer={signLanguage.handleClearComposer}
        onRemoveComposedWord={signLanguage.handleRemoveComposedWord}
        onDraftChange={signLanguage.handleDraftChange}
        onSuggestSentence={signLanguage.handleSuggestSentence}
        onSendComposedSentence={signLanguage.handleSendComposedSentence}
        onCopyToChatInput={signLanguage.handleCopyToChatInput}
        onSendSignLanguageToChat={signLanguage.handleSendSignLanguageToChat}
      />

      <UserListModal
        isOpen={data.showUserList}
        isLoading={data.isLoadingUsers}
        users={data.availableUsers}
        onClose={() => data.setShowUserList(false)}
        onSendFriendRequest={data.sendFriendRequest}
      />

      <FriendRequestsModal
        isOpen={data.showFriendRequests}
        friendRequests={data.friendRequests}
        allUsers={data.allUsers}
        respondingRequests={data.respondingRequests}
        onClose={() => data.setShowFriendRequests(false)}
        onRespond={data.respondToFriendRequest}
      />

      <MessengerToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
