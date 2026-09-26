"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

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
  const titleId = useId();
  const messageId = useId();

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-2xl shadow-black/50 animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} className="font-display text-xl font-semibold text-fg">
          {title}
        </div>
        <div id={messageId} className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
          {message}
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            autoFocus
            variant={dangerous ? "danger" : "primary"}
            size="lg"
            block
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" size="lg" block onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
