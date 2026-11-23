import "server-only";
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

// Written beside it, then renamed over it: a photo being read is never half written.
export async function writeAtomically(file: string, data: Buffer) {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, data);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
