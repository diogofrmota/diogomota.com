"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import type { FormState } from "@/lib/form-state";
import { HttpError } from "@/lib/http";
import { appsWithNext } from "@/lib/next-path";
import { spaceJoinLimit } from "@/lib/rate-limit";
import { joinInput } from "@/lib/schemas";
import { joinSpace } from "@/lib/spaces";

/** Joins the space of an invite link's code, then opens Shared on it. */
export async function joinWithLink(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = joinInput.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "This invite link isn't right. Ask for a new one." };
  const session = await getSession();
  if (!session) redirect(appsWithNext(`/join/${parsed.data.code}`));
  if (!spaceJoinLimit(session.user.id)) return { error: "Too many attempts. Try again in 15 minutes." };
  try {
    await joinSpace(session.user.id, parsed.data.code);
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    throw error;
  }
  revalidatePath("/shared");
  redirect("/shared");
}
