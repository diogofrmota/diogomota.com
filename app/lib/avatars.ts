import "server-only";
import { mkdir, readFile, rm } from "node:fs/promises";
import { writeAtomically } from "./write-atomically";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "./http";
import { isUuid } from "./schemas";
import { maxImagePixels } from "./upload-body";
import { clearAvatarUpdated, setAvatarUpdated } from "./users";

// Profile pictures, set in /account. Each is a file on the server's own disk,
// AVATAR_DIR/<user id>.webp: in production the app's data volume (Dockerfile,
// docker-compose.prod.yml), archived with every backup (infra/backup.sh). The
// database only has when it was last set (users.avatar_updated_at), which is in
// its URL (lib/users.ts, avatarUrlSql).
//
// Whatever comes in is made small, though not much: a few friends use the
// site, so a picture only needs to look sharp in a circle up to 56px wide on a
// 3x screen. So: upright, cut to a square, 512 px a side, WebP at quality 82,
// without its metadata (such as where it was taken). That's 20–60 KB, from a
// phone photo of several megabytes.

/** The side of the square that is saved, in pixels. */
const side = 512;

// Outside the build's file tracing (turbopackIgnore): it is where pictures are
// written while the app runs, not a part of the app.
function avatarDir(): string {
  return process.env.AVATAR_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "avatars");
}

/** The file of a user's picture. Only ever called with a UUID, so the name can't leave the folder. */
function avatarFile(userId: string): string {
  if (!isUuid(userId)) throw new HttpError("Not found.", 404);
  return path.join(avatarDir(), `${userId.toLowerCase()}.webp`);
}

/**
 * Makes a profile picture of `input`: turned upright (as its EXIF says), cut
 * to a square around what stands out in it (sharp's "attention" strategy,
 * which favours faces and detail over a plain middle), 512 px a side, WebP.
 * sharp leaves the metadata out. Throws a 400 HttpError for anything it can't read.
 */
async function compress(input: Buffer): Promise<Buffer> {
  let size: { width?: number; height?: number };
  try {
    size = await sharp(input).metadata();
  } catch {
    throw new HttpError("That file isn't a picture that can be read. Try a JPEG, PNG or WebP.");
  }
  if ((size.width ?? 0) * (size.height ?? 0) > maxImagePixels) {
    throw new HttpError("That picture has too many pixels. Try a smaller one.");
  }
  try {
    return await sharp(input, { limitInputPixels: maxImagePixels, failOn: "error" })
      .rotate()
      .resize(side, side, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new HttpError("That file isn't a picture that can be read. Try a JPEG, PNG or WebP.");
  }
}

/** Makes `input` the user's profile picture, and returns its URL. */
export async function saveAvatar(userId: string, input: Buffer): Promise<string> {
  const file = avatarFile(userId);
  const picture = await compress(input);
  await mkdir(path.dirname(file), { recursive: true });
  await writeAtomically(file, picture);
  const url = await setAvatarUpdated(userId);
  if (!url) {
    // The account was deleted meanwhile.
    await rm(file, { force: true });
    throw new HttpError("Please log in again.", 401);
  }
  return url;
}

/** Removes the user's profile picture, if they have one. */
export async function removeAvatar(userId: string): Promise<void> {
  await clearAvatarUpdated(userId);
  await rm(avatarFile(userId), { force: true });
}

/** A user's profile picture (WebP), or null when they have none. */
export async function readAvatar(userId: string): Promise<Buffer | null> {
  try {
    return await readFile(avatarFile(userId));
  } catch (error) {
    if (error instanceof HttpError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
