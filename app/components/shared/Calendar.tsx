"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Avatar } from "@/components/common/Avatar";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, UserIcon, UsersIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast, useUndo } from "@/components/common/Undo";
import { useAppView } from "@/hooks/useAppView";
import {
  dateLabel,
  datePlus,
  eventDates,
  eventFor,
  localInstants,
  localParts,
  timedEvents,
  type CalendarEvent,
} from "@/lib/calendar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import { EventDialog } from "./EventDialog";
import { InviteLink } from "./InviteLink";
import { eventRequest, forgetEvent, sharedKeys, storeEvent } from "./shared-data";
import styles from "./Calendar.module.css";

type Mode = "agenda" | "month" | "week" | "day";
/** The events a day of the month shows; past them, "+1 more" (and so on). */
const monthEvents = 2;
/** The agenda shows this many days at a time, and Show more adds as many. */
const agendaDays = 28;
/** Moved or resized with the mouse, an event snaps to this many minutes. */
const snapMinutes = 15;

function monday(date: string) {
  return datePlus(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
const today = () => localParts(new Date()).date;

// A phone's screen (narrower than 48rem): the agenda by default, three days
// in place of a week, and a swipe to the next or previous period.
const phoneQuery = "(max-width: 47.99rem)";
function subscribePhone(onChange: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

// A new event's panel: "new-event:2026-11-12", or with the hour tapped in the
// week or day view, "new-event:2026-11-12T14:00".
function parseNewEvent(panel: string | undefined) {
  if (!panel?.startsWith("new-event:")) return null;
  const [date, time] = panel.slice(10).split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, time: /^\d{2}:\d{2}$/.test(time ?? "") ? time : undefined } : null;
}

/** The red line across today at the time it is now, in the week and day views; it moves every minute. */
function NowLine() {
  const [now, setNow] = useState(() => minutes(localParts(new Date()).time));
  useEffect(() => {
    const timer = setInterval(() => setNow(minutes(localParts(new Date()).time)), 60_000);
    return () => clearInterval(timer);
  }, []);
  return <div className={styles.nowLine} style={{ top: now }} aria-hidden="true" />;
}

/** "Today", "Tomorrow" or "Sat 14 Nov", for a day of the agenda. */
function agendaDay(day: string, now: string) {
  if (day === now) return "Today";
  if (day === datePlus(now, 1)) return "Tomorrow";
  return dateLabel(day, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) !== now.slice(0, 4) && { year: "numeric" }),
  });
}

