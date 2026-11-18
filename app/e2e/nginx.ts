import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { assertTestIsolation } from "./isolation";

/** Real production nginx config with only the local app upstream changed. */
export async function isolatedNginx(cookie: string) {
  assertTestIsolation();
  const root = await mkdtemp(path.join(os.tmpdir(), "diogomota-upload-test-"));
  const name = `diogomota-upload-test-${randomUUID()}`;
  const docker = (args: string[]) =>
    execFileSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000 });
  const cleanup = async () => {
    try {
      docker(["rm", "-f", name]);
    } catch {
      /* Already removed. */
    }
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("diogomota-upload-test-"))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  };
  try {
    const certs = path.join(root, "live", "diogomota.com");
    await mkdir(certs, { recursive: true });
    execFileSync(
      process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=diogomota.com",
        "-keyout",
        path.join(certs, "privkey.pem"),
        "-out",
        path.join(certs, "fullchain.pem"),
      ],
      { stdio: "ignore", windowsHide: true },
    );
    const host = docker([
      "run",
      "--rm",
      "--add-host",
      "app:host-gateway",
      "nginx:1.30-alpine",
      "getent",
      "ahostsv4",
      "app",
    ])
      .trim()
      .split(/\s+/)[0];
    if (!/^[\d.]+$/.test(host)) throw new Error("Unexpected host gateway");
    const config = (await readFile(path.resolve("../nginx/nginx.conf"), "utf8")).replace(
      "http://app:3000",
      `http://${host}:3100`,
    );
    await writeFile(path.join(root, "nginx.conf"), config);
    docker([
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::443",
      "-v",
      `${path.resolve("../nginx")}:/etc/nginx/site:ro`,
      "-v",
      `${root}:/etc/letsencrypt:ro`,
      "nginx:1.30-alpine",
      "nginx",
      "-c",
      "/etc/letsencrypt/nginx.conf",
      "-g",
      "daemon off;",
    ]);
    const port = Number(docker(["port", name, "443/tcp"]).match(/127\.0\.0\.1:(\d+)/)![1]);
    return {
      cleanup,
      request: (route: string, body: Buffer, contentType: string, chunked = false) =>
        new Promise<{ status: number; body: string }>((resolve, reject) => {
          const request = https.request(
            {
              hostname: "127.0.0.1",
              port,
              servername: "diogomota.com",
              rejectUnauthorized: false,
              path: route,
              method: "POST",
              headers: {
                Host: "diogomota.com",
                Cookie: cookie,
                Origin: "http://localhost:3100",
                "Content-Type": contentType,
                ...(chunked ? {} : { "Content-Length": body.length }),
              },
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk) => chunks.push(chunk));
              response.on("end", () =>
                resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString() }),
              );
            },
          );
          request.on("error", reject);
          if (chunked) {
            for (let offset = 0; offset < body.length; offset += 65536)
              request.write(body.subarray(offset, offset + 65536));
            request.end();
          } else request.end(body);
        }),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function photoMultipart(photo: Buffer) {
  const boundary = `test-${randomUUID()}`;
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      photo,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
