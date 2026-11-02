"use client";
import { useEffect, useRef } from "react";

// A modal <dialog> that is open while it is mounted, for the app's panels
// (useAppView): Escape and a click on the backdrop call onClose, which goes back
// in history; closing hands focus back to where it was. Dialogs can stack.
export function Dialog({ className, onClose, children, ...labelling }: {
  className: string; onClose: () => void; children: React.ReactNode;
} & ({ "aria-labelledby": string } | { "aria-label": string })) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  // The content fills the dialog, so only a click on the backdrop lands on the dialog itself.
  return <dialog ref={ref} className={className} {...labelling} onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}
