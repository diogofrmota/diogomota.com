"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { useAppView } from "@/hooks/useAppView";
import { dateLabel, datePlus, eventDates, localParts, type CalendarEvent } from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import { EventDialog, eventRequest } from "./EventDialog";
import styles from "./Calendar.module.css";

type View = "month" | "week" | "day";
function monday(date: string) { return datePlus(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)); }
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// Pack overlapping events into separate lanes, using the same lane count for
// each connected overlap group so no event covers another event's hit target.
function timedEvents(events: CalendarEvent[], date: string) {
  const items = events.map((event) => {
    const { start, end } = eventDates(event);
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

// A new event's panel: "new-event:2026-11-12", or with the hour tapped in the
// week or day view, "new-event:2026-11-12T14:00".
function parseNewEvent(panel: string | undefined) {
  if (!panel?.startsWith("new-event:")) return null;
  const [date, time] = panel.slice(10).split("T");
  return { date, time };
}

export function Calendar({ space, userId }: { space: Space; userId: string }) {
  const [date, setDate] = useState(() => localParts(new Date()).date);
  const [view, setView] = useState<View>("month");
  // Which way the grid last moved: it comes in from that side.
  const [slide, setSlide] = useState<"forward" | "back" | "fade">("fade");
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
  const eventsOn = (day: string) => events.filter((event) => { const { start, end } = eventDates(event); return start.date <= day && end.date >= day; });
  const panel = panels.at(-1);
  const selected = panel?.startsWith("event:") ? events.find((e) => e.id === panel.slice(6)) : undefined;
  const newEvent = parseNewEvent(panel);

  // Moving to another period or view: the grid, keyed by what it shows, is a
  // new one, which slides in from the side of its dates (later from the right,
  // earlier from the left) or fades in (Calendar.module.css). Nothing waits on it.
  function move(next: string, nextView: View = view) {
    setSlide(next < date ? "back" : next > date ? "forward" : "fade");
    setDate(next); setView(nextView);
  }
  function navigate(direction: number) {
    if (view !== "month") move(datePlus(date, direction * (view === "week" ? 7 : 1)));
    else {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction); move(next.toISOString().slice(0, 10));
    }
  }
  const addOn = (day: string, time?: string) => openPanel(`new-event:${day}${time ? `T${time}` : ""}`);
  function eventButton(event: CalendarEvent, style?: CSSProperties) {
    const member = space.members.find((m) => m.id === event.assigneeId);
    const who = event.isGroup ? "Group" : member?.username ?? "Former member";
    const when = event.allDay ? "All day" : localParts(event.startsAt).time;
    return <button key={event.id} className={`${styles.event} ${event.allDay ? styles.allDayEvent : ""}`} style={{ ...style, "--event-color": event.isGroup ? "var(--muted)" : member?.color ?? "var(--muted)" } as CSSProperties}
      aria-label={`${event.title}, ${when}, ${who}`} onClick={(e) => { e.stopPropagation(); openPanel(`event:${event.id}`); }}>
      <span className={styles.eventTitle}>{event.title}</span>{" "}<span className={styles.eventMeta}>{when} · {who}</span>
    </button>;
  }
  // One toolbar over the grid, so the grid gets the rest of the screen. The
  // top bar's Calendar tab names the view; the h1 is for screen readers.
  return <section className={styles.calendar} aria-label="Shared calendar">
    <h1 className={styles.srOnly}>Calendar</h1>
    <div className={styles.toolbar}>
      <div className={styles.actions}>
        <button className={`${styles.arrow} ${styles.prev}`} aria-label="Previous period" onClick={() => navigate(-1)}><ChevronLeftIcon /></button>
        <button className={styles.goToday} onClick={() => move(today)}>Today</button>
        <button className={`${styles.arrow} ${styles.next}`} aria-label="Next period" onClick={() => navigate(1)}><ChevronRightIcon /></button>
      </div>
      <h2 aria-live="polite">{view === "day" ? dateLabel(date, { day: "numeric", month: "long", year: "numeric" }) : view === "week" ? `${dateLabel(first, { day: "numeric", month: "short" })} – ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}` : dateLabel(date, { month: "long", year: "numeric" })}</h2>
      <ul className={styles.legend} aria-label="Event colors">{space.members.map((m) => <li key={m.id}><span className={styles.dot} style={{ background: m.color }} />{m.username}</li>)}<li><span className={`${styles.dot} ${styles.groupDot}`} />Group</li></ul>
      <div className={styles.switcher} role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((item) => <button key={item} aria-pressed={view === item} onClick={() => move(date, item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      {/* Just the plus on phones up to 400px wide; the name stays "Add event". */}
      <button className={`${styles.primary} ${styles.add}`} onClick={() => addOn(date)}><PlusIcon /><span className={styles.addLabel}>Add event</span></button>
    </div>
    {loading && <Spinner label="Loading calendar…" />}
    {error && <div role="alert" className={styles.alert}><p>{error}</p><button onClick={() => { setError(""); setLoading(true); setRevision((r) => r + 1); }}>Retry</button></div>}
    {!loading && !error && events.length === 0 && <p className={styles.empty}>Nothing planned yet — tap a day to add your first event!</p>}
    <div className={styles.scroller} tabIndex={0} role="region" aria-label={`${view} calendar`}>
      {view === "month" ? <div key={`month:${first}`} className={styles.month} data-slide={slide}>
        {days.slice(0, 7).map((day) => <div className={styles.weekday} key={day}>{dateLabel(day, { weekday: "short" })}</div>)}
        {/* A tap anywhere on a day, but on an event, adds an event that day; its number is the button for keyboards and screen readers. */}
        {days.map((day) => <div key={day} className={`${styles.cell} ${day.slice(0, 7) !== date.slice(0, 7) ? styles.outside : ""}`} onClick={() => addOn(day)}>
          <button className={`${styles.dayNumber} ${day === today ? styles.today : ""}`} aria-label={`${dateLabel(day, { weekday: "long", day: "numeric", month: "long" })}, add event`}
            onClick={(e) => { e.stopPropagation(); addOn(day); }}>{Number(day.slice(-2))}</button>
          {eventsOn(day).map((event) => eventButton(event))}
        </div>)}
      </div> : <div key={`${view}:${first}`} className={`${styles.timeGrid} ${view === "week" ? styles.week : ""}`} data-slide={slide} style={{ "--days": days.length } as CSSProperties}>
        <div className={styles.timeHead} />{days.map((day) => <button key={day} className={`${styles.timeHead} ${day === today ? styles.today : ""}`} onClick={() => move(day, "day")}>{dateLabel(day, { weekday: "short", day: "numeric" })}</button>)}
        {/* All-day events in a row of their own, over the hours, which stays in view as they scroll. */}
        {days.some((day) => eventsOn(day).some((event) => event.allDay)) && <>
          <div className={styles.allDayLabel}>All day</div>
          {days.map((day) => <div key={day} className={styles.allDayCell}>{eventsOn(day).filter((event) => event.allDay).map((event) => eventButton(event))}</div>)}
        </>}
        <div className={styles.hours}>{Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>
        {days.map((day) => <div className={styles.dayColumn} key={day}>
          {/* A tap on an hour adds an event then; "Add event" does the same from the keyboard. */}
          {Array.from({ length: 24 }, (_, h) => <div className={styles.hour} key={h} onClick={() => addOn(day, `${String(h).padStart(2, "0")}:00`)} />)}
          {timedEvents(eventsOn(day).filter((event) => !event.allDay), day).map(({ event, top, bottom, lane, lanes }) => eventButton(event, {
            position: "absolute", top, height: Math.min(1440 - top, bottom - top), left: `${lane * 100 / lanes}%`, width: `${100 / lanes}%`,
          }))}
        </div>)}
      </div>}
    </div>
    {(selected || newEvent) && <EventDialog key={panel} event={selected} date={newEvent?.date ?? date} time={newEvent?.time} space={space} userId={userId} onClose={closePanel}
      onSaved={(saved) => { setEvents((current) => [...current.filter((e) => e.id !== saved.id), saved].sort((a, b) => a.startsAt.localeCompare(b.startsAt))); setDate(localParts(saved.startsAt).date); }}
      onDeleted={(id) => setEvents((current) => current.filter((e) => e.id !== id))} />}
  </section>;
}
