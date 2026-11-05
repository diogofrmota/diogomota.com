"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Spinner } from "@/components/common/Spinner";
import { useAppView } from "@/hooks/useAppView";
import { dateLabel, datePlus, localParts, type CalendarEvent } from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import { EventDialog, eventRequest } from "./EventDialog";
import styles from "./Calendar.module.css";

type View = "month" | "week" | "day";
function monday(date: string) { return datePlus(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)); }
function eventDays(event: CalendarEvent) {
  return { start: localParts(event.startsAt), end: localParts(new Date(Date.parse(event.endsAt) - 1)) };
}
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// Pack overlapping events into separate lanes, using the same lane count for
// each connected overlap group so no event covers another event's hit target.
function timedEvents(events: CalendarEvent[], date: string) {
  const items = events.map((event) => {
    const { start, end } = eventDays(event);
    const top = start.date < date ? 0 : minutes(start.time);
    const bottom = end.date > date ? 1440 : minutes(end.time) + 1;
    return { event, top, bottom: Math.max(top + 44, bottom), lane: 0, lanes: 1 };
  }).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let group: typeof items = [], laneEnds: number[] = [], groupEnd = -1;
  function finish() { for (const item of group) item.lanes = laneEnds.length; }
  for (const item of items) {
    if (item.top >= groupEnd) { finish(); group = []; laneEnds = []; groupEnd = -1; }
    let lane = laneEnds.findIndex((end) => end <= item.top);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane; laneEnds[lane] = item.bottom; group.push(item); groupEnd = Math.max(groupEnd, item.bottom);
  }
  finish(); return items;
}

