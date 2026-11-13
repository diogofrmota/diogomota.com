import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { SharedApp } from "@/components/shared/SharedApp";
import { appViewport } from "@/lib/apps";
import { sharedViews, viewFromParams } from "@/lib/app-views";
import { readSpace } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Shared", robots: { index: false } };
export const viewport = appViewport;

// /shared, /shared/tasks, /shared/settings, with the open panels in ?p=
// (hooks/useAppView.ts): the server renders the view and panels of the URL.
export default async function SharedPage({ params, searchParams }: PageProps<"/shared/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(sharedViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/shared/${view.join("/")}` : "/shared");
  const [user, space] = await Promise.all([findUserById(id), readSpace(id)]);
  if (!user) notFound();
  return <SharedApp user={user} initialSpace={space} initial={initial} version={process.env.APP_VERSION ?? "dev"} />;
}
