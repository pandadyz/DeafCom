interface MessengerNavRailProps {
  onLogout: () => void;
}

export default function MessengerNavRail({ onLogout }: MessengerNavRailProps) {
  return (
    <nav className="w-[64px] h-full bg-surface-container-lowest border-r border-surface-variant flex flex-col items-center py-lg z-50 flex-shrink-0">
      <div className="mb-xl text-primary">
        <span className="material-symbols-outlined text-h1-display" data-weight="fill">
          chat
        </span>
      </div>
      <div className="flex flex-col gap-lg flex-1">
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined">group</span>
        </button>
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined">storefront</span>
        </button>
      </div>
      <div className="flex flex-col gap-md mt-auto">
        <button
          onClick={onLogout}
          className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          title="Đăng xuất"
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </div>
    </nav>
  );
}
