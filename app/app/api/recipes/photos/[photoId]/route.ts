import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { readPhotoFile } from "@/lib/recipe-photos";
import { ownsPhoto, removePhoto } from "@/lib/recipes";

// GET /api/recipes/photos/:photoId: a photo of one of your recipes (WebP), the
// large one, or with ?size=thumb the card's. Only yours: another's is a 404.
// A photo never changes (a new one is a new id), so browsers keep it for good.
// Not rate limited: a list of recipes loads one for each.
export const GET = apiRoute({ label: "Loading a recipe photo" }, async ({ user, params, searchParams }) => {
  const missing = Response.json({ error: "No photo." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!(await ownsPhoto(user.id, params.photoId))) return missing;
  const photo = await readPhotoFile(params.photoId, searchParams.get("size") === "thumb" ? "thumb" : "large");
  if (!photo) return missing;
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(photo.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// DELETE: takes the photo off its recipe, and deletes its files; answers with the recipe.
export const DELETE = apiRoute({ label: "Deleting a recipe photo", limit: recipesRequestLimit }, ({ user, params }) =>
  removePhoto(user.id, params.photoId),
);
