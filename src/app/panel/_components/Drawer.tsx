'use client';

/**
 * Drawer lateral para formularios de alta/edición. Accesible: role=dialog,
 * cierra con Escape y con click en el scrim, restaura foco y bloquea scroll.
 */

import { useEffect, useRef } from 'react';

export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="panel-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="panel-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="panel-drawer-head">
          <h2 className="panel-drawer-title">{title}</h2>
          <button
            type="button"
            className="panel-drawer-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="panel-drawer-body">{children}</div>
        {footer && <div className="panel-drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
