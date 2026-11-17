import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { BenficaApp } from "@/components/benfica/BenficaApp";
import { appViewport } from "@/lib/apps";
import { benficaViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Benfica", robots: { index: false } };
export const viewport = appViewport;

export default async function BenficaPage({ params, searchParams }: PageProps<"/benfica/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(benficaViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/benfica/${view.join("/")}` : "/benfica");
  const user = await findUserById(id);
  if (!user) notFound();
  return (
    <BenficaApp
      user={{ id, username: user.username, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}
