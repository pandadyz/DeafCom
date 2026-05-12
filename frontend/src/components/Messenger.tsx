"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient, Message, User, Friend, FriendRequest, ConversationItem } from '@/services/api';

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread?: boolean;
  online?: boolean;
  userId: string;
}

interface FriendRequestWithUser extends FriendRequest {
  sender_username?: string;
}

export default function Messenger() {
  const { user, logout } = useAuth();
  const token = user && typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  
  // Debug token availability
  useEffect(() => {
    console.log('User:', user ? 'exists' : 'null');
    console.log('Token:', token ? 'exists' : 'null');
    console.log('Window:', typeof window !== 'undefined' ? 'available' : 'not available');
  }, [user, token]);
  
  const { isConnected, lastMessage, sendMessage } = useWebSocket(token);
  
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [recognizedGestures, setRecognizedGestures] = useState<string[]>([]);
  const [showSignLanguagePanel, setShowSignLanguagePanel] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load conversations, friends and friend requests on component mount
  useEffect(() => {
    if (user && token) {
      loadConversations();
      loadFriends();
      loadFriendRequests();
      loadAllUsers();
    }
  }, [user, token]);

  // Update chats when conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      const conversationChats: Chat[] = conversations.map(conv => ({
        id: conv.friend.id,
        name: conv.friend.username,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.friend.username}`,
        lastMessage: 'No messages yet',
        timestamp: new Date(conv.last_message_at).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }),
        userId: conv.friend.id
      }));
      setChats(conversationChats);
    } else {
      setChats([]);
    }
  }, [conversations]);

  // Load messages when chat is selected
  useEffect(() => {
    if (selectedChat && user) {
      loadMessages(selectedChat);
    }
  }, [selectedChat, user]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = async () => {
    if (!user || !token) return;
    
    setIsLoadingConversations(true);
    try {
      const response = await apiClient.getConversations();
      setConversations(response.conversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      // Handle 401/403 errors gracefully
      if (error instanceof Error && error.message.includes('401')) {
        // Token expired, will be handled by AuthContext
        return;
      }
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadFriends = async () => {
    if (!user) return;
    
    setIsLoadingFriends(true);
    try {
      const response = await apiClient.getFriends();
      setFriends(response.friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const loadFriendRequests = async () => {
    if (!user) return;
    
    try {
      const response = await apiClient.getFriendRequests();
      setFriendRequests(response.requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    }
  };

  const sendFriendRequest = async (receiverId: string) => {
    // Pre-validation: Check if already friends or pending
    const isAlreadyFriend = friends.some(f => f.id === receiverId);
    const isPendingRequest = friendRequests.some(r => 
      (r.sender_id === user?.id && r.receiver_id === receiverId) ||
      (r.receiver_id === user?.id && r.sender_id === receiverId)
    );
    
    if (isAlreadyFriend) {
      alert('Bạn đã là bạn với người này!');
      return;
    }
    
    if (isPendingRequest) {
      alert('Đã có lời mời kết bạn đang chờ xử lý!');
      return;
    }
    
    try {
      await apiClient.sendFriendRequest(receiverId);
      // Show success message
      alert('Đã gửi lời mời kết bạn thành công!');
      
      // Refresh friend requests and available users
      await loadFriendRequests();
      if (showUserList) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to send friend request:', error);
      
      // Show user-friendly error message
      let errorMessage = 'Không thể gửi lời mời kết bạn';
      if (error instanceof Error) {
        if (error.message.includes('already_friends')) {
          errorMessage = 'Bạn đã là bạn với người này!';
        } else if (error.message.includes('friend_request_already_pending')) {
          errorMessage = 'Đã gửi lời mời cho người này!';
        } else if (error.message.includes('cannot_send_request_to_self')) {
          errorMessage = 'Không thể kết bạn với chính mình!';
        } else if (error.message.includes('user_not_found')) {
          errorMessage = 'Không tìm thấy người dùng!';
        }
      }
      
      alert(errorMessage);
    }
  };

  const respondToFriendRequest = async (requestId: string, accept: boolean) => {
    // Prevent double-click
    if (respondingRequests.has(requestId)) {
      return;
    }
    
    setRespondingRequests(prev => new Set(prev).add(requestId));
    
    try {
      await apiClient.respondToFriendRequest(requestId, accept);
      // Refresh conversations, friends and requests
      await loadConversations();
      await loadFriends();
      await loadFriendRequests();
    } catch (error) {
      console.error('Failed to respond to friend request:', error);
    } finally {
      setRespondingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const loadAllUsers = async () => {
    if (!user) return;
    
    try {
      const users = await apiClient.getUsers();
      setAllUsers(users);
    } catch (error) {
      console.error('Failed to load all users:', error);
    }
  };

  const loadUsers = async () => {
    if (!user) return;
    
    setIsLoadingUsers(true);
    try {
      const users = await apiClient.getUsers();
      // Filter out users who are already friends or have pending requests
      const friendIds = friends.map(f => f.id);
      const sentRequestIds = friendRequests.filter(r => r.sender_id === user.id).map(r => r.receiver_id);
      const receivedRequestIds = friendRequests.filter(r => r.receiver_id === user.id).map(r => r.sender_id);
      const allPendingRequestIds = [...sentRequestIds, ...receivedRequestIds];
      
      const filteredUsers = users.filter(u => 
        !friendIds.includes(u.id) && !allPendingRequestIds.includes(u.id)
      );
      
      setAvailableUsers(filteredUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Load users when user list modal is opened
  useEffect(() => {
    if (showUserList && user) {
      loadUsers();
    }
  }, [showUserList, user]);

  const [chatError, setChatError] = useState<string | null>(null);
  const [respondingRequests, setRespondingRequests] = useState<Set<string>>(new Set());

  const loadMessages = async (chatId: string) => {
    if (!user) return;
    
    setIsLoadingMessages(true);
    setChatError(null);
    try {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        const response = await apiClient.getMessages(chat.userId);
        setMessages(response.items);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      
      // Handle specific errors with user-friendly messages
      if (error instanceof Error) {
        if (error.message.includes('403')) {
          setChatError('You can only chat with accepted friends. Please wait for the friend request to be accepted.');
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
  };

  const handleWebSocketMessage = (message: any) => {
    switch (message.event) {
      case 'message.new':
        if (selectedChat && 
            (message.payload.sender_id === selectedChat || 
             message.payload.receiver_id === selectedChat)) {
          setMessages(prev => [...prev, message.payload]);
        }
        break;
      case 'message.updated':
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.payload.id ? message.payload : msg
          )
        );
        break;
      case 'message.recalled':
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.payload.message_id 
              ? { ...msg, is_recalled: true, deleted_at: message.payload.recalled_at }
              : msg
          )
        );
        break;
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChat || !user) return;

    const content = messageInput.trim();
    setMessageInput('');

    try {
      const chat = chats.find(c => c.id === selectedChat);
      if (chat) {
        // Send via WebSocket for real-time delivery only
        sendMessage('message.send', {
          receiver_id: chat.userId,
          content,
          message_type: 'text'
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Fallback to API if WebSocket fails
      try {
        const chat = chats.find(c => c.id === selectedChat);
        if (chat) {
          await apiClient.sendMessage(chat.userId, content);
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleSendSignLanguageToChat = async () => {
    if (!transcribedText.trim() || !selectedChat || !user) return;

    try {
      const chat = chats.find(c => c.id === selectedChat);
      if (chat) {
        // Send sign language transcribed text via WebSocket only
        sendMessage('message.send', {
          receiver_id: chat.userId,
          content: transcribedText,
          message_type: 'sign_text'
        });
        
        // Clear the transcribed text after sending
        setTranscribedText('');
        setRecognizedGestures([]);
      }
    } catch (error) {
      console.error('Failed to send sign language message:', error);
      // Fallback to API if WebSocket fails
      try {
        const chat = chats.find(c => c.id === selectedChat);
        if (chat) {
          await apiClient.sendMessage(chat.userId, transcribedText, 'sign_text');
          setTranscribedText('');
          setRecognizedGestures([]);
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
      }
    }
  };

  const handleClearTranscription = () => {
    setTranscribedText('');
    setRecognizedGestures([]);
  };

  const currentChat = chats.find(chat => chat.id === selectedChat);

  return (
    <div className="h-screen flex bg-background">
      {/* Global Navigation Rail */}
      <nav className="w-[64px] h-full bg-surface-container-lowest border-r border-surface-variant flex flex-col items-center py-lg z-50 flex-shrink-0">
        <div className="mb-xl text-primary">
          <span className="material-symbols-outlined text-h1-display" data-weight="fill">
            chat
          </span>
        </div>
        <div className="flex flex-col gap-lg flex-1">
          <button className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors">
            <span className="material-symbols-outlined" data-weight="fill">
              chat
            </span>
          </button>
          <button className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined">group</span>
          </button>
          <button className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined">storefront</span>
          </button>
        </div>
        <div className="flex flex-col gap-md mt-auto">
          <button className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button 
            onClick={logout}
            className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            title="Đăng xuất"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </nav>

      {/* SideNavBar (Left Column - Chats List) */}
      <aside className="w-sidebar-width h-full bg-surface-container-lowest border-r border-surface-variant flex flex-col z-40 flex-shrink-0">
        <div className="p-md flex flex-col gap-md border-b border-surface-variant">
          <div className="flex justify-between items-center">
            <h1 className="font-h1-display text-h1-display text-on-surface">
              Chats
            </h1>
            <div className="flex gap-sm">
              <button 
                onClick={() => setShowUserList(true)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  person_add
                </span>
              </button>
              <button 
                onClick={() => setShowFriendRequests(true)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors relative"
              >
                <span className="material-symbols-outlined text-[20px]">
                  notifications
                </span>
                {friendRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-surface-container-lowest" />
                )}
              </button>
              <button className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[20px]">
                  more_horiz
                </span>
              </button>
              <button className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[20px]">
                  edit_square
                </span>
              </button>
            </div>
          </div>
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              className="w-full h-10 bg-surface-container rounded-full pl-10 pr-4 text-body-md focus:outline-none focus:ring-2 focus:ring-primary/50 border-none placeholder-on-surface-variant"
              placeholder="Search Messenger"
              type="text"
            />
          </div>
          <div className="flex gap-sm">
            <button className="px-4 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-caps text-label-caps">
              All
            </button>
            <button className="px-4 py-1.5 rounded-full hover:bg-surface-container text-on-surface font-label-caps text-label-caps transition-colors">
              Unread
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-on-surface-variant">Loading conversations...</span>
            </div>
          ) : chats.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-on-surface-variant">No conversations yet. Add friends to start chatting!</span>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat.id)}
                className={`p-sm cursor-pointer active:opacity-80 transition-colors duration-200 ease-in-out rounded-lg mx-2 my-1 flex items-center gap-sm relative ${
                  selectedChat === chat.id
                    ? 'bg-primary-fixed/30 hover:bg-primary-fixed/50'
                    : 'hover:bg-surface-container'
                }`}
              >
                {selectedChat === chat.id && (
                  <div className="w-1 h-8 bg-primary absolute left-0 rounded-r-full -ml-sm" />
                )}
                <div className="relative">
                  <img
                    alt={`${chat.name} Avatar`}
                    className="w-10 h-10 rounded-full object-cover border border-surface-variant"
                    src={chat.avatar}
                  />
                  {chat.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface-container-lowest rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="font-body-lg text-body-lg text-on-surface truncate">
                      {chat.name}
                    </span>
                    <span className="font-timestamp text-timestamp text-on-surface-variant flex-shrink-0">
                      {chat.timestamp}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="font-body-md text-body-md text-on-surface-variant truncate">
                      {chat.lastMessage}
                    </p>
                    {chat.unread && (
                      <span className="w-4 h-4 rounded-full bg-primary flex-shrink-0 ml-2" />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Area (Middle Column) */}
      <main className="flex-1 bg-background flex flex-col min-w-[400px]">
        {/* TopNavBar */}
        <header className="w-full h-16 border-b border-surface-variant bg-surface/80 backdrop-blur-md sticky top-0 right-0 flex items-center justify-between px-6 z-30">
          <div className="flex items-center gap-sm cursor-pointer">
            <img
              alt={`${currentChat?.name} Active Chat Profile`}
              className="w-10 h-10 rounded-full object-cover border border-surface-variant"
              src={currentChat?.avatar}
            />
            <div>
              <h2 className="font-h2-header text-h2-header text-on-surface">
                {currentChat?.name}
              </h2>
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
              <span className="material-symbols-outlined text-[24px]">
                videocam
              </span>
            </button>
            <button 
              onClick={() => setShowSignLanguagePanel(!showSignLanguagePanel)}
              className={`w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150 ${
                showSignLanguagePanel ? 'bg-primary-fixed/30 text-primary' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                interpreter_mode
              </span>
            </button>
            <button className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-all duration-150">
              <span className="material-symbols-outlined text-[24px]">info</span>
            </button>
          </div>
        </header>

        {/* Message History Canvas */}
        <div className="flex-1 overflow-y-auto p-lg flex flex-col relative">
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
                  <span className="text-on-surface-variant">No messages yet. Start a conversation!</span>
                </div>
              ) : (
                <>
                  {messages.map((message, index) => {
                    const isOwnMessage = message.sender_id === user?.id;
                    const showAvatar = !isOwnMessage && (index === 0 || messages[index - 1].sender_id !== message.sender_id);
                    
                    return (
                      <div key={message.id} className={`mb-md ${isOwnMessage ? 'flex flex-col items-end' : 'flex items-end gap-sm'}`}>
                        {showAvatar && (
                          <img
                            alt={`${currentChat?.name} Small Avatar`}
                            className="w-8 h-8 rounded-full object-cover border border-surface-variant mb-1"
                            src={currentChat?.avatar}
                          />
                        )}
                        {!showAvatar && !isOwnMessage && (
                          <div className="w-8" />
                        )}
                        <div className={`${
                          isOwnMessage
                            ? 'bg-primary text-on-primary font-body-lg text-body-lg py-2 px-4 rounded-[18px] rounded-br-[4px] max-w-[max-bubble-width] shadow-[0px_2px_8px_rgba(0,0,0,0.05)]'
                            : 'bg-surface-container text-on-surface font-body-lg text-body-lg py-2 px-4 rounded-[18px] rounded-bl-[4px] max-w-[max-bubble-width]'
                        }`}>
                          {message.is_recalled ? (
                            <span className="italic text-on-surface-variant">Message recalled</span>
                          ) : (
                            message.content
                          )}
                        </div>
                        <div className={`text-xs text-on-surface-variant mt-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}>
                          {formatTimestamp(message.created_at)}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} className="h-4 w-full" />
                </>
              )}
            </>
          )}
        </div>

        {/* Input Area */}
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
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={!selectedChat || !isConnected}
              />
              <button className="absolute right-3 text-primary hover:text-primary-container">
                <span className="material-symbols-outlined text-[20px]">mood</span>
              </button>
            </div>
            <button 
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || !selectedChat || !isConnected}
              className="w-10 h-10 rounded-full text-primary hover:bg-surface-container flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined" data-weight="fill">
                send
              </span>
            </button>
          </div>
          {!isConnected && (
            <div className="mt-2 text-center text-xs text-error">
              Connecting to chat server...
            </div>
          )}
        </div>
      </main>

      {/* Right Column - Sign Language Interpretation Panel */}
      <aside className={`w-sidebar-width h-full bg-surface-container-lowest border-l border-surface-variant flex flex-col z-40 flex-shrink-0 transition-all duration-300 lg:flex ${
        showSignLanguagePanel ? 'flex' : 'hidden lg:hidden'
      }`}>
        <div className="p-4 border-b border-surface-variant flex items-center justify-between bg-surface">
          <h2 className="font-h2-header text-h2-header text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              interpreter_mode
            </span>
            Sign Language Assistant
          </h2>
          <button 
            onClick={() => setShowSignLanguagePanel(false)}
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Camera View */}
          <div className="p-4 flex flex-col gap-2 border-b border-surface-variant">
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                Live Recognition
              </span>
              <div className="flex items-center gap-1 bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold">REC</span>
              </div>
            </div>
            <div className="w-full aspect-video bg-surface-dim rounded-xl overflow-hidden relative shadow-sm border border-surface-variant">
              <img
                alt="Sign Language Camera"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDqy2tyDh744E5VjuUrrrLpfUrVNSGUvMw7vp3wBb1qlBx0evaioNoLm-2gx6thZTUqAVNZCJP08Lzh5vfgg9FQfJx8BexOd270DmZgc7z1g9XV84bK9LRbxEveLZLmh6Bs2LmIUmpBjmQ8_PThw83YmCeEZbsf0oA_EFrO7MGDrw6JA_057YmNM9xU63_Sey-yEPyys7QPCFpLkCSEqyG4tMNUHvtI1Tml38pqmgQNYQMSsIF7cdN16wibsnCPEF6pG53RDJVAaLyu"
              />
              {/* Pose estimation overlay mock */}
              <svg
                className="absolute inset-0 w-full h-full text-primary opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 100 100"
              >
                <path d="M40 60 L50 40 L60 60" strokeWidth={1} />
                <circle cx={50} cy={30} r={5} strokeWidth={1} />
              </svg>
            </div>
          </div>
          
          {/* Transcribed Text Area */}
          <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                Transcribed Text
              </span>
              <button 
                onClick={handleClearTranscription}
                className="text-primary hover:underline font-timestamp text-[11px]"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 bg-surface-container-low rounded-xl p-4 border border-surface-variant overflow-y-auto">
              <div className="flex flex-col gap-3">
                <p className="font-body-md text-on-surface-variant italic">
                  {recognizedGestures.length === 0 ? 'Waiting for gestures...' : 'Recognizing gestures...'}
                </p>
                {recognizedGestures.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recognizedGestures.map((gesture, index) => (
                      <span key={index} className="bg-primary-fixed text-on-primary-fixed-variant px-3 py-1 rounded-full text-body-md">
                        {gesture}
                      </span>
                    ))}
                  </div>
                )}
                {transcribedText && (
                  <div className="p-3 bg-surface rounded-lg border border-primary/20 shadow-sm mt-auto">
                    <p className="font-body-md text-on-surface">
                      "{transcribedText}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Controls */}
          <div className="p-4 border-t border-surface-variant bg-surface">
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button 
                onClick={handleSendSignLanguageToChat}
                disabled={!transcribedText.trim() || !selectedChat}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">send</span>
                <span className="font-label-caps text-[11px]">Send to Chat</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-surface-container hover:bg-surface-variant text-on-surface transition-colors">
                <span className="material-symbols-outlined">mic</span>
                <span className="font-label-caps text-[11px]">Voice output</span>
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-surface-variant hover:bg-surface-container cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant">
                  settings
                </span>
                <span className="font-body-md text-on-surface">Settings</span>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">
                chevron_right
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* User List Modal */}
      {showUserList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-container-lowest rounded-xl w-[400px] max-h-[500px] flex flex-col border border-surface-variant">
            <div className="p-4 border-b border-surface-variant flex items-center justify-between">
              <h2 className="font-h2-header text-h2-header text-on-surface">
                Add Friends
              </h2>
              <button 
                onClick={() => setShowUserList(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingUsers ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-on-surface-variant">Loading users...</span>
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="flex items-center justify-center h-full flex-col gap-3">
                  <span className="text-on-surface-variant">No available users to add</span>
                  <div className="text-center text-sm text-on-surface-variant">
                    <p>All users are either:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Already your friends</li>
                      <li>Pending friend requests</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {availableUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container transition-colors">
                      <div className="flex items-center gap-3">
                        <img
                          alt={`${user.username} Avatar`}
                          className="w-10 h-10 rounded-full object-cover border border-surface-variant"
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                        />
                        <div>
                          <p className="font-body-lg text-body-lg text-on-surface">
                            {user.username}
                          </p>
                          <p className="font-body-md text-body-md text-on-surface-variant">
                            Joined {formatDate(user.created_at)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => sendFriendRequest(user.id)}
                        className="px-4 py-2 rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-colors font-label-caps text-label-caps"
                      >
                        Add Friend
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Friend Requests Modal */}
      {showFriendRequests && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-container-lowest rounded-xl w-[450px] max-h-[600px] flex flex-col border border-surface-variant">
            <div className="p-4 border-b border-surface-variant flex items-center justify-between">
              <h2 className="font-h2-header text-h2-header text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  notifications
                </span>
                Friend Requests
                {friendRequests.length > 0 && (
                  <span className="bg-primary text-on-primary text-xs px-2 py-1 rounded-full">
                    {friendRequests.length}
                  </span>
                )}
              </h2>
              <button 
                onClick={() => setShowFriendRequests(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {friendRequests.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3">
                      notifications_none
                    </span>
                    <p className="text-on-surface-variant">No friend requests</p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      When someone sends you a friend request, it will appear here
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {friendRequests.map((request) => {
                    const sender = allUsers.find(u => u.id === request.sender_id);
                    return (
                      <div key={request.id} className="bg-surface-container rounded-lg p-4 border border-surface-variant">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <img
                              alt={`${sender?.username || 'User'} Avatar`}
                              className="w-12 h-12 rounded-full object-cover border border-surface-variant"
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${sender?.username || request.sender_id}`}
                            />
                            <div>
                              <p className="font-body-lg text-body-lg text-on-surface">
                                <strong>{sender?.username || 'Unknown User'}</strong> wants to be your friend
                              </p>
                              <p className="font-body-sm text-body-sm text-on-surface-variant">
                                Sent {formatDate(request.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => respondToFriendRequest(request.id, false)}
                              disabled={respondingRequests.has(request.id)}
                              className="px-3 py-1.5 rounded-full bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80 transition-colors font-label-caps text-label-caps disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {respondingRequests.has(request.id) ? 'Processing...' : 'Decline'}
                            </button>
                            <button
                              onClick={() => respondToFriendRequest(request.id, true)}
                              disabled={respondingRequests.has(request.id)}
                              className="px-3 py-1.5 rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-colors font-label-caps text-label-caps disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {respondingRequests.has(request.id) ? 'Processing...' : 'Accept'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
