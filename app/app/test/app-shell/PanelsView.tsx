"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useAppView } from "@/hooks/useAppView";

// A view with two stacking panels and a router refresh (which makes Next.js
// replace the current history entry's state), for the app shell tests.
export function PanelsView({ title }: { title: string }) {
  const { panels, openPanel, closePanel, setView } = useAppView();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <section>
      <h1>{title}</h1>
      <p>
        <button type="button" onClick={() => openPanel("first")}>
          Open panel
        </button>{" "}
        <button type="button" onClick={() => startRefresh(() => router.refresh())}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </p>
      {panels.includes("first") && (
        <div role="dialog" aria-label="First panel">
          <button type="button" onClick={() => openPanel("second")}>
            Open second panel
          </button>{" "}
          <button type="button" onClick={() => setView("three")}>
            Go to Three
          </button>{" "}
          <button type="button" onClick={closePanel}>
            Close
          </button>
        </div>
      )}
      {panels.includes("second") && (
        <div role="dialog" aria-label="Second panel">
          <button type="button" onClick={closePanel}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
