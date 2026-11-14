"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
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
  type CalendarEvent,
} from "@/lib/calendar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import { EventDialog } from "./EventDialog";
import { InviteLink } from "./InviteLink";
import { eventRequest, forgetEvent, sharedKeys, storeEvent } from "./shared-data";
import styles from "./Calendar.module.css";

type Mode = "agenda" | "month";
/** The events a day of the month shows; past them, "+1 more" (and so on). */
const monthEvents = 2;
/** The agenda shows this many days at a time, and Show more adds as many. */
const agendaDays = 28;

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
  const [date, setDate] = useState(now);
  // Null: the device's own, the agenda on a phone and the month otherwise.
  const [mode, setMode] = useState<Mode | null>(null);
  const view: Mode = mode ?? (phone ? "agenda" : "month");
  const [agendaLength, setAgendaLength] = useState(agendaDays);
  // Which way the grid last moved: it comes in from that side.
  const [slide, setSlide] = useState<"forward" | "back" | "fade">("fade");
  const [error, setError] = useState("");
  const { panels, openPanel, closePanel } = useAppView();
  const undo = useUndo();
  const scroller = useRef<HTMLDivElement>(null);
  const inviteHidden = useInviteDismissed(space.id);
  const swipe = useRef<{ x: number; y: number; done: boolean } | null>(null);

  const first = view === "month" ? monday(`${date.slice(0, 7)}-01`) : date;
  const length = view === "month" ? 42 : agendaLength;
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
    const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    move(next.toISOString().slice(0, 10));
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

  function eventButton(event: CalendarEvent) {
    const members = event.assigneeIds
      .map((id) => space.members.find((m) => m.id === id))
      .filter((m): m is Space["members"][number] => !!m);
    const who = event.isGroup ? "Group" : eventFor(event, names);
    const when = event.allDay ? "All day" : localParts(event.startsAt).time;
    return (
      <button
        key={event.id}
        className={styles.event}
        style={{
          ...({
            "--event-color": event.isGroup ? "var(--muted)" : (members[0]?.color ?? "var(--muted)"),
          } as CSSProperties),
        }}
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
      </button>
    );
  }

  const heading = dateLabel(date, { month: "long", year: "numeric" });

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
      <div className={styles.toolbar} role="group" aria-label="Calendar view">
        <button className={styles.arrow} aria-label="Previous period" onClick={() => navigate(-1)}>
          <ChevronLeftIcon />
        </button>
        <h2 aria-live="polite">{heading}</h2>
        <button className={styles.arrow} aria-label="Next period" onClick={() => navigate(1)}>
          <ChevronRightIcon />
        </button>
        <button
          className={styles.viewToggle}
          aria-label={view === "month" ? "Agenda" : "Month"}
          onClick={() => move(date, view === "month" ? "agenda" : "month")}
        >
          {view === "month" ? "Agenda" : "Month"}
        </button>
        <button
          className={ui.button + " " + ui.primary + " " + styles.add}
          aria-label="Add event"
          onClick={() => addOn(date)}
        >
          <PlusIcon />
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
        ) : (
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
                        move(day, "agenda");
                      }}
                    >
                      +{onDay.length - monthEvents} more<span className={ui.srOnly}> on {label}</span>
                    </button>
                  )}
                </div>
              );
            })}
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
