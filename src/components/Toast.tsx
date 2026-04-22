import { useStore } from '../store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toast) return null;

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 fade-new">
      <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-ink-800 border border-ink-700 shadow-lg text-sm">
        <span>{toast.message}</span>
        {toast.actionLabel && (
          <button
            onClick={() => {
              toast.onAction?.();
              dismiss();
            }}
            className="text-accent-400 hover:text-accent-300"
          >
            {toast.actionLabel}
          </button>
        )}
        <button onClick={dismiss} className="text-ink-500 hover:text-ink-200">
          ✕
        </button>
      </div>
    </div>
  );
}
