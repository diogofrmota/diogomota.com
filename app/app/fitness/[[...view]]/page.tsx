import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { FitnessApp } from "@/components/fitness/FitnessApp";
import { appViewport } from "@/lib/apps";
import { fitnessViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";

// The Fitness app. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Fitness", robots: { index: false } };

export const viewport = appViewport;

// /fitness, /fitness/workouts, /fitness/progress, with the open panels in ?p=
// (hooks/useAppView.ts): the server renders the view and panels of the URL.
export default async function FitnessPage({ params, searchParams }: PageProps<"/fitness/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(fitnessViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/fitness/${view.join("/")}` : "/fitness");
  const user = await findUserById(id);
  if (!user) notFound();
  return (
    <FitnessApp
      user={{ id, username: user.username, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}
