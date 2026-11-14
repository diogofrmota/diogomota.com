"use client";

import { useLinkStatus } from "next/link";
import { IconSwap } from "./motion";
import { InlineSpinner, PendingOverlay } from "./Spinner";

/**
 * Inside a <Link>: shows that the page it opens is loading, from the click
 * until it's there (the apps' pages have no loading screen: their theme is
 * only known once the server has rendered them). With `icon`, a spinner takes
 * the icon's place, the two crossfading; without, it turns over the link's
 * label (PendingOverlay), for links drawn as buttons.
 */
export function LinkPending({ icon }: { icon?: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (icon !== undefined)
    return <IconSwap swapKey={pending ? "pending" : "icon"}>{pending ? <InlineSpinner /> : icon}</IconSwap>;
  return <PendingOverlay pending={pending} />;
}
