"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ReaderDialog({ open, onClose, title, closeLabel, children, archive = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  archive?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className={`editorial-dialog ${archive ? "archive-dialog" : ""}`}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex='0']"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="dialog-heading">
        <h2>{title}</h2>
        <button type="button" className="reader-icon-button" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X size={20} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </dialog>,
    document.body
  );
}
