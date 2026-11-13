# 0008 — On a phone, the tabs along the bottom

**Decided:** v1.2.0. Replaces "the tabs in the middle of the top bar at every width; no bottom tab bar".

**Why:** the apps are mostly used on phones, and the top of the screen is the hardest place to reach with a thumb.

**What it is:** `BottomTabs` (`components/common/HeaderTabs.tsx`), each tab its icon over its name, under 48rem; the top bar has the app's name there. Wide screens keep the tabs in the top bar.

**Costs:** the bottom 60 px of a phone's screen; what sits at the bottom (the Undo message) goes over it.
