import { getSession } from "@/auth";
import { AvatarError, avatarMaxBytes, removeAvatar, saveAvatar } from "@/lib/avatars";
import { fromThisSite, HttpError } from "@/lib/http";
import { avatarUploadLimit } from "@/lib/rate-limit";
import { boundedFormData } from "@/lib/upload-body";

// The user's own profile picture, set in /account (components/account/AccountSettings,
// AvatarForm): POST a multipart form with the file as `picture` to set it, DELETE
// to remove it. Both answer { data: { avatarUrl } } (null once removed), or an
// { error }. lib/avatars.ts makes the file small and keeps it.

const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

const tooBig = `That picture is over ${avatarMaxBytes / 1024 / 1024} MB. Try a smaller one.`;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Please log in again.", 401);
  if (!fromThisSite(request)) return fail("Request must come from this site.", 403);
  if (!avatarUploadLimit(session.user.id))
    return fail("Too many pictures at once. Wait a few minutes and try again.", 429);
  let picture: FormDataEntryValue | null;
  try {
    // The form around the file adds a little to its size. Counted as it is
    // read, so a body without a Content-Length (chunked) is held to it too.
    picture = (await boundedFormData(request, avatarMaxBytes + 64 * 1024, tooBig)).get("picture");
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message, error.status);
    return fail("Send the picture as a file.", 400);
  }
  if (!(picture instanceof File) || picture.size === 0) return fail("Choose a picture.", 400);
  if (picture.size > avatarMaxBytes) return fail(tooBig, 413);

  try {
    const avatarUrl = await saveAvatar(session.user.id, Buffer.from(await picture.arrayBuffer()));
    return Response.json({ data: { avatarUrl } }, { headers });
  } catch (error) {
    if (error instanceof AvatarError) return fail(error.message, error.status);
    console.error("Profile picture upload failed", error);
    return fail("Something went wrong. Please try again.", 500);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return fail("Please log in again.", 401);
  if (!fromThisSite(request)) return fail("Request must come from this site.", 403);
  try {
    await removeAvatar(session.user.id);
    return Response.json({ data: { avatarUrl: null } }, { headers });
  } catch (error) {
    console.error("Profile picture removal failed", error);
    return fail("Something went wrong. Please try again.", 500);
  }
}
