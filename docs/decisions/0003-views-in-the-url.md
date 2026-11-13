# 0003 — The apps' views and panels in the URL

**Decided:** v1.2.0. Replaces "the URL stays at /shared or /shows; a reload starts on the default view".

**Why:** a reload lost where you were, and nothing (a title, a task, Discover) could be linked to, bookmarked, or opened from an invite.

**What it is:** the view is the path after the app's (`/shows/discover`), the open panels its `p` parameters, bottom to top (`?p=search&p=title:tv:1396`); `hooks/useAppView.ts` keeps them with `history.pushState` (no page load), and `app/shows/[[...view]]` renders the URL's on the server. A panel that came with the URL closes by replacing its entry, so it never leaves the app.

**Costs:** URLs are longer; a panel id in a URL must be one the app can open on its own (a title, a friend, an event: each loads what it needs).
