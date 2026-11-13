"use client";

import { useFormStatus } from "react-dom";
import { clearOfflineData } from "@/components/common/QueryProvider";
import { InlineSpinner, PendingOverlay } from "@/components/common/Spinner";

/**
 * Log out, as the submit button of a form whose action logs out (logOut):
 * pressed, it can't be pressed again, and a spinner shows until the page
 * changes. With `icon` (the account menu), the spinner takes the icon's place;
 * without, it turns over the label. What the apps kept on this device for
 * offline use goes too (components/common/QueryProvider).
 */
export function LogoutButton({ className, icon }: { className: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={clearOfflineData}
    >
      {icon !== undefined && (pending ? <InlineSpinner /> : icon)}
      Log out
      {icon === undefined && <PendingOverlay pending={pending} />}
    </button>
  );
}
