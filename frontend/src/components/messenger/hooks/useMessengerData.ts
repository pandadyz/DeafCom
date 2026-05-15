import { useCallback, useEffect, useState } from 'react';
import { apiClient, ConversationItem, Friend, FriendRequest, User } from '@/services/api';
import type { Chat } from '../types';
import { getAvatarUrl } from '../utils';
import type { ToastType } from '../types';

interface UseMessengerDataOptions {
  userId: string | undefined;
  hasToken: boolean;
  showToast: (message: string, type?: ToastType) => void;
}

export function useMessengerData({ userId, hasToken, showToast }: UseMessengerDataOptions) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [respondingRequests, setRespondingRequests] = useState<Set<string>>(new Set());

  const loadConversations = useCallback(async () => {
    if (!userId || !hasToken) return;

    setIsLoadingConversations(true);
    try {
      const response = await apiClient.getConversations();
      setConversations(response.conversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      if (error instanceof Error && error.message.includes('401')) return;
    } finally {
      setIsLoadingConversations(false);
    }
  }, [userId, hasToken]);

  const loadFriends = useCallback(async () => {
    if (!userId) return;

    setIsLoadingFriends(true);
    try {
      const response = await apiClient.getFriends();
      setFriends(response.friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [userId]);

  const loadFriendRequests = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await apiClient.getFriendRequests();
      setFriendRequests(response.requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    }
  }, [userId]);

  const loadAllUsers = useCallback(async () => {
    if (!userId) return;

    try {
      const users = await apiClient.getUsers();
      setAllUsers(users);
    } catch (error) {
      console.error('Failed to load all users:', error);
    }
  }, [userId]);

  const loadUsers = useCallback(async () => {
    if (!userId) return;

    setIsLoadingUsers(true);
    try {
      const users = await apiClient.getUsers();
      const friendIds = friends.map((f) => f.id);
      const sentRequestIds = friendRequests
        .filter((r) => r.sender_id === userId)
        .map((r) => r.receiver_id);
      const receivedRequestIds = friendRequests
        .filter((r) => r.receiver_id === userId)
        .map((r) => r.sender_id);
      const allPendingRequestIds = [...sentRequestIds, ...receivedRequestIds];

      const filteredUsers = users.filter(
        (u) => !friendIds.includes(u.id) && !allPendingRequestIds.includes(u.id)
      );
      setAvailableUsers(filteredUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [userId, friends, friendRequests]);

  useEffect(() => {
    if (userId && hasToken) {
      loadConversations();
      loadFriends();
      loadFriendRequests();
      loadAllUsers();
    }
  }, [userId, hasToken, loadConversations, loadFriends, loadFriendRequests, loadAllUsers]);

  useEffect(() => {
    if (conversations.length > 0) {
      const conversationChats: Chat[] = conversations.map((conv) => ({
        id: conv.friend.id,
        name: conv.friend.username,
        avatar: getAvatarUrl(conv.friend.username),
        lastMessage: 'No messages yet',
        timestamp: new Date(conv.last_message_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        userId: conv.friend.id,
      }));
      setChats(conversationChats);
    } else {
      setChats([]);
    }
  }, [conversations]);

  useEffect(() => {
    if (showUserList && userId) {
      loadUsers();
    }
  }, [showUserList, userId, loadUsers]);

  const sendFriendRequest = useCallback(
    async (receiverId: string) => {
      const isAlreadyFriend = friends.some((f) => f.id === receiverId);
      const isPendingRequest = friendRequests.some(
        (r) =>
          (r.sender_id === userId && r.receiver_id === receiverId) ||
          (r.receiver_id === userId && r.sender_id === receiverId)
      );

      if (isAlreadyFriend) {
        showToast('Bạn đã là bạn với người này!', 'info');
        return;
      }

      if (isPendingRequest) {
        showToast('Đã có lời mời kết bạn đang chờ xử lý!', 'info');
        return;
      }

      try {
        await apiClient.sendFriendRequest(receiverId);
        showToast('Đã gửi lời mời kết bạn thành công!', 'success');
        await loadFriendRequests();
        if (showUserList) {
          await loadUsers();
        }
      } catch (error) {
        console.error('Failed to send friend request:', error);

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

        showToast(errorMessage, 'error');
      }
    },
    [friends, friendRequests, userId, showToast, loadFriendRequests, showUserList, loadUsers]
  );

  const respondToFriendRequest = useCallback(
    async (requestId: string, accept: boolean) => {
      if (respondingRequests.has(requestId)) return;

      setRespondingRequests((prev) => new Set(prev).add(requestId));

      try {
        await apiClient.respondToFriendRequest(requestId, accept);
        await loadConversations();
        await loadFriends();
        await loadFriendRequests();
      } catch (error) {
        console.error('Failed to respond to friend request:', error);
      } finally {
        setRespondingRequests((prev) => {
          const newSet = new Set(prev);
          newSet.delete(requestId);
          return newSet;
        });
      }
    },
    [respondingRequests, loadConversations, loadFriends, loadFriendRequests]
  );

  return {
    chats,
    friends,
    friendRequests,
    availableUsers,
    allUsers,
    isLoadingFriends,
    isLoadingConversations,
    isLoadingUsers,
    showFriendRequests,
    setShowFriendRequests,
    showUserList,
    setShowUserList,
    respondingRequests,
    sendFriendRequest,
    respondToFriendRequest,
  };
}
