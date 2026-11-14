# 0008 — On a phone, the tabs along the bottom

**Decided:** v1.2.0. Replaces "the tabs in the middle of the top bar at every width; no bottom tab bar".

**Why:** the apps are mostly used on phones, and the top of the screen is the hardest place to reach with a thumb.

**What it is:** one tab bar (`TabBar` and, on `/apps` and `/account`, `LauncherTabs`, in `components/common/HeaderTabs.tsx`): under 48rem fixed along the bottom, each tab its icon over its name; from 48rem the same tabs across the top as the page's header, each its icon beside its name. Apps is its last tab. There is no other top bar in the apps, `/apps` or `/account`.

**Costs:** the bottom 60 px of a phone's screen; what sits at the bottom (the Undo message) goes over it.
