# 0002 — TanStack Query for the browser's data, kept for offline use

**Decided:** v1.2.0.

**Why:** the apps had hand-made caches and queues for what TanStack Query does (dedupe, reload on focus, optimistic changes sent in order). With it, live tasks (a refetch interval) and offline use (a persisted cache, and changes that wait for the connection) came almost for free.

**What it is:** `components/common/QueryProvider`; changes are plain data (`TaskChange` in `components/shared/shared-data.ts`, `Change` in `components/shows/library.tsx`), applied on screen on top of what the server last sent, sent one at a time (a mutation scope), and kept in `localStorage` per user with their default functions registered, so they go out after a reload. A service worker (`public/sw.js`, production only) keeps the pages.

**Costs:** `localStorage` holds a user's space and library on the device for a week; logging out clears it. The service worker isn't exercised by the e2e tests (they run `next dev`).
