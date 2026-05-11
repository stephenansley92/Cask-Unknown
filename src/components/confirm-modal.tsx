"use client";

import { useEffect } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dangerous = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-xl animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-extrabold text-zinc-900">{title}</div>
        <div className="mt-2 text-sm text-zinc-600 whitespace-pre-line">{message}</div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className={[
              "w-full px-4 py-3 rounded-2xl font-semibold text-sm",
              dangerous
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-zinc-900 hover:bg-zinc-800 text-white",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-3 rounded-2xl font-semibold text-sm bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
