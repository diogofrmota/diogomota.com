import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { SharedApp } from "@/components/shared/SharedApp";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";
import { readSpace, spaceTransaction } from "@/lib/spaces";

export const metadata: Metadata = { title: "Shared", robots: { index: false } };
export const viewport = appViewport;
export default async function SharedPage() {
  const { id } = await requireUser("/shared");
  const [user, space] = await Promise.all([findUserById(id), spaceTransaction((db) => readSpace(db, id))]);
  if (!user) notFound();
  return <SharedApp user={user} initialSpace={space} />;
}
