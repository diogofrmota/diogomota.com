import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AVATAR_MAX_BYTES } from "./account-rules";
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

/** The largest file accepted, before it is made smaller (lib/account-rules.ts). */
export const avatarMaxBytes = AVATAR_MAX_BYTES;
/** The most pixels a picture may have: a 64-megapixel phone photo, with room to spare. */
const maxPixels = 70_000_000;
/** The side of the square that is saved, in pixels. */
const side = 512;

export class AvatarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Outside the build's file tracing (turbopackIgnore): it is where pictures are
// written while the app runs, not a part of the app.
function avatarDir(): string {
  return process.env.AVATAR_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "avatars");
}

/** The file of a user's picture. Only ever called with a UUID, so the name can't leave the folder. */
function avatarFile(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    throw new AvatarError("Not found.", 404);
  return path.join(avatarDir(), `${userId.toLowerCase()}.webp`);
}

/**
 * Makes a profile picture of `input`: turned upright (as its EXIF says), cut
 * to a square around what stands out in it (sharp's "attention" strategy,
 * which favours faces and detail over a plain middle), 512 px a side, WebP.
 * sharp leaves the metadata out. Throws AvatarError for anything it can't read.
 */
async function compress(input: Buffer): Promise<Buffer> {
  let size: { width?: number; height?: number };
  try {
    size = await sharp(input).metadata();
  } catch {
    throw new AvatarError("That file isn't a picture that can be read. Try a JPEG, PNG or WebP.");
  }
  if ((size.width ?? 0) * (size.height ?? 0) > maxPixels) {
    throw new AvatarError("That picture has too many pixels. Try a smaller one.");
  }
  try {
    return await sharp(input, { limitInputPixels: maxPixels, failOn: "error" })
      .rotate()
      .resize(side, side, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AvatarError("That file isn't a picture that can be read. Try a JPEG, PNG or WebP.");
  }
}

/** Makes `input` the user's profile picture, and returns its URL. */
export async function saveAvatar(userId: string, input: Buffer): Promise<string> {
  const file = avatarFile(userId);
  const picture = await compress(input);
  await mkdir(path.dirname(file), { recursive: true });
  // Written beside it, then renamed over it: a picture being read is never half written.
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, picture);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  const url = await setAvatarUpdated(userId);
  if (!url) {
    // The account was deleted meanwhile.
    await rm(file, { force: true });
    throw new AvatarError("Please log in again.", 401);
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
    if (error instanceof AvatarError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
