"use client";
import { useEffect, useRef } from "react";

// A modal <dialog> that is open while it is mounted, for the app's panels
// (useAppView): Escape and a click on the backdrop call onClose, which goes back
// in history; closing hands focus back to where it was. Dialogs can stack.
export function Dialog({ className, style, onClose, children, ...labelling }: {
  className: string; style?: React.CSSProperties; onClose: () => void; children: React.ReactNode;
} & ({ "aria-labelledby": string } | { "aria-label": string })) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a click that also started on the backdrop closes it: lifting the
  // finger of the long press that opened it lands there too.
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  // The content fills the dialog, so only a click on the backdrop lands on the dialog itself.
  return <dialog ref={ref} className={className} style={style} {...labelling} onCancel={(e) => { e.preventDefault(); onClose(); }}
    onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
    onClick={(e) => { if (e.target === e.currentTarget && pressedBackdrop.current) onClose(); }}>
    {children}
  </dialog>;
}
