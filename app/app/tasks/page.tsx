import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { TasksApp } from "@/components/shared/CouplesApp";
import { appViewport } from "@/lib/apps";
import { tasksViews, viewFromParams } from "@/lib/app-views";
import { readSpace } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Tasks", robots: { index: false } };
export const viewport = appViewport;

// /tasks (it was Calendar's Tasks tab, /shared/tasks, which redirects here:
// next.config.ts), with the open panels in ?p= (hooks/useAppView.ts): the
// server renders the panels of the URL. Without a group, creating or joining one.
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const initial = viewFromParams(tasksViews, undefined, (await searchParams).p)!;
  const { id } = await requireUser("/tasks");
  const [user, space] = await Promise.all([findUserById(id), readSpace(id)]);
  if (!user) notFound();
  return <TasksApp user={user} initialSpace={space} initial={initial} version={process.env.APP_VERSION ?? "dev"} />;
}
