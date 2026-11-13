import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, SettingsIcon, UserIcon } from "@/components/common/icons";
import { appViewport } from "@/lib/apps";
import { viewFromParams } from "@/lib/app-views";
import { testHooksEnabled } from "@/lib/test-hooks";
import { defaultTheme } from "@/lib/themes";
import { PanelsView } from "./PanelsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "App shell test", robots: { index: false } };

export const viewport = appViewport;

const views = ["one", "two", "three"];

// For the e2e tests (e2e/app-shell.spec.ts): an app shell with nothing else in
// it, whose views open stacking panels and refresh the router, so the history
// handling is tested on its own: /test/app-shell, /test/app-shell/two, with
// the panels in ?p=. Not found unless test hooks are on, so never in production.
export default async function AppShellTestPage({ params, searchParams }: PageProps<"/test/app-shell/[[...view]]">) {
  if (!testHooksEnabled()) notFound();
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(views, view, p);
  if (!initial) notFound();

  return (
    <AppShell
      name="Test"
      basePath="/test/app-shell"
      initial={initial}
      username="tester"
      theme={defaultTheme}
      tabs={[
        { id: "one", label: "One", icon: <CalendarIcon />, view: <PanelsView title="One" /> },
        { id: "two", label: "Two", icon: <UserIcon />, view: <PanelsView title="Two" /> },
        { id: "three", label: "Three", icon: <SettingsIcon />, view: <PanelsView title="Three" /> },
      ]}
    />
  );
}
