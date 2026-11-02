import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { ShowsApp } from "@/components/shows/ShowsApp";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";

// The Shows app. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Shows", robots: { index: false } };

export const viewport = appViewport;

export default async function ShowsPage() {
  const { id } = await requireUser("/shows");
  const user = await findUserById(id);
  if (!user) notFound();

  return <ShowsApp username={user.username} theme={user.themePreference} />;
}
