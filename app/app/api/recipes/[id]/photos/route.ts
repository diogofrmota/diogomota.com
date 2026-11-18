import { getSession } from "@/auth";
import { fromThisSite, HttpError } from "@/lib/http";
import { recipePhotoUploadLimit } from "@/lib/rate-limit";
import { PhotoError, photoMaxBytes, processPhoto } from "@/lib/recipe-photos";
import { addPhoto, checkPhotoRoom } from "@/lib/recipes";
import { boundedFormData } from "@/lib/upload-body";

// POST /api/recipes/:id/photos, a multipart form with the file as `photo`: adds
// a photo to the end of one of your recipes (its cover, if it's the first), up
// to 10. Answers { data: recipe }, or an { error }. lib/recipe-photos.ts makes
// it smaller and keeps it. nginx lets 21 MB through to this path.

const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
const tooBig = `That photo is over ${photoMaxBytes / 1024 / 1024} MB. Try a smaller one.`;

export async function POST(request: Request, { params }: RouteContext<"/api/recipes/[id]/photos">) {
  const session = await getSession();
  if (!session) return fail("Please log in again.", 401);
  if (!fromThisSite(request)) return fail("Request must come from this site.", 403);
  if (!recipePhotoUploadLimit(session.user.id))
    return fail("Too many photos at once. Wait a few minutes and try again.", 429);
  // The form around the file adds a little to its size.
  if (Number(request.headers.get("content-length")) > photoMaxBytes + 64 * 1024) return fail(tooBig, 413);

  try {
    const { id } = await params;
    await checkPhotoRoom(session.user.id, id);
    let photo: FormDataEntryValue | null;
    try {
      photo = (await boundedFormData(request, photoMaxBytes + 64 * 1024, tooBig)).get("photo");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return fail("Send the photo as a file.", 400);
    }
    if (!(photo instanceof File) || photo.size === 0) return fail("Choose a photo.", 400);
    if (photo.size > photoMaxBytes) return fail(tooBig, 413);
    const processed = await processPhoto(Buffer.from(await photo.arrayBuffer()));
    return Response.json({ data: await addPhoto(session.user.id, id, processed) }, { status: 201, headers });
  } catch (error) {
    if (error instanceof PhotoError || error instanceof HttpError) return fail(error.message, error.status);
    console.error("Recipe photo upload failed", error);
    return fail("Something went wrong. Please try again.", 500);
  }
}
