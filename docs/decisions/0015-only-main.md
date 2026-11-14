# 0015 — Only main, no Dependabot

**Decided:** unreleased (after v1.2.0), 2026-11-14.

**Why:** Every change goes straight to `main`, and a push there deploys. Dependabot's updates came as pull requests on branches of their own, seven at once on 2026-11-13, most of them failing CI on a `main` that had moved on since. The repository is meant to have one branch.

**What it is:**

- `.github/dependabot.yml` is gone, and so are its branches and pull requests (closed, each saying why).
- Updates are made by hand on `main`, with the same checks as any change: `npm outdated` in `app/`, the actions' pinned commit SHAs (a SHA, never a tag), the Dockerfile's `node:24-alpine`. A version out for less than a week waits, as Dependabot's cooldown did: fresh releases are where supply-chain attacks land. Postgres only within its major version (a major needs a dump and restore, [docs/operations.md](../operations.md)).
- What the first round took (2026-11-14): the npm minor and patch updates (Next.js 16.4.5, React 19.3.1, Better Auth 1.7.18, TanStack Query 5.106.1, Playwright 1.65), ESLint 10 and Vitest 5, `docker/login-action` 4.8.0, and `anchore/scan-action` pinned by its commit (the same v7.4.2). What it didn't: TypeScript 7 (typescript-eslint doesn't support it yet), Node 25 (not a long-term release, and past its end of life) and `@types/node` 26 (the types follow the Node that runs, 24).
- `ci.yml` still runs on pull requests, should one ever be opened.

**Costs:** nothing reminds anyone that an update is out. The deploy's image scan still stops a known critical vulnerability with a fix, and `npm audit --omit=dev` shows what the app ships with. Dependabot alerts (Settings → Code security) would say when a dependency has a known vulnerability without opening branches; they are off.
