# 0012 — The whole calendar as a subscription, not a download

**Decided:** v1.2.0. Replaces "no whole-calendar export".

**Why:** a downloaded file is out of date the next day. A subscription puts the space's events in each person's own calendar app, with that app's reminders, so the site needs no notifications of its own.

**What it is:** one secret link per user (`calendar_feeds`, `/api/calendar/<token>`), the space's events from 3 months ago on, checked by calendar apps every few hours; Make a new link stops the old one. nginx limits it to 30 requests a minute per address.

**Costs:** whoever has the link reads the calendar; a change shows there within hours, not at once.
