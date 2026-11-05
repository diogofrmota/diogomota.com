import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { GlobalSettings } from "@/components/settings/GlobalSettings";
import { appViewport } from "@/lib/apps";
import { readSpace, spaceTransaction } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Global Settings", robots: { index: false } };

export const viewport = appViewport;

// Global Settings: every app's settings on one page, one app at a time
// (?app=shared or ?app=shows, read by GlobalSettings; the first app without
// one). The account menu opens it on the app it's in. proxy.ts keeps
// logged-out users out.
export default async function SettingsPage() {
  const { id } = await requireUser("/settings");
  const [user, space] = await Promise.all([findUserById(id), spaceTransaction((db) => readSpace(db, id))]);
  if (!user) notFound();

  return <GlobalSettings user={user} initialSpace={space} />;
}
