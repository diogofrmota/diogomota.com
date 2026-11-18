import { expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ getSession: vi.fn() }));
import { boundedFormData } from "../lib/upload-body";

it("rejects chunked over-limit bodies without trusting Content-Length", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(80));
      controller.enqueue(new Uint8Array(80));
      controller.close();
    },
  });
  const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
  await expect(boundedFormData(request, 100, "Too big")).rejects.toMatchObject({ status: 413 });
});
it("accepts bounded multipart and rejects malformed bodies", async () => {
  const form = new FormData();
  form.set("photo", new Blob(["image"]), "test.png");
  expect(
    (await boundedFormData(new Request("http://localhost", { method: "POST", body: form }), 1024, "Too big")).get(
      "photo",
    ),
  ).toBeInstanceOf(File);
  await expect(
    boundedFormData(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=broken" },
        body: "wrong",
      }),
      1024,
      "Too big",
    ),
  ).rejects.toThrow();
});
