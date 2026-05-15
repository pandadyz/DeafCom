import type { ToastState } from './types';

interface MessengerToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export default function MessengerToast({ toast, onDismiss }: MessengerToastProps) {
  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all duration-300 ${
        toast.type === 'success'
          ? 'bg-green-600 text-white'
          : toast.type === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-surface-container text-on-surface border border-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">
        {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
      </span>
      {toast.message}
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100">
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}
