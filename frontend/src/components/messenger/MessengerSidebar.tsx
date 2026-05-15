import type { Chat } from './types';

interface MessengerSidebarProps {
  chats: Chat[];
  selectedChat: string | null;
  isLoadingConversations: boolean;
  friendRequestCount: number;
  onSelectChat: (chatId: string) => void;
  onOpenUserList: () => void;
  onOpenFriendRequests: () => void;
}

export default function MessengerSidebar({
  chats,
  selectedChat,
  isLoadingConversations,
  friendRequestCount,
  onSelectChat,
  onOpenUserList,
  onOpenFriendRequests,
}: MessengerSidebarProps) {
  return (
    <aside className="w-sidebar-width h-full bg-surface-container-lowest border-r border-surface-variant flex flex-col z-40 flex-shrink-0">
      <div className="p-md flex flex-col gap-md border-b border-surface-variant">
        <div className="flex justify-between items-center">
          <h1 className="font-h1-display text-h1-display text-on-surface">Chats</h1>
          <div className="flex gap-sm">
            <button
              onClick={onOpenUserList}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">person_add</span>
            </button>
            <button
              onClick={onOpenFriendRequests}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors relative"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              {friendRequestCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-surface-container-lowest" />
              )}
            </button>
            <button className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors">
              <span className="material-symbols-outlined text-[20px]">more_horiz</span>
            </button>
            <button className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors">
              <span className="material-symbols-outlined text-[20px]">edit_square</span>
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
          <div className="flex flex-col gap-2 p-md">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-sm animate-pulse">
                <div className="w-10 h-10 rounded-full bg-surface-container-high" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-container-high rounded w-3/4" />
                  <div className="h-2 bg-surface-container-high rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-on-surface-variant">
              No conversations yet. Add friends to start chatting!
            </span>
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
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
  );
}
