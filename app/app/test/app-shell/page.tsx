import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, HomeIcon, SettingsIcon } from "@/components/common/icons";
import { appViewport } from "@/lib/apps";
import { testHooksEnabled } from "@/lib/test-hooks";
import { PanelsView } from "./PanelsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "App shell test", robots: { index: false } };

export const viewport = appViewport;

// For the e2e tests (e2e/app-shell.spec.ts): an app shell whose views open
// panels and refresh the router, which the real apps' placeholder views don't
// yet. Not found unless test hooks are on, so never in production.
export default function AppShellTestPage() {
  if (!testHooksEnabled()) notFound();

  return (
    <AppShell
      name="Test"
      username="tester"
      theme="dark"
      tabs={[
        { id: "one", label: "One", icon: <HomeIcon />, view: <PanelsView title="One" /> },
        { id: "two", label: "Two", icon: <CalendarIcon />, view: <PanelsView title="Two" /> },
        { id: "three", label: "Three", icon: <SettingsIcon />, view: <PanelsView title="Three" /> },
      ]}
    />
  );
}
