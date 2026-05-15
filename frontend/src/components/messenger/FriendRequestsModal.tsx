import { FriendRequest, User } from '@/services/api';
import { formatDate, getAvatarUrl } from './utils';

interface FriendRequestsModalProps {
  isOpen: boolean;
  friendRequests: FriendRequest[];
  allUsers: User[];
  respondingRequests: Set<string>;
  onClose: () => void;
  onRespond: (requestId: string, accept: boolean) => void;
}

export default function FriendRequestsModal({
  isOpen,
  friendRequests,
  allUsers,
  respondingRequests,
  onClose,
  onRespond,
}: FriendRequestsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl w-[450px] max-h-[600px] flex flex-col border border-surface-variant">
        <div className="p-4 border-b border-surface-variant flex items-center justify-between">
          <h2 className="font-h2-header text-h2-header text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">notifications</span>
            Friend Requests
            {friendRequests.length > 0 && (
              <span className="bg-primary text-on-primary text-xs px-2 py-1 rounded-full">
                {friendRequests.length}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
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
                const sender = allUsers.find((u) => u.id === request.sender_id);
                return (
                  <div
                    key={request.id}
                    className="bg-surface-container rounded-lg p-4 border border-surface-variant"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          alt={`${sender?.username || 'User'} Avatar`}
                          className="w-12 h-12 rounded-full object-cover border border-surface-variant"
                          src={getAvatarUrl(sender?.username || request.sender_id)}
                        />
                        <div>
                          <p className="font-body-lg text-body-lg text-on-surface">
                            <strong>{sender?.username || 'Unknown User'}</strong> wants to be your
                            friend
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Sent {formatDate(request.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onRespond(request.id, false)}
                          disabled={respondingRequests.has(request.id)}
                          className="px-3 py-1.5 rounded-full bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80 transition-colors font-label-caps text-label-caps disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {respondingRequests.has(request.id) ? 'Processing...' : 'Decline'}
                        </button>
                        <button
                          onClick={() => onRespond(request.id, true)}
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
  );
}
