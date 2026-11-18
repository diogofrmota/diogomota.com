# 0021 - Durable offline operations and disposable test resources

**Decided:** remediation work, 2026-11-18. Updates [0002](0002-tanstack-query-offline.md); preserves the [main-only workflow](0015-only-main.md) and [expand-and-contract policy](0004-expand-and-contract-migrations.md).

## Offline boundaries

Each user/app has a base journal and additional tab journals. A Web Lock leases each journal to one writer/replayer. Another tab can work using its own journal; free journals with pending operations can be replayed in the background. Operations are never copied between journals. Page departure releases ownership, and a page restored from the browser back/forward cache reloads before using its previous client. A normal component unmount drains an already-sent mutation, retains reconnect handling and explicitly saves the final acknowledgement before releasing its lease.

The server renders the app shell and saved theme using a read-only QueryClient. Its queries remain in restoring mode and form controls stay disabled until a journal is owned and hydrated. The primary QueryClient and app DOM stay mounted across ownership changes. Reopening a hidden page waits for its previous lease to finish draining and saving before reusing that client and hydrating the next lease. This preserves browser view history and local view state instead of remounting the app at each handoff. A drain can hand off a newly paused mutation safely; it need not block editing until reconnection. Persistence restore/subscription is managed with the journal lease.

Pending mutations are written synchronously to a small localStorage journal before disposable query persistence. Journals use an explicit format version, independent of APP_VERSION, and never expire merely because a release or week has passed. Transport failures remain retryable. Restored clients initialize TanStack's current network state before hydration: installed Query 5.106.1 otherwise starts with `online=true`, including on an offline document reload. Restored pending operations are marked paused before hydration, including requests whose delivery was uncertain when saved: the installed library resumes only paused mutations, and hydrated operations have no live network retryer. A regression uses actual TanStack hydration and replay to verify this boundary.

Successful query snapshots use IndexedDB with a localStorage fallback when IndexedDB is unavailable. They expire after a week or a release change. The change to IndexedDB followed measurement: five years of Fitness data (1,825 days, 780 workouts with 10 exercises/5 sets, 520 runs) produced 2,695,386 bytes of JSON; 1,000 full recipes produced 9,942,903 bytes and exceeded Chromium's localStorage quota. The production regression verifies the larger collection reopens offline and that an injected query-cache quota failure does not prevent pending edits from surviving reload and synchronizing. These are local desktop measurements, not a mobile performance guarantee or an agreed global latency budget.

Legacy `diogomota-cache:<user>` snapshots are imported by the base journal for the relevant app only. The original remains unchanged as recovery evidence. Recurring completions obtain expected due dates from the cached pre-operation task state, applying sequential queued operations in order. Missing occurrence evidence or unsupported operation formats pause editing and offer a recovery download rather than attempting an unsafe replay. Downloads include raw persisted entries and available live pending operations.

Only default handlers registered before hydration can replay an operation. Shows additions and changes share their ordered scope and reconcile restored success using the server answer. Shared recurring completion sends its expected due date; the task row lock serializes the check and write. A stale occurrence cannot advance again, and clients display the authoritative response.

Browsers without Web Locks retain connected use without hydrating/overwriting saved journals; offline edits are explicitly refused. The provider also falls back if journal storage cannot be opened, but successful session cleanup still requires writable browser storage: a refused cleanup visibly stops the transition instead of claiming data was cleared. Web Locks require a secure context. Browser eviction, a device loss and a user deliberately clearing site data remain outside application persistence guarantees.

## Session transitions

Successful logout, password-change logout and account deletion navigate through awaited local cleanup. Failed password validation leaves queues intact. Login and verification transitions clear disposable views/documents while preserving pending journals. Cleanup stops writers, changes a shared session generation, clears IndexedDB in a transaction, activates the current worker protocol, drains acknowledged worker writes, and removes account document caches. Other tabs stop and leave authenticated views. Old workers without the cleanup protocol are upgraded before cleanup completes.

