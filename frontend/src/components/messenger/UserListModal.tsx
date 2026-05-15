import { User } from '@/services/api';
import { formatDate, getAvatarUrl } from './utils';

interface UserListModalProps {
  isOpen: boolean;
  isLoading: boolean;
  users: User[];
  onClose: () => void;
  onSendFriendRequest: (userId: string) => void;
}

export default function UserListModal({
  isOpen,
  isLoading,
  users,
  onClose,
  onSendFriendRequest,
}: UserListModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl w-[400px] max-h-[500px] flex flex-col border border-surface-variant">
        <div className="p-4 border-b border-surface-variant flex items-center justify-between">
          <h2 className="font-h2-header text-h2-header text-on-surface">Add Friends</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-on-surface-variant">Loading users...</span>
            </div>
          ) : users.length === 0 ? (
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
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      alt={`${user.username} Avatar`}
                      className="w-10 h-10 rounded-full object-cover border border-surface-variant"
                      src={getAvatarUrl(user.username)}
                    />
                    <div>
                      <p className="font-body-lg text-body-lg text-on-surface">{user.username}</p>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        Joined {formatDate(user.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onSendFriendRequest(user.id)}
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
  );
}
