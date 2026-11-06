import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/common/AppShell";
import { appViewport } from "@/lib/apps";
import { testHooksEnabled } from "@/lib/test-hooks";
import { PanelsView } from "./PanelsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "App shell test", robots: { index: false } };

export const viewport = appViewport;

// For the e2e tests (e2e/app-shell.spec.ts): an app shell with nothing else in
// it, whose views open stacking panels and refresh the router, so the history
// handling is tested on its own. Not found unless test hooks are on, so never
// in production.
export default function AppShellTestPage() {
  if (!testHooksEnabled()) notFound();

  return (
    <AppShell
      name="Test"
      username="tester"
      theme="dark"
      tabs={[
        { id: "one", label: "One", view: <PanelsView title="One" /> },
        { id: "two", label: "Two", view: <PanelsView title="Two" /> },
        { id: "three", label: "Three", view: <PanelsView title="Three" /> },
      ]}
    />
  );
}