The transition page requires a random URL key matching an HttpOnly, path-scoped browser cookie issued by the successful authentication action. The cookie authorizes either disposable-view cleanup or full logout cleanup; URL flags cannot escalate it. A direct or forged transition link cannot erase journals. The grant lasts one day so failed device cleanup can be retried; an invalid or expired grant refuses cleanup rather than claiming completion. Account dialog triggers are disabled until hydration to avoid dropping clicks immediately after a successful session navigation.

The production worker caches previously visited owner Books routes as well as the existing apps; friends' Books profile documents are excluded. An uncached app view explains that reconnection is needed. Document reads use the current worker's cache only, preventing stale cache namespaces from supplying an older account's page.

Old-version tabs cannot understand the new persistence protocol. Close/refresh them before further offline editing. Before rollback past this fix, synchronize/export pending changes and preserve recovery copies: old clients cannot read new journals and must not blindly replay the retained legacy snapshot. This is separate from database rollback compatibility. Detailed procedures are in [operations](../operations.md#remediation-rollout-and-media-cleanup).

## Database and operations boundaries

Task patches lock the task before reading merge state and assignments, without upgrading the shared space lock. Benfica imports use a space-specific transaction advisory lock without making manual title/time combinations unique. Exports authorize and read Shared data within one membership-protected transaction. Feed reads follow user, space, then token locking, rechecking token rotation.

Account deletion's password-checked server action owns one transaction for membership/ownership cleanup, personal-data/auth-table cascades and a durable media outbox. Better Auth's independent multi-step deletion API is disabled. Migration 028 adds only the outbox; existing images ignore it. Post-commit file failures retain retryable jobs. `scripts/cleanup-media.mjs` retries batches without re-creating accounts.

nginx access logs omit queries/referrers and redact token path segments. Raw request error logs are suppressed because their format cannot be sanitized; process/configuration errors remain. Backup retention runs independently for each verified replacement category; skipped/failed media preserves old archives and reports degraded status.

## Test isolation and the main gate

The test runner ignores ordinary database/media settings. Every mutating run owns a fresh PostgreSQL 16 container, random loopback port, random database identity and separate OS-temp media root. PostgreSQL data uses a container-local temporary filesystem. Playwright and DB helpers require matching explicit test identity/paths; there is no `.env.local` database fallback. Teardown never deletes username prefixes or unowned shared spaces. Container removal includes only its own anonymous volumes; media deletion validates the intended absolute temporary root.

The normal main deployment gate runs the full behavioral suite, isolated database/operations integration tests and a production standalone-build suite. Production test hooks require the same test database/media identity and a loopback authentication URL. Ordinary production configuration leaves them disabled. This preserves main-only development while testing the actual worker and upload proxy boundary.

## Documentation checked

- Installed TanStack 5.106.1 persistence, hydration and online manager source; [persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient), [mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations), [online manager](https://tanstack.com/query/latest/docs/reference/onlineManager).
- Installed Next 16.4.5 bundled proxy documentation/source and [official proxy body limit documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize).
- Installed Better Auth 1.7.18 deletion lifecycle and [user/account documentation](https://better-auth.com/docs/concepts/users-accounts).
- [PostgreSQL 16 locks](https://www.postgresql.org/docs/16/explicit-locking.html), [nginx access logging](https://nginx.org/en/docs/http/ngx_http_log_module.html), [nginx error logging](https://nginx.org/en/docs/ngx_core_module.html#error_log).
- [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [browser back/forward lifecycle](https://web.dev/articles/bfcache).
- [React Activity](https://react.dev/reference/react/Activity) effect cleanup and restoration; installed React 19.3.1 and TanStack provider source checked while preserving server-rendered shells.
- Installed Playwright 1.65.1 declarations and [APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext): the reconnect test's read-only state poll uses two retries for `ECONNRESET`, without retrying HTTP errors or the counted mutation. Installed dnd-kit core 6.3.1 and [its KeyboardSensor source](https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/sensors/keyboard/KeyboardSensor.ts) announce pickup before attaching the key listener on a timer; keyboard tests cross that event-loop turn before sending arrows.
