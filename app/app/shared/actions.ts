"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

// Called once the user's space has changed (created, joined, left)
// through /api/shared/spaces. The browser keeps the pages it has shown for back
// and forward as the server rendered them, such as /shared from before there
// was a space; this makes /shared render again when next shown. The change
// itself is in the API, which checks it; this only refreshes.
export async function spaceChanged(): Promise<void> {
  if (!(await auth())) return;
  revalidatePath("/shared");
}
