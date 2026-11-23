import { HttpError } from "./http";

/** The most pixels an uploaded picture or photo may have: a 64-megapixel phone photo, with room to spare. */
export const maxImagePixels = 70_000_000;

/** Bound multipart bodies even without Content-Length (chunked requests).
 * The bound stays below Next's proxy buffer, so truncation cannot turn a
 * too-large request into an ambiguous malformed-form response. */
export async function boundedFormData(request: Request, limit: number, tooBig: string): Promise<FormData> {
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(tooBig, 413);
  if (!request.body) return new FormData();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel();
        throw new HttpError(tooBig, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
