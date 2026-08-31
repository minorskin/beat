'use client';
import { useEffect } from 'react';

/**
 * Geri alınamayan işlemler için tek tip onay kutusu.
 * Odak/ESC davranışı burada toplanıyor ki her çağıran yeniden uydurmasın.
 */
export default function ConfirmDialog({
  title, message, confirmLabel = 'Evet', cancelLabel = 'Vazgeç',
  danger = false, pending = false, onConfirm, onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 whitespace-normal text-left normal-case tracking-normal"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet w-full sm:max-w-sm p-4 sm:p-5"
      >
        <h2 className="text-sm font-medium mb-2">{title}</h2>
        <div className="text-[12px] mb-4" style={{ color: 'var(--muted)' }}>{message}</div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} disabled={pending} className="btn btn-ghost">
            {cancelLabel}
          </button>
          <button
            type="button" onClick={onConfirm} disabled={pending} autoFocus
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {pending ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
