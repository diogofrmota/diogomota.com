import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { ShowsApp } from "@/components/shows/ShowsApp";
import { appViewport } from "@/lib/apps";
import { showsViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";

// The Shows app. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Shows", robots: { index: false } };

export const viewport = appViewport;

// /shows, /shows/discover, /shows/profile, with the open panels in ?p=
// (hooks/useAppView.ts): the server renders the view and panels of the URL.
export default async function ShowsPage({ params, searchParams }: PageProps<"/shows/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const friend = [p ?? []]
    .flat()
    .find((panel) => panel.startsWith("friend:"))
    ?.slice(7);
  if (friend) redirect(`/social/profile/${encodeURIComponent(friend)}`);
  if (view?.length === 1 && view[0] === "profile") redirect("/social/profile");
  const initial = viewFromParams(showsViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/shows/${view.join("/")}` : "/shows");
  const user = await findUserById(id);
  if (!user) notFound();

  const { username, name, avatarUrl } = user;
  return (
    <ShowsApp
      user={{ id, username, name, avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}
