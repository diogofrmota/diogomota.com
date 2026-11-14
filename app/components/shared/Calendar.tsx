"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { Avatar } from "@/components/common/Avatar";
import { reducedMotion, SegmentThumb, stagger, useSettled } from "@/components/common/motion";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, UserIcon, UsersIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast, useUndo } from "@/components/common/Undo";
import { useAppView } from "@/hooks/useAppView";
import {
  dateLabel,
  datePlus,
  dayOfEvent,
  eventDates,
  eventFor,
  layoutWeek,
  localInstants,
  localParts,
  type CalendarEvent,
} from "@/lib/calendar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import { EventDialog } from "./EventDialog";
import { InviteLink } from "./InviteLink";
import { eventRequest, forgetEvent, sharedKeys, storeEvent } from "./shared-data";
import styles from "./Calendar.module.css";

type Mode = "agenda" | "month";
const modes: readonly { id: Mode; label: string }[] = [
  { id: "agenda", label: "Agenda" },
  { id: "month", label: "Month" },
];
/** The events a day of the month shows; past them, "+1 more" (and so on). */
const monthEvents = 2;
/** The agenda shows this many events at first, and Show more adds as many. */
const agendaPage = 20;
/** The most days the agenda lists an event of several days under (a long one's first year). */
const agendaSpan = 366;

/**
 * The grid showing now, about to be replaced (another period or view): a copy
 * of it stays over the new one and slides out the other way (or fades), 20%
 * quicker than the new one comes in, so the old state and the new overlap
 * (Calendar.module.css, [data-leaving]). Hidden from screen readers, no taps.
 */
function leaveGrid(scroller: HTMLElement | null, slide: "forward" | "back" | "fade") {
  const grid = scroller?.querySelector<HTMLElement>(":scope > [data-slide]:not([data-leaving])");
  if (!scroller || !grid || reducedMotion()) return;
  const copy = grid.cloneNode(true) as HTMLElement;
  copy.dataset.leaving = slide;
  copy.removeAttribute("data-compact-targets");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  for (const element of copy.querySelectorAll("[id]")) element.removeAttribute("id");
  Object.assign(copy.style, {
    top: `${grid.offsetTop}px`,
    left: `${grid.offsetLeft}px`,
    width: `${grid.offsetWidth}px`,
    height: `${grid.offsetHeight}px`,
  });
  scroller.append(copy);
  copy.addEventListener("animationend", (event) => event.target === copy && copy.remove());
  // In case it never ends (hidden meanwhile).
  setTimeout(() => copy.remove(), 1000);
}

