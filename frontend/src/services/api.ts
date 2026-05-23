// Dùng relative URL "/api" để Next.js proxy forward đến backend (tránh CORS từ browser).
// Nếu có NEXT_PUBLIC_API_URL (e.g. ngrok), dùng thẳng URL đó.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";


export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: 'text' | 'sign_text';
  status: 'sent' | 'delivered' | 'read';
  version: number;
  is_recalled: boolean;
  created_at: string;
  updated_at: string;
  edited_at?: string;
  deleted_at?: string;
}

export interface User {
  id: string;
  username: string;
  created_at: string;
  last_seen_at: string;
}

export interface MessageListResponse {
  items: Message[];
  next_cursor?: string;
  has_more: boolean;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Friend {
  id: string;
  username: string;
  created_at: string;
}

export interface FriendListResponse {
  friends: Friend[];
}

export interface ConversationFriend {
  id: string;
  username: string;
  created_at: string;
}

export interface ConversationItem {
  conversation_id: string;
  friend: ConversationFriend;
  last_message_at: string;
  created_at: string;
}

export interface ConversationListResponse {
  conversations: ConversationItem[];
}

export interface FriendRequestListResponse {
  requests: FriendRequest[];
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    console.log('API Request:', {
      url,
      method: options.method || 'GET',
      hasToken: !!this.token,
      headers
    });

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (error) {
      // Fetch throws TypeError for network-level issues (server down, CORS/network, DNS, mixed-content).
      throw new Error(`NETWORK_ERROR: Cannot reach API at ${url}. ${(error as Error).message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  // Auth endpoints
  async login(username: string, password: string) {
    return this.request<{ access_token: string; token_type: string; user: User }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    );
  }

  async register(username: string, password: string) {
    return this.request<{ access_token: string; token_type: string; user: User }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    );
  }

  async getCurrentUser() {
    return this.request<User>('/auth/me');
  }

  async getUsers() {
    return this.request<User[]>('/auth/users');
  }

  // Chat endpoints
  async sendMessage(receiverId: string, content: string, messageType: 'text' | 'sign_text' = 'text') {
    return this.request<Message>('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        receiver_id: receiverId,
        content,
        message_type: messageType,
      }),
    });
  }

  async getMessages(peerId: string, limit = 20, cursor?: string) {
    const params = new URLSearchParams({
      limit: limit.toString(),
    });
    
    if (cursor) {
      params.append('cursor', cursor);
    }

    return this.request<MessageListResponse>(`/chat/messages/${peerId}?${params}`);
  }

  async editMessage(messageId: string, content: string) {
    return this.request<Message>(`/chat/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async recallMessage(messageId: string) {
    return this.request<{ message_id: string; is_recalled: boolean; recalled_at: string }>(
      `/chat/messages/${messageId}/recall`,
      {
        method: 'POST',
      }
    );
  }

  async markMessagesAsRead(peerId: string) {
    return this.request<{ updated_count: number; peer_id: string }>(
      '/chat/messages/read',
      {
        method: 'POST',
        body: JSON.stringify({ peer_id: peerId }),
      }
    );
  }

  // Friend endpoints
  async sendFriendRequest(receiverId: string) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(receiverId)) {
      throw new Error('Invalid user ID format');
    }
    
    return this.request<FriendRequest>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: receiverId }),
    });
  }

  async getFriendRequests() {
    return this.request<FriendRequestListResponse>('/friends/requests');
  }

  async respondToFriendRequest(requestId: string, accept: boolean) {
    return this.request<FriendRequest>(`/friends/requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
  }

  async getFriends() {
    return this.request<FriendListResponse>('/friends/');
  }

  async getConversations() {
    return this.request<ConversationListResponse>('/chat/conversations');
  }
}

export const apiClient = new ApiClient();
