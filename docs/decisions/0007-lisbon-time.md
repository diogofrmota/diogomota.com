# 0007 — The calendar in Lisbon time, on the 24-hour clock

**Decided:** v1.0.0.

**Why:** everyone using it lives in Portugal. One zone means a dinner at 20:00 is at 20:00 for both people, whatever their phone's setting, and dates read the European way (`14 Nov 2026, 15:30`, the day first).

**What it is:** `Europe/Lisbon` in `lib/calendar.ts`; times typed as `hh:mm`, dates as `dd/mm/yyyy`, never the browser's own fields; stored as UTC; spring-forward gaps refused, autumn repeats chosen.

**Costs:** someone travelling sees Lisbon times. A per-space time zone would be the change.
