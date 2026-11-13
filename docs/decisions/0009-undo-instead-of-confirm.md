# 0009 — Undo instead of "are you sure?"

**Decided:** v1.2.0 (tasks had it since v0.10).

**Why:** a confirm box is a second tap for every delete, and people learn to tap through it. Undo costs nothing when the delete was meant, and saves the mistake when it wasn't.

**What it is:** `components/common/Undo`: done on screen at once, sent when its 5 seconds run out (or another takes its place, or the view or page is left). Tasks, events, lists (in their row, inside the dialog), friends, titles, and leaving a space.

**Costs:** what can't be undone still asks: leaving as the last member, deleting the account, a new calendar link.