function monday(date: string) {
  return datePlus(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
const today = () => localParts(new Date()).date;

// A phone opens on the agenda; larger screens open on the month.
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

// A new event's panel can include a date and time, including older saved links.
function parseNewEvent(panel: string | undefined) {
  if (!panel?.startsWith("new-event:")) return null;
  const [date, time] = panel.slice(10).split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, time: /^\d{2}:\d{2}$/.test(time ?? "") ? time : undefined } : null;
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

/**
 * The agenda's days, from `first` on, each with its events: an event of
 * several days under each of them. While there are more events to load, it
 * stops at the day the last one shown starts, so a long event doesn't list
 * days past events that aren't loaded yet.
 */
function agendaByDay(events: CalendarEvent[], first: string, more: boolean) {
  const until = more && events.length ? eventDates(events[events.length - 1]).start.date : null;
  const days = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const { start, end } = eventDates(event);
    const last = until && end.date > until ? until : end.date;
    let day = start.date < first ? first : start.date;
    for (let i = 0; day <= last && i < agendaSpan; i++, day = datePlus(day, 1)) {
      const list = days.get(day);
      if (list) list.push(event);
      else days.set(day, [event]);
    }
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

/** The events a phone's day of the month shows as bars; past them, "+1" (and so on). */
const phoneBars = 3;

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

export function Calendar({ space, userId }: { space: Space; userId: string }) {
  const client = useQueryClient();
  const phone = usePhone();
  const now = today();
  // The month shown, by one of its days; the agenda starts on it (today at first).
  const [date, setDate] = useState(now);
  // Null: the device's own, the agenda on a phone and the month otherwise.
  const [mode, setMode] = useState<Mode | null>(null);
  const view: Mode = mode ?? (phone ? "agenda" : "month");
  const [agendaCount, setAgendaCount] = useState(agendaPage);
  // The day picked in a phone's month: its events are listed under the month.
  const [picked, setPicked] = useState<string | null>(null);
  // Which way the grid last moved: it comes in from that side.
  const [slide, setSlide] = useState<"forward" | "back" | "fade">("fade");
  const [error, setError] = useState("");
  const { panels, openPanel, closePanel } = useAppView();
  const undo = useUndo();
  const scroller = useRef<HTMLDivElement>(null);
  const inviteHidden = useInviteDismissed(space.id);
  const swipe = useRef<{ x: number; y: number; done: boolean } | null>(null);

  // The month: its six weeks, from the Monday of its first.
  const first = monday(`${date.slice(0, 7)}-01`);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => datePlus(first, i)), [first]);
  const last = days[days.length - 1];

  // Only the events of the days shown are loaded (and kept while the next ones
  // load); each period's stay in memory, and in this browser for offline use.
  const from = localInstants(first, "00:00")[0];
  const to = localInstants(datePlus(last, 1), "00:00")[0];
  const monthQuery = useQuery({
    queryKey: sharedKeys.eventRange(from, to),
    queryFn: ({ signal }) =>
      eventRequest<CalendarEvent[]>(`?${new URLSearchParams({ from, to })}`, "GET", undefined, signal),
    placeholderData: keepPreviousData,
    enabled: view === "month",
    meta: { persist: true },
  });
  // The agenda: every event from the start of its first day on, agendaCount at
  // a time, and one more, which says whether there are more to show.
  const agendaFrom = localInstants(date, "00:00")[0];
  const agendaQuery = useQuery({
    queryKey: sharedKeys.upcomingFrom(agendaFrom, agendaCount),
    queryFn: ({ signal }) =>
      eventRequest<CalendarEvent[]>(
        `?${new URLSearchParams({ from: agendaFrom, limit: String(agendaCount + 1) })}`,
        "GET",
        undefined,
        signal,
      ),
    // Showing more: the ones shown stay while the next ones load. Not for another first day.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === agendaFrom ? previous : undefined),
    enabled: view === "agenda",
    meta: { persist: true },
  });
  const query = view === "month" ? monthQuery : agendaQuery;
  const deletingId = undo.pending?.id;
  const events = useMemo(() => (query.data ?? []).filter((event) => event.id !== deletingId), [query.data, deletingId]);
  const loadingMore = view === "agenda" && agendaQuery.isPlaceholderData;
  const moreEvents = view === "agenda" && (loadingMore || events.length > agendaCount);
  const agenda = useMemo(
    () => (view === "agenda" ? agendaByDay(events.slice(0, agendaCount), date, moreEvents) : []),
    [view, events, agendaCount, date, moreEvents],
  );

  const names = useMemo(() => new Map(space.members.map((m) => [m.id, memberName(m)])), [space.members]);
  const eventsOn = (day: string) =>
    events
      .filter((event) => {
        const { start, end } = eventDates(event);
        return start.date <= day && end.date >= day;
      })
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
  // The month's six weeks, and each week's events in their lanes.
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)), [days]);
  const weekEvents = useMemo(() => weeks.map((week) => layoutWeek(week, events)), [weeks, events]);
  // A phone's picked day: the one tapped, else the day the month is shown by (today, or its first).
  const pickedDay = picked && days.includes(picked) ? picked : date;
  const pickedEvents = view === "month" && phone ? eventsOn(pickedDay) : [];

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
    const direction = next < date ? "back" : next > date ? "forward" : "fade";
    if (next !== date || nextView !== view) leaveGrid(scroller.current, nextView === view ? direction : "fade");
    setSlide(direction);
    setDate(next);
    setMode(nextView);
    setPicked(null);
    if (next !== date || nextView !== view) setAgendaCount(agendaPage);
  }
  // A month on: its first day, or today for this month (where the agenda starts).
  function navigate(direction: number) {
    const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    const day = next.toISOString().slice(0, 10);
    move(day.slice(0, 7) === now.slice(0, 7) ? now : day);
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

  /** The people an event is for, who are still members (the group's events: none). */
  const membersOf = (event: CalendarEvent) =>
    event.isGroup
      ? []
      : event.assigneeIds
          .map((id) => space.members.find((m) => m.id === id))
          .filter((m): m is Space["members"][number] => !!m);

  /** An event's color, and a second one for an event of two people or more: its bar is half of each. */
  function eventColors(event: CalendarEvent): CSSProperties {
    const [first, second] = membersOf(event);
    return {
      "--event-color": first?.color ?? "var(--muted)",
      ...(second && { "--event-color-2": second.color }),
    } as CSSProperties;
  }

  /**
   * An event, as a button that opens it: who it's for (their pictures, or the
   * group's icon) and its title. In a wide month, `span` days wide (a bar
   * across an event's days) and its start time before the title; `note` is
   * which of its days this is ("day 1 of 2", the agenda).
   */
  function eventButton(event: CalendarEvent, options: { span?: number; time?: boolean; note?: string | null } = {}) {
    const members = membersOf(event);
    const who = event.isGroup ? "Group" : eventFor(event, names);
    const when = event.allDay ? "All day" : localParts(event.startsAt).time;
    const startsHere = !event.allDay && options.time;
    return (
      <button
        key={event.id}
        className={styles.event}
        data-split={members.length > 1 || undefined}
        data-span={options.span && options.span > 1 ? options.span : undefined}
        style={{ ...eventColors(event), ...(options.span && ({ "--span": options.span } as CSSProperties)) }}
        onClick={(e) => {
          e.stopPropagation();
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
                name={member.name}
                url={member.avatarUrl}
                className={styles.eventAvatar}
              />
            ))}
          </span>
        )}
        <span className={styles.eventTitle} aria-hidden="true">
          {startsHere && <span className={styles.eventTime}>{when}</span>}
          {event.title}
        </span>
        {options.note && (
          <span className={styles.eventNote} aria-hidden="true">
            {options.note}
          </span>
        )}
        <span className={ui.srOnly}>{`${event.title}, ${when}, ${who}${options.note ? `, ${options.note}` : ""}`}</span>
      </button>
    );
  }

  const heading = dateLabel(date, { month: "long", year: "numeric" });
  // The agenda's rows come in one after another the first time they show.
  const settled = useSettled(agenda.length > 0);
  let row = 0;

  // One toolbar over the grid, so the grid gets the rest of the screen: the
  // month with ‹ and › on either side of it, then Agenda | Month and Add event.
  // The tab bar's Calendar names the view; the h1 is for screen readers.
  return (
    <section
      className={`${styles.calendar} ${view === "agenda" ? styles.agendaView : ""}`}
      aria-label="Shared calendar"
    >
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
        <div className={styles.period}>
          <button type="button" className={styles.arrow} aria-label="Previous month" onClick={() => navigate(-1)}>
            <ChevronLeftIcon />
          </button>
          {/* "November 2026", or "Nov 2026" where the toolbar is narrow (the long one is still its name). */}
          <h2 aria-live="polite">
            <span className={styles.longPeriod}>{heading}</span>
            <span className={styles.shortPeriod} aria-hidden="true">
              {dateLabel(date, { month: "short", year: "numeric" })}
            </span>
          </h2>
          <button type="button" className={styles.arrow} aria-label="Next month" onClick={() => navigate(1)}>
            <ChevronRightIcon />
          </button>
        </div>
        <div className={styles.toolbarEnd}>
          <div className={styles.viewSwitch} role="group" aria-label="Calendar view">
            {modes.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => {
                  if (view !== option.id) move(date, option.id);
                }}
              >
                <span className={styles.switchLabel}>
                  <span>{option.label}</span>
                  <span aria-hidden="true">{option.label}</span>
                </span>
                {view === option.id && <SegmentThumb layoutId="calendar-view" className={styles.thumb} />}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${ui.button} ${ui.primary} ${styles.add}`}
            aria-label="Add event"
            onClick={() => addOn(date)}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
      {query.isPending && <Spinner label="Loading calendar…" />}
      {/* Also over events kept from before: they may be out of date. */}
      {query.isError && <Alert onRetry={() => void query.refetch()}>{query.error.message}</Alert>}
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      <div
        ref={scroller}
        className={`${styles.scroller} ${view === "agenda" ? styles.agendaScroller : ""}`}
        // The month scrolls in its box, so it takes the focus for the keyboard; the agenda scrolls with the page.
        tabIndex={view === "month" ? 0 : undefined}
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
          // Every event from its first day (today, at first) on, by day; Show more adds the next ones under them.
          <div key={`agenda:${date}`} className={styles.agenda} data-slide={slide}>
            {agenda.map(([day, onDay]) => (
              <section key={day} className={styles.agendaDay} aria-labelledby={`agenda-${day}`}>
                <h3 id={`agenda-${day}`} className={day === now ? styles.today : undefined}>
                  <time dateTime={day}>{agendaDay(day, now)}</time>
                </h3>
                <ul>
                  {onDay.map((event) => {
                    const { start, end } = eventDates(event);
                    const time = event.allDay
                      ? "All day"
                      : `${start.date === day ? localParts(event.startsAt).time : "…"} – ${end.date === day ? localParts(event.endsAt).time : "…"}`;
                    return (
                      <li key={event.id} style={stagger(row++, settled)}>
                        <span className={styles.agendaTime}>{time}</span>
                        {eventButton(event, { note: dayOfEvent(event, day) })}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {query.data && !agenda.length && (
              <p className={ui.muted}>
                {date === now
                  ? "Nothing planned from today on."
                  : `Nothing planned from ${dateLabel(date, { day: "numeric", month: "long", year: "numeric" })} on.`}
              </p>
            )}
            {moreEvents && (
              <Button
                className={styles.showMore}
                busy={loadingMore}
                onClick={() => setAgendaCount((n) => n + agendaPage)}
              >
                Show more
              </Button>
            )}
          </div>
        ) : phone ? (
          // A phone's month: each day its number and a short bar for each event (no text: a seventh of a phone is
          // too narrow for one), "+1" past three. A tap on a day picks it: its events are listed under the month.
          <div
            key={`month:${first}`}
            className={`${styles.month} ${styles.phoneMonth}`}
            data-slide={slide}
            data-compact-targets
          >
            {days.slice(0, 7).map((day) => (
              <div className={styles.weekday} key={day}>
                {dateLabel(day, { weekday: "narrow" })}
              </div>
            ))}
            {days.map((day) => {
              const onDay = eventsOn(day);
              const label = dateLabel(day, { weekday: "long", day: "numeric", month: "long" });
              const isPicked = day === pickedDay;
              const count = onDay.length ? `${onDay.length} event${onDay.length === 1 ? "" : "s"}` : "nothing planned";
              return (
                <div
                  key={day}
                  className={`${styles.cell} ${day.slice(0, 7) !== date.slice(0, 7) ? styles.outside : ""}`}
                  data-picked={isPicked || undefined}
                  onClick={() => setPicked(day)}
                >
                  <button
                    className={`${styles.dayNumber} ${day === now ? styles.today : ""}`}
                    aria-label={`${label}, ${count}`}
                    aria-pressed={isPicked}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPicked(day);
                    }}
                  >
                    {Number(day.slice(-2))}
                  </button>
                  <span className={styles.bars} aria-hidden="true">
                    {onDay.slice(0, phoneBars).map((event) => (
                      <span
                        key={event.id}
                        className={styles.bar}
                        data-split={membersOf(event).length > 1 || undefined}
                        style={eventColors(event)}
                      />
                    ))}
                    {onDay.length > phoneBars && <span className={styles.barsMore}>+{onDay.length - phoneBars}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          // data-compact-targets: a day's number, events and "+N more" are smaller than a finger (e2e/checks.ts).
          // Week by week: each event in its lane (layoutWeek), one of several days a bar across them.
          <div key={`month:${first}`} className={styles.month} data-slide={slide} data-compact-targets>
            {days.slice(0, 7).map((day) => (
              <div className={styles.weekday} key={day}>
                {dateLabel(day, { weekday: "short" })}
              </div>
            ))}
            {/* A tap anywhere on a day, but on an event, adds an event that day; its number is the button for keyboards and screen readers.
                Its first two lanes, then "+1 more" (and so on), which opens the day in the agenda with all of them. */}
            {weeks.map((week, w) =>
              week.map((day, col) => {
                const covering = weekEvents[w].filter((item) => item.col <= col && col < item.col + item.span);
                const hidden = covering.filter((item) => item.lane >= monthEvents).length;
                const lanes = Math.min(monthEvents, Math.max(0, ...covering.map((item) => item.lane + 1)));
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
                    {Array.from({ length: lanes }, (_, lane) => {
                      const item = covering.find((each) => each.lane === lane);
                      // An event's bar starts on its first day in the week; the days after it keep its lane free.
                      if (item?.col === col) {
                        const startDay = eventDates(item.event).start.date;
                        return eventButton(item.event, { span: item.span, time: startDay === day });
                      }
                      return <span key={`lane-${lane}`} className={styles.lane} aria-hidden="true" />;
                    })}
                    {hidden > 0 && (
                      <button
                        className={styles.more}
                        onClick={(e) => {
                          e.stopPropagation();
                          move(day, "agenda");
                        }}
                      >
                        +{hidden} more<span className={ui.srOnly}> on {label}</span>
                      </button>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        )}
      </div>
      {view === "month" && phone && (
        // The day picked in a phone's month (today, or the month's first): its events, and Add event on it.
        <section className={styles.dayList} aria-labelledby="picked-day">
          <div className={styles.dayListHeader}>
            <h3 id="picked-day">
              <time dateTime={pickedDay}>{agendaDay(pickedDay, now)}</time>
            </h3>
            <Button onClick={() => addOn(pickedDay)}>
              <PlusIcon />
              Add event
              <span className={ui.srOnly}>
                {" "}
                on {dateLabel(pickedDay, { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </Button>
          </div>
          {pickedEvents.length ? (
            <ul>
              {pickedEvents.map((event) => {
                const { start, end } = eventDates(event);
                const from = start.date === pickedDay ? localParts(event.startsAt).time : "…";
                const until = end.date === pickedDay ? localParts(event.endsAt).time : "…";
                return (
                  <li key={event.id}>
                    <span className={styles.agendaTime}>{event.allDay ? "All day" : `${from} – ${until}`}</span>
                    {eventButton(event, { note: dayOfEvent(event, pickedDay) })}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={ui.muted}>Nothing planned.</p>
          )}
        </section>
      )}
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
            // The month goes to the event's; the agenda stays, unless the event is over before it starts.
            if (view === "month" || saved.endsAt <= agendaFrom) setDate(localParts(saved.startsAt).date);
          }}
          onDelete={(event) => {
            closePanel();
            // Gone from the calendar at once; deleted for everyone when the Undo goes.
            undo.schedule({
              id: event.id,
              label: `Deleted “${event.title}”`,
              commit: () => {
                forgetEvent(client, event.id);
                eventRequest(`/${event.id}`, "DELETE")
                  // The agenda's next event takes its place.
                  .then(() => client.invalidateQueries({ queryKey: sharedKeys.upcoming }))
                  .catch((err: Error) => {
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
