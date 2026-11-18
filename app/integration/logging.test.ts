import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { expect, it } from "vitest";

it("nginx logs redact bearer paths, queries and referrers even for upstream and rate-limit failures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "diogomota-nginx-test-"));
  const name = `diogomota-nginx-test-${randomUUID()}`;
  const docker = (args: string[]) =>
    execFileSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000 });
  try {
    const certs = path.join(root, "live", "diogomota.com");
    await mkdir(certs, { recursive: true });
    const openssl = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
    execFileSync(
      openssl,
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
      "/etc/nginx/site/nginx.conf",
      "-g",
      "daemon off;",
    ]);
    docker(["exec", name, "nginx", "-t", "-c", "/etc/nginx/site/nginx.conf"]);
    const port = Number(docker(["port", name, "443/tcp"]).match(/127\.0\.0\.1:(\d+)/)![1]);
    const secret = "SYNTHETIC_BEARER_NEVER_LOG_THIS";
    const request = (route: string) =>
      new Promise<void>((resolve, reject) => {
        https
          .get(
            {
              hostname: "127.0.0.1",
              port,
              path: route,
              servername: "diogomota.com",
              rejectUnauthorized: false,
              headers: { Host: "diogomota.com", Referer: `https://diogomota.com/reset-password?token=${secret}` },
            },
            (res) => {
              res.resume();
              res.on("end", resolve);
            },
          )
          .on("error", reject);
      });
    await request(`/reset-password?token=${secret}`);
    await request(`/api/auth/reset-password/${secret}?token=${secret}`);
    await Promise.all(Array.from({ length: 45 }, () => request(`/api/calendar/${secret}?secret=${secret}`)));
    const result = spawnSync("docker", ["logs", name], { encoding: "utf8", windowsHide: true });
    const logs = result.stdout + result.stderr;
    expect(logs).not.toContain(secret);
    expect(logs).toContain('"GET /api/calendar/[redacted]"');
    expect(logs).toContain('"GET /api/auth/[redacted]"');
    expect(logs).toContain('"GET /reset-password"');
    expect(logs).toContain("rt=");
    expect(logs).toMatch(/ 502 /);
    expect(logs).toMatch(/ 429 /);
  } finally {
    try {
      docker(["rm", "-f", name]);
    } catch {
      /* Already removed. */
    }
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("diogomota-nginx-test-"))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
}, 90000);
