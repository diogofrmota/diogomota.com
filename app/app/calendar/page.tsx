import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { CalendarApp } from "@/components/shared/CouplesApp";
import { appViewport } from "@/lib/apps";
import { calendarViews, viewFromParams } from "@/lib/app-views";
import { readSpace } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Calendar", robots: { index: false } };
export const viewport = appViewport;

// /calendar (it was /shared, which redirects here: next.config.ts), with the
// open panels in ?p= (hooks/useAppView.ts): the server renders the panels of
// the URL. Without a group, creating or joining one.
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const initial = viewFromParams(calendarViews, undefined, (await searchParams).p)!;
  const { id } = await requireUser("/calendar");
  const [user, space] = await Promise.all([findUserById(id), readSpace(id)]);
  if (!user) notFound();
  return <CalendarApp user={user} initialSpace={space} initial={initial} version={process.env.APP_VERSION ?? "dev"} />;
}