export function Calendar({ space, userId }: { space: Space; userId: string }) {
  const [date, setDate] = useState(() => localParts(new Date()).date);
  const [view, setView] = useState<View>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const { panels, openPanel, closePanel } = useAppView();
  useEffect(() => {
    const controller = new AbortController();
    eventRequest<CalendarEvent[]>("", "GET", undefined, controller.signal).then((result) => {
      setEvents(result); setError(""); setLoading(false);
    }).catch((err) => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [space, revision]);
  const today = localParts(new Date()).date;
  const first = view === "month" ? monday(`${date.slice(0, 7)}-01`) : view === "week" ? monday(date) : date;
  const days = Array.from({ length: view === "month" ? 42 : view === "week" ? 7 : 1 }, (_, i) => datePlus(first, i));
  const eventsOn = (day: string) => events.filter((event) => { const { start, end } = eventDays(event); return start.date <= day && end.date >= day; });
  const panel = panels.at(-1);
  const selected = panel?.startsWith("event:") ? events.find((e) => e.id === panel.slice(6)) : undefined;
  const newDate = panel?.startsWith("new-event:") ? panel.slice(10) : null;
  function navigate(direction: number) {
    if (view !== "month") setDate(datePlus(date, direction * (view === "week" ? 7 : 1)));
    else {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction); setDate(next.toISOString().slice(0, 10));
    }
  }
  function eventButton(event: CalendarEvent, style?: CSSProperties) {
    const member = space.members.find((m) => m.id === event.assigneeId);
    const who = event.isGroup ? "Group" : member?.username ?? "Former member";
    return <button key={event.id} className={styles.event} style={{ ...style, "--event-color": event.isGroup ? "var(--muted)" : member?.color ?? "var(--muted)" } as CSSProperties}
      aria-label={`${event.title}, ${localParts(event.startsAt).time}, ${who}`} onClick={() => openPanel(`event:${event.id}`)}>
      <span className={styles.eventTitle}>{event.title}</span>{" "}<span className={styles.eventMeta}>{localParts(event.startsAt).time} · {event.isGroup ? <span className={styles.groupBadge}>Group</span> : who}</span>
    </button>;
  }
  // One toolbar over the grid, so the grid gets the rest of the screen. The
  // top bar's Calendar tab names the view; the h1 is for screen readers.
  return <section className={styles.calendar} aria-label="Shared calendar">
    <h1 className={styles.srOnly}>Calendar</h1>
    <div className={styles.toolbar}>
      <div className={styles.actions}>
        <button className={styles.prev} aria-label="Previous period" onClick={() => navigate(-1)}>‹</button><button className={styles.goToday} onClick={() => setDate(today)}>Today</button><button className={styles.next} aria-label="Next period" onClick={() => navigate(1)}>›</button>
      </div>
      <h2 aria-live="polite">{view === "day" ? dateLabel(date, { day: "numeric", month: "long", year: "numeric" }) : view === "week" ? `${dateLabel(first, { day: "numeric", month: "short" })} – ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}` : dateLabel(date, { month: "long", year: "numeric" })}</h2>
      <ul className={styles.legend} aria-label="Event colors">{space.members.map((m) => <li key={m.id}><i style={{ background: m.color }} />{m.username}</li>)}<li><i className={styles.groupDot} />Group</li></ul>
      <div className={styles.switcher} role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((item) => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      {/* Just "+" on phones up to 400px wide; the name stays "+ Add event". */}
      <button className={`${styles.primary} ${styles.add}`} onClick={() => openPanel(`new-event:${date}`)}>+<span className={styles.addLabel}> Add event</span></button>
    </div>
    {loading && <Spinner label="Loading calendar…" />}
    {error && <div role="alert" className={styles.alert}><p>{error}</p><button onClick={() => { setError(""); setLoading(true); setRevision((r) => r + 1); }}>Retry</button></div>}
    {!loading && !error && events.length === 0 && <p className={styles.empty}>Nothing planned yet — add your first event!</p>}
    <div className={styles.scroller} tabIndex={0} role="region" aria-label={`${view} calendar`}>
      {view === "month" ? <div className={styles.month}>
        {days.slice(0, 7).map((day) => <div className={styles.weekday} key={day}>{dateLabel(day, { weekday: "short" })}</div>)}
        {days.map((day) => <div key={day} className={`${styles.cell} ${day.slice(0, 7) !== date.slice(0, 7) ? styles.outside : ""}`}>
          <button className={`${styles.dayNumber} ${day === today ? styles.today : ""}`} aria-label={dateLabel(day, { weekday: "long", day: "numeric", month: "long" })} onClick={() => { setDate(day); setView("day"); }}>{Number(day.slice(-2))}</button>
          {eventsOn(day).map((event) => eventButton(event))}
        </div>)}
      </div> : <div className={`${styles.timeGrid} ${view === "week" ? styles.week : ""}`} style={{ "--days": days.length } as CSSProperties}>
        <div className={styles.timeHead} />{days.map((day) => <button key={day} className={`${styles.timeHead} ${day === today ? styles.today : ""}`} onClick={() => { setDate(day); setView("day"); }}>{dateLabel(day, { weekday: "short", day: "numeric" })}</button>)}
        <div className={styles.hours}>{Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>
        {days.map((day) => <div className={styles.dayColumn} key={day}>
          {Array.from({ length: 24 }, (_, h) => <div className={styles.hour} key={h} />)}
          {timedEvents(eventsOn(day), day).map(({ event, top, bottom, lane, lanes }) => eventButton(event, {
            position: "absolute", top, height: Math.min(1440 - top, bottom - top), left: `${lane * 100 / lanes}%`, width: `${100 / lanes}%`,
          }))}
        </div>)}
      </div>}
    </div>
    {(selected || newDate) && <EventDialog key={panel} event={selected} date={newDate ?? date} space={space} userId={userId} onClose={closePanel}
      onSaved={(saved) => { setEvents((current) => [...current.filter((e) => e.id !== saved.id), saved].sort((a, b) => a.startsAt.localeCompare(b.startsAt))); setDate(localParts(saved.startsAt).date); }}
      onDeleted={(id) => setEvents((current) => current.filter((e) => e.id !== id))} />}
  </section>;
}
