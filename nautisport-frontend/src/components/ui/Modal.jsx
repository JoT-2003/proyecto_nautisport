'use client';

import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer }) {
  // Cierra con la tecla Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-white shadow-xl rounded-lg border border-gray-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-3">
          <h3 className="text-lg font-extrabold uppercase tracking-wide text-black">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-500 hover:text-black text-xl leading-none"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 text-gray-900">{children}</div>
        {footer && <div className="border-t border-gray-300 px-5 py-3 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