// Invite your partner, dismissed (Not now) on this device, for this space: kept
// in localStorage, and in memory where that can't be written. The server can't
// know, so the page comes without it and it shows once hydrated: one dismissed
// for days doesn't flash on every load.
const inviteKey = (spaceId: string) => `shared-invite-dismissed:${spaceId}`;
const dismissedHere = new Set<string>();
const inviteListeners = new Set<() => void>();
function subscribeInvite(onChange: () => void) {
  inviteListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    inviteListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function inviteDismissed(spaceId: string) {
  if (dismissedHere.has(spaceId)) return true;
  try {
    return localStorage.getItem(inviteKey(spaceId)) === "1";
  } catch {
    return false;
  }
}
function dismissInvite(spaceId: string) {
  dismissedHere.add(spaceId);
  try {
    localStorage.setItem(inviteKey(spaceId), "1");
  } catch {}
  for (const listener of inviteListeners) listener();
}
function useInviteDismissed(spaceId: string): boolean {
  return useSyncExternalStore(
    subscribeInvite,
    () => inviteDismissed(spaceId),
    () => true,
  );
}

/** A drag of an event with the mouse in the week or day view: moving it, or its bottom edge. */
type Drag = {
  id: string;
  kind: "move" | "resize";
  x: number;
  y: number;
  /** The width of a day's column, to tell how many days it moved. */
  column: number;
  moved: boolean;
  days: number;
  minutes: number;
};

export function Calendar({ space, userId }: { space: Space; userId: string }) {
  const client = useQueryClient();
  const phone = usePhone();
  const now = today();
  const [date, setDate] = useState(now);
  // Null: the device's own, the agenda on a phone and the month otherwise.
  const [mode, setMode] = useState<Mode | null>(null);
  const view: Mode = mode ?? (phone ? "agenda" : "month");
  const weekLength = phone ? 3 : 7;
  const [agendaLength, setAgendaLength] = useState(agendaDays);
  // Which way the grid last moved: it comes in from that side.
  const [slide, setSlide] = useState<"forward" | "back" | "fade">("fade");
  const [error, setError] = useState("");
  const { panels, openPanel, closePanel } = useAppView();
  const undo = useUndo();
  const scroller = useRef<HTMLDivElement>(null);
  // Asked for by Today, to scroll to the time it is now again.
  const [nowRequest, setNowRequest] = useState(0);
  const inviteHidden = useInviteDismissed(space.id);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // The click that ends a drag isn't a tap on the event.
  const dragged = useRef(false);
  const swipe = useRef<{ x: number; y: number; done: boolean } | null>(null);

  // The week and the day views open at the time it is now: an hour before it at
  // the top of the hours (1px a minute), under the days' names and the all-day row.
  useLayoutEffect(() => {
    if ((view !== "week" && view !== "day") || !scroller.current) return;
    scroller.current.scrollTop = Math.max(0, minutes(localParts(new Date()).time) - 60);
  }, [view, nowRequest]);

  const first =
    view === "month"
      ? monday(`${date.slice(0, 7)}-01`)
      : view === "week"
        ? weekLength === 7
          ? monday(date)
          : date
        : date;
  const length = view === "month" ? 42 : view === "week" ? weekLength : view === "day" ? 1 : agendaLength;
  const days = useMemo(() => Array.from({ length }, (_, i) => datePlus(first, i)), [first, length]);
  const last = days[days.length - 1];

  // Only the events of the days shown are loaded (and kept while the next ones
  // load); each period's stay in memory, and in this browser for offline use.
  const from = localInstants(first, "00:00")[0];
  const to = localInstants(datePlus(last, 1), "00:00")[0];
  const query = useQuery({
    queryKey: sharedKeys.eventRange(from, to),
    queryFn: ({ signal }) =>
      eventRequest<CalendarEvent[]>(`?${new URLSearchParams({ from, to })}`, "GET", undefined, signal),
    placeholderData: keepPreviousData,
    meta: { persist: true },
  });
  const deletingId = undo.pending?.id;
  const events = useMemo(() => (query.data ?? []).filter((event) => event.id !== deletingId), [query.data, deletingId]);

  const names = useMemo(() => new Map(space.members.map((m) => [m.id, memberName(m)])), [space.members]);
  const eventsOn = (day: string) =>
    events.filter((event) => {
      const { start, end } = eventDates(event);
      return start.date <= day && end.date >= day;
    });

  const panel = panels.at(-1);
  const selectedId = panel?.startsWith("event:") ? panel.slice(6) : null;
  const loaded = selectedId ? events.find((e) => e.id === selectedId) : undefined;
  // An event opened from a link may be in another period: it loads on its own.
  const single = useQuery({
    queryKey: ["shared", "event", selectedId],
    queryFn: ({ signal }) => eventRequest<CalendarEvent>(`/${selectedId}`, "GET", undefined, signal),
    enabled: !!selectedId && !loaded && !query.isPlaceholderData && query.isSuccess,
  });
  const selected = loaded ?? (selectedId ? single.data : undefined);
  const newEvent = parseNewEvent(panel);

  // Moving to another period or view: the grid, keyed by what it shows, is a
  // new one, which slides in from the side of its dates (later from the right,
  // earlier from the left) or fades in (Calendar.module.css). Nothing waits on it.
  function move(next: string, nextView: Mode = view) {
    setSlide(next < date ? "back" : next > date ? "forward" : "fade");
    setDate(next);
    setMode(nextView);
    if (nextView === "agenda") setAgendaLength(agendaDays);
  }
  function navigate(direction: number) {
    if (view === "month") {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction);
      move(next.toISOString().slice(0, 10));
    } else {
      const step = view === "week" ? weekLength : view === "day" ? 1 : agendaDays;
      move(datePlus(date, direction * step));
    }
  }
  const addOn = (day: string, time?: string) => openPanel(`new-event:${day}${time ? `T${time}` : ""}`);

  // A swipe left or right on a touch screen moves to the next or previous period
  // (the grid has touch-action: pan-y, so up and down still scroll it).
  function swipeStart(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || view === "agenda") return;
    swipe.current = { x: e.clientX, y: e.clientY, done: false };
  }
  function swipeEnd(e: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    if (!start || e.pointerType === "mouse") return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      start.done = true;
      navigate(dx < 0 ? 1 : -1);
    } else swipe.current = null;
  }

  // Dragging an event with the mouse in the week or day view: its body moves it
  // (to another time, or day), its bottom edge changes when it ends; both snap to
  // 15 minutes, and it is saved when let go. A click without moving opens it.
  function dragStart(e: PointerEvent<HTMLElement>, event: CalendarEvent, kind: Drag["kind"]) {
    if (e.pointerType !== "mouse" || e.button !== 0 || event.allDay) return;
    const { start, end } = eventDates(event);
    if (start.date !== end.date) return;
    const column = (e.currentTarget.closest(`.${styles.dayColumn}`) as HTMLElement | null)?.offsetWidth ?? 100;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: event.id, kind, x: e.clientX, y: e.clientY, column, moved: false, days: 0, minutes: 0 };
    e.stopPropagation();
  }
  function dragMove(e: PointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current) return;
    const dx = e.clientX - current.x,
      dy = e.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    const next = {
      ...current,
      moved: true,
      minutes: Math.round(dy / snapMinutes) * snapMinutes,
      days: current.kind === "move" && view === "week" ? Math.round(dx / current.column) : 0,
    };
    dragRef.current = next;
    setDrag(next);
  }
  async function dragEnd(event: CalendarEvent) {
    const done = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (done?.moved) dragged.current = true;
    if (!done?.moved || (done.minutes === 0 && done.days === 0)) return;
    // Its real end (eventDates' is the minute before it): 1440 for midnight the next day.
    const start = localParts(event.startsAt);
    const end = localParts(event.endsAt);
    const endOfIt = end.date === start.date ? minutes(end.time) : 1440;
    const length = endOfIt - minutes(start.time);
    const startMinutes =
      done.kind === "move"
        ? Math.min(Math.max(minutes(start.time) + done.minutes, 0), 1440 - length)
        : minutes(start.time);
    const endMinutes =
      done.kind === "move"
        ? startMinutes + length
        : Math.min(Math.max(endOfIt + done.minutes, startMinutes + snapMinutes), 1440);
    const day = datePlus(start.date, done.days);
    const instant = (at: number) =>
      at >= 1440 ? localInstants(datePlus(day, 1), "00:00")[0] : localInstants(day, clock(at))[0];
    const startsAt = instant(startMinutes);
    const endsAt = instant(endMinutes);
    if (!startsAt || !endsAt) {
      setError("That time doesn't exist that day (the clocks move forward). Choose another one.");
      return;
    }
    const moved = { ...event, startsAt, endsAt };
    storeEvent(client, moved);
    try {
      const saved = await eventRequest<CalendarEvent>(`/${event.id}`, "PATCH", {
        title: event.title,
        startsAt,
        endsAt,
        allDay: false,
        isGroup: event.isGroup,
        assigneeIds: event.assigneeIds,
      });
      storeEvent(client, saved);
    } catch (err) {
      storeEvent(client, event);
      setError((err as Error).message);
    }
  }

  // An event: who it's for (their picture or initial, two of them for two or
  // more, or two people for the group) and its title. When it is, and who
  // exactly, are in its dialog, in the week and day views its place among the
  // hours, and in its name, for screen readers: "Dinner, 19:30, Ana and Diogo",
  // which starts with the title shown. Named by text rather than aria-label,
  // so the initial on screen doesn't have to be in it.
  function eventButton(event: CalendarEvent, style?: CSSProperties, timed = false) {
    const members = event.assigneeIds
      .map((id) => space.members.find((m) => m.id === id))
      .filter((m): m is Space["members"][number] => !!m);
    const who = event.isGroup ? "Group" : eventFor(event, names);
    const when = event.allDay ? "All day" : localParts(event.startsAt).time;
    const dragging = drag?.id === event.id ? drag : null;
    const shifted =
      dragging && style
        ? dragging.kind === "move"
          ? { transform: `translate(${dragging.days * dragging.column}px, ${dragging.minutes}px)` }
          : { height: Math.max(Number(style.height) + dragging.minutes, snapMinutes) }
        : {};
    return (
      <button
        key={event.id}
        className={`${styles.event} ${event.allDay ? styles.allDayEvent : ""} ${style ? styles.timedEvent : ""} ${dragging ? styles.dragging : ""}`}
        style={{
          ...style,
          ...shifted,
          ...({
            "--event-color": event.isGroup ? "var(--muted)" : (members[0]?.color ?? "var(--muted)"),
          } as CSSProperties),
        }}
        onPointerDown={timed ? (e) => dragStart(e, event, "move") : undefined}
        onPointerMove={timed ? dragMove : undefined}
        onPointerUp={timed ? () => void dragEnd(event) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          openPanel(`event:${event.id}`);
        }}
      >
        {event.isGroup || !members.length ? (
          <span className={styles.eventAvatar} aria-hidden="true">
            {event.isGroup ? <UsersIcon /> : <UserIcon />}
          </span>
        ) : (
          <span className={styles.eventAvatars} aria-hidden="true">
            {members.slice(0, 2).map((member) => (
              <Avatar
                key={member.id}
                username={member.username}
                url={member.avatarUrl}
                className={styles.eventAvatar}
              />
            ))}
          </span>
        )}
        <span className={styles.eventTitle} aria-hidden="true">
          {event.title}
        </span>
        <span className={ui.srOnly}>{`${event.title}, ${when}, ${who}`}</span>
        {timed && (
          <span
            className={styles.resizeHandle}
            aria-hidden="true"
            onPointerDown={(e) => dragStart(e, event, "resize")}
          />
        )}
      </button>
    );
  }

  const heading =
    view === "day"
      ? dateLabel(date, { day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${dateLabel(first, { day: "numeric", month: "short" })} – ${dateLabel(last, { day: "numeric", month: "short", year: "numeric" })}`
        : view === "agenda"
          ? `From ${dateLabel(first, { day: "numeric", month: "long" })}`
          : dateLabel(date, { month: "long", year: "numeric" });
  const modes: { id: Mode; label: string }[] = [
    { id: "agenda", label: "Agenda" },
    { id: "month", label: "Month" },
    { id: "week", label: phone ? "3 days" : "Week" },
    { id: "day", label: "Day" },
  ];

  // One toolbar over the grid, so the grid gets the rest of the screen. The
  // top bar's Calendar tab names the view; the h1 is for screen readers.
  return (
    <section className={styles.calendar} aria-label="Shared calendar">
      <h1 className={ui.srOnly}>Calendar</h1>
      {space.members.length === 1 && !inviteHidden && (
        // Shared is for two: right after creating a space, the next step is asking the other person in.
        <section className={styles.invitePrompt} aria-labelledby="invite-prompt">
          <div>
            <h2 id="invite-prompt">Invite your partner</h2>
            <p className={ui.muted}>Send them a link to join your calendar and lists.</p>
          </div>
          <InviteLink space={space} />
          <button type="button" className={styles.close} aria-label="Not now" onClick={() => dismissInvite(space.id)}>
            <CloseIcon />
          </button>
        </section>
      )}
      <div className={styles.toolbar}>
        <div className={styles.actions}>
          <button
            className={`${styles.arrow} ${styles.prev}`}
            aria-label="Previous period"
            onClick={() => navigate(-1)}
          >
            <ChevronLeftIcon />
          </button>
          <button
            className={styles.goToday}
            onClick={() => {
              move(now);
              setNowRequest((n) => n + 1);
            }}
          >
            Today
          </button>
          <button className={`${styles.arrow} ${styles.next}`} aria-label="Next period" onClick={() => navigate(1)}>
            <ChevronRightIcon />
          </button>
        </div>
        <h2 aria-live="polite">{heading}</h2>
        <ul className={styles.legend} aria-label="Event colors">
          {space.members.map((m) => (
            <li key={m.id}>
              <span className={styles.dot} style={{ background: m.color }} />
              {memberName(m)}
            </li>
          ))}
          <li>
            <span className={`${styles.dot} ${styles.groupDot}`} />
            Group
          </li>
        </ul>
        <div className={styles.switcher} role="group" aria-label="Calendar view">
          {modes.map((item) => (
            <button key={item.id} aria-pressed={view === item.id} onClick={() => move(date, item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {/* Just the plus on phones up to 400px wide; the name stays "Add event". */}
        <button className={`${ui.button} ${ui.primary} ${styles.add}`} onClick={() => addOn(date)}>
          <PlusIcon />
          <span className={styles.addLabel}>Add event</span>
        </button>
      </div>
      {query.isPending && <Spinner label="Loading calendar…" />}
      {/* Also over events kept from before: they may be out of date. */}
      {query.isError && <Alert onRetry={() => void query.refetch()}>{query.error.message}</Alert>}
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      <div
        ref={scroller}
        className={`${styles.scroller} ${view === "agenda" ? styles.agendaScroller : ""}`}
        tabIndex={0}
        role="region"
        aria-label={`${view} calendar`}
        onPointerDown={swipeStart}
        onPointerUp={swipeEnd}
        onPointerCancel={() => (swipe.current = null)}
        onClickCapture={(e) => {
          // A swipe that ends on a day isn't a tap on it.
          if (swipe.current?.done) {
            swipe.current = null;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {view === "agenda" ? (
          // The coming days that have something planned, each with its events.
          <div key={`agenda:${first}`} className={styles.agenda} data-slide={slide}>
            {days
              .filter((day) => eventsOn(day).length)
              .map((day) => (
                <section key={day} className={styles.agendaDay} aria-labelledby={`agenda-${day}`}>
                  <h3 id={`agenda-${day}`} className={day === now ? styles.today : undefined}>
                    <time dateTime={day}>{agendaDay(day, now)}</time>
                  </h3>
                  <ul>
                    {eventsOn(day).map((event) => {
                      const { start, end } = eventDates(event);
                      const time = event.allDay
                        ? "All day"
                        : `${start.date === day ? localParts(event.startsAt).time : "…"} – ${end.date === day ? localParts(event.endsAt).time : "…"}`;
                      return (
                        <li key={event.id}>
                          <span className={styles.agendaTime}>{time}</span>
                          {eventButton(event)}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            {query.data && !days.some((day) => eventsOn(day).length) && (
              <p className={ui.muted}>Nothing planned in these {agendaLength / 7} weeks.</p>
            )}
            {query.data && (
              <Button onClick={() => setAgendaLength((n) => n + agendaDays)}>Show the next 4 weeks</Button>
            )}
          </div>
        ) : view === "month" ? (
          // data-compact-targets: on a phone, a day's number, events and "+N more" are smaller than a finger (e2e/checks.ts).
          <div key={`month:${first}`} className={styles.month} data-slide={slide} data-compact-targets>
            {days.slice(0, 7).map((day) => (
              <div className={styles.weekday} key={day}>
                {dateLabel(day, { weekday: "short" })}
              </div>
            ))}
            {/* A tap anywhere on a day, but on an event, adds an event that day; its number is the button for keyboards and screen readers.
                Its first two events, then "+1 more" (and so on), which opens the day with all of them. */}
            {days.map((day) => {
              const onDay = eventsOn(day);
              const label = dateLabel(day, { weekday: "long", day: "numeric", month: "long" });
              return (
                <div
                  key={day}
                  className={`${styles.cell} ${day.slice(0, 7) !== date.slice(0, 7) ? styles.outside : ""}`}
                  onClick={() => addOn(day)}
                >
                  <button
                    className={`${styles.dayNumber} ${day === now ? styles.today : ""}`}
                    aria-label={`${label}, add event`}
                    onClick={(e) => {
                      e.stopPropagation();
                      addOn(day);
                    }}
                  >
                    {Number(day.slice(-2))}
                  </button>
                  {onDay.slice(0, monthEvents).map((event) => eventButton(event))}
                  {onDay.length > monthEvents && (
                    <button
                      className={styles.more}
                      onClick={(e) => {
                        e.stopPropagation();
                        move(day, "day");
                      }}
                    >
                      +{onDay.length - monthEvents} more<span className={ui.srOnly}> on {label}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            key={`${view}:${first}:${length}`}
            className={`${styles.timeGrid} ${view === "week" && weekLength === 7 ? styles.week : ""}`}
            data-slide={slide}
            style={{ "--days": days.length } as CSSProperties}
          >
            <div className={styles.timeHead} />
            {days.map((day) => (
              <button
                key={day}
                className={`${styles.timeHead} ${day === now ? styles.today : ""}`}
                onClick={() => move(day, "day")}
              >
                {dateLabel(day, { weekday: "short", day: "numeric" })}
              </button>
            ))}
            {/* All-day events in a row of their own, over the hours, which stays in view as they scroll. */}
            {days.some((day) => eventsOn(day).some((event) => event.allDay)) && (
              <>
                <div className={styles.allDayLabel}>All day</div>
                {days.map((day) => (
                  <div key={day} className={styles.allDayCell}>
                    {eventsOn(day)
                      .filter((event) => event.allDay)
                      .map((event) => eventButton(event))}
                  </div>
                ))}
              </>
            )}
            <div className={styles.hours}>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
            {days.map((day) => (
              <div className={styles.dayColumn} key={day}>
                {/* A tap on an hour adds an event then; "Add event" does the same from the keyboard. */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div className={styles.hour} key={h} onClick={() => addOn(day, `${String(h).padStart(2, "0")}:00`)} />
                ))}
                {day === now && <NowLine />}
                {timedEvents(
                  eventsOn(day).filter((event) => !event.allDay),
                  day,
                ).map(({ event, top, bottom, lane, lanes }) =>
                  eventButton(
                    event,
                    {
                      position: "absolute",
                      top,
                      height: Math.min(1440 - top, bottom - top),
                      left: `${(lane * 100) / lanes}%`,
                      width: `${100 / lanes}%`,
                    },
                    !phone,
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {(selected || newEvent) && (
        <EventDialog
          key={panel}
          event={selected}
          date={newEvent?.date ?? date}
          time={newEvent?.time}
          space={space}
          userId={userId}
          onClose={closePanel}
          onSaved={(saved) => {
            storeEvent(client, saved);
            void client.invalidateQueries({ queryKey: sharedKeys.activity });
            setDate(localParts(saved.startsAt).date);
          }}
          onDelete={(event) => {
            closePanel();
            // Gone from the calendar at once; deleted for everyone when the Undo goes.
            undo.schedule({
              id: event.id,
              label: `Deleted “${event.title}”`,
              commit: () => {
                forgetEvent(client, event.id);
                eventRequest(`/${event.id}`, "DELETE").catch((err: Error) => {
                  setError(err.message);
                  void client.invalidateQueries({ queryKey: sharedKeys.events });
                });
              },
            });
          }}
        />
      )}
      <UndoToast undo={undo} />
    </section>
  );
}
