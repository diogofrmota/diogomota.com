import "server-only";
import { mkdir, readFile, rm } from "node:fs/promises";
import { writeAtomically } from "./write-atomically";
import path from "node:path";
import sharp from "sharp";

// Recipes' photos (the Recipes app). As the profile pictures (lib/avatars.ts),
// each is a file on the server's own disk, beside them on the app's data volume
// (Dockerfile, docker-compose.prod.yml) and archived with every backup
// (infra/backup.sh): RECIPE_PHOTO_DIR/<photo id>.webp, and a smaller copy for
// the cards, <photo id>-thumb.webp. The database has its row in recipe_photos
// (lib/recipes.ts), with the large one's size.
//
// Whatever comes in is made smaller: upright (as its EXIF says), at most 1,600
// px a side for a recipe's page (sharp on a phone's 3x screen, a dish fills
// the width of a dialog), and 640x480 cut around what stands out for a card;
// WebP, without its metadata (such as where it was taken). A phone photo of
// several megabytes comes out at 150–400 KB, and its card at 30–60 KB.

/** The largest file accepted, before it is made smaller: as a profile picture's. nginx lets 21 MB through. */
export const photoMaxBytes = 20 * 1024 * 1024;
/** The most pixels a photo may have: a 64-megapixel phone photo, with room to spare. */
const maxPixels = 70_000_000;
const largeSide = 1600;
const thumb = { width: 640, height: 480 };

export class PhotoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Outside the build's file tracing (turbopackIgnore): it is where photos are
// written while the app runs, not a part of the app.
function photoDir(): string {
  return process.env.RECIPE_PHOTO_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "recipe-photos");
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A photo's file. Only ever called with a UUID, so the name can't leave the folder. */
function photoFile(id: string, size: "large" | "thumb"): string {
  if (!uuidPattern.test(id)) throw new PhotoError("Not found.", 404);
  return path.join(photoDir(), `${id.toLowerCase()}${size === "thumb" ? "-thumb" : ""}.webp`);
}

export type ProcessedPhoto = { large: Buffer; thumb: Buffer; width: number; height: number };

const unreadable = "That file isn't a photo that can be read. Try a JPEG, PNG or WebP.";

/** Makes the two copies of a photo that are kept. Throws PhotoError for anything that isn't one sharp reads. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let size: { width?: number; height?: number };
  try {
    size = await sharp(input).metadata();
  } catch {
    throw new PhotoError(unreadable);
  }
  if ((size.width ?? 0) * (size.height ?? 0) > maxPixels)
    throw new PhotoError("That photo has too many pixels. Try a smaller one.");
  const image = () => sharp(input, { limitInputPixels: maxPixels, failOn: "error" }).rotate();
  try {
    const [large, small] = await Promise.all([
      image()
        .resize(largeSide, largeSide, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true }),
      image()
        .resize(thumb.width, thumb.height, { fit: "cover", position: sharp.strategy.attention })
        .webp({ quality: 75 })
        .toBuffer(),
    ]);
    return { large: large.data, thumb: small, width: large.info.width, height: large.info.height };
  } catch {
    throw new PhotoError(unreadable);
  }
}

/** Keeps a processed photo's two files, as the photo `id`. */
export async function savePhotoFiles(id: string, photo: ProcessedPhoto): Promise<void> {
  await mkdir(photoDir(), { recursive: true });
  try {
    await writeAtomically(photoFile(id, "large"), photo.large);
    await writeAtomically(photoFile(id, "thumb"), photo.thumb);
  } catch (error) {
    await removePhotoFiles([id]);
    throw error;
  }
}

/** A photo's file (WebP), or null when there is none. */
export async function readPhotoFile(id: string, size: "large" | "thumb"): Promise<Buffer | null> {
  try {
    return await readFile(photoFile(id, size));
  } catch (error) {
    if (error instanceof PhotoError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Deletes these photos' files (those that are there). */
export async function removePhotoFiles(ids: readonly string[]): Promise<void> {
  await Promise.all(
    ids
      .filter((id) => uuidPattern.test(id))
      .flatMap((id) => [rm(photoFile(id, "large"), { force: true }), rm(photoFile(id, "thumb"), { force: true })]),
  );
}
