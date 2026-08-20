"use client";

import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "amber";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirm dialog used in place of native `confirm()`. Focus-traps
 * inside the dialog, closes on Escape, restores focus to the trigger, and
 * supports destructive (danger) styling for irreversible actions.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    const first = focusables()[0] ?? dialog;
    first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [onCancel]);

  const confirmStyles =
    variant === "danger"
      ? "border-red-500 text-red-300 hover:bg-red-500/20"
      : "border-amber-500 text-amber-300 hover:bg-amber-500/20";

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-[#021526] border border-[#1C598C] rounded-lg shadow-2xl max-w-md w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="p-5">
          <h2 id="confirm-dialog-title" className="text-xl text-white font-semibold mb-2">
            {title}
          </h2>
          <div id="confirm-dialog-message" className="text-blue-200 text-sm mb-6">
            {message}
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={busy}
              aria-label={`Cancel ${title.toLowerCase()}`}
              className="px-4 py-2 border border-gray-600 rounded text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              aria-label={confirmLabel ?? "Confirm"}
              className={`px-4 py-2 border rounded transition-colors disabled:opacity-50 ${confirmStyles}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}