"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, typesFirst } from "@/components/common/Dialog";
import { CalendarIcon, ChevronDownIcon, ClockIcon, CloseIcon, ExternalIcon } from "@/components/common/icons";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import {
  allDayInstants,
  dateLabel,
  datePlus,
  eventDates,
  eventFor,
  googleCalendarLink,
  localInstants,
  localParts,
  type CalendarEvent,
} from "@/lib/calendar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import { MaskedField } from "./MaskedField";
import { MemberPicker } from "./MemberPicker";
import { eventRequest } from "./shared-data";
import styles from "./Calendar.module.css";

/** "12 Nov (Wed)": the date first, its weekday after it; with the year when it isn't this one ("12 Nov 2027 (Fri)"). */
export function shortDate(date: string) {
  const thisYear = date.slice(0, 4) === localParts(new Date()).date.slice(0, 4);
  return `${dateLabel(date, { day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) })} (${dateLabel(date, { weekday: "short" })})`;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** A select with its own arrow, clear of the field's right edge. */
function Select({ children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={styles.select}>
      <select {...props}>{children}</select>
      <ChevronDownIcon />
    </span>
  );
}

/**
 * An event's dialog: what it is (who it's for, when), its exports, Edit event
 * and Delete event; or the form, Create a new event (Event title, when, Who?).
 * Who? selects one or more members. Events have no notes.
 * Delete event closes it and leaves the Undo to the calendar (onDelete).
 */
export function EventDialog({
  event,
  date,
  time,
  space,
  userId,
  onClose,
  onSaved,
  onDelete,
}: {
  event?: CalendarEvent;
  /** A new event's day, and its start time (09:00 when not given). */
  date: string;
  time?: string;
  space: Space;
  userId: string;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const [editing, setEditing] = useState(!event);
  // Edit event shows the form in a dialog already open: its title field takes
  // the focus then (where typesFirst), as it does when a new event's dialog
  // opens (Dialog, data-autofocus). Not with autoFocus, which the server would
  // render one way and a browser with a mouse another.
  const titleField = useRef<HTMLInputElement>(null);
  const switchedToEdit = useRef(false);
  useEffect(() => {
    if (editing && switchedToEdit.current && typesFirst()) titleField.current?.focus();
  }, [editing]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const newStart = time ?? "09:00";
  const days = event && eventDates(event);
  const start = event
    ? event.allDay
      ? { date: days!.start.date, time: "09:00" }
      : localParts(event.startsAt)
    : { date, time: newStart };
  const end = event
    ? event.allDay
      ? { date: days!.end.date, time: "10:00" }
      : localParts(event.endsAt)
    : { date, time: clock(Math.min(minutes(newStart) + 60, 23 * 60 + 59)) };
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(start.date);
  const [endDate, setEndDate] = useState(end.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  // Existing group events start with every current member selected. A former
  // member's event has to be given to someone again.
  const savedWho = event
    ? event.isGroup
      ? space.members.map((member) => member.id)
      : event.assigneeIds.filter((id) => space.members.some((m) => m.id === id))
    : [userId];
  const [who, setWho] = useState<string[]>(savedWho);
  const startOptions = allDay ? [] : localInstants(startDate, startTime);
  const endOptions = allDay ? [] : localInstants(endDate, endTime);
  const names = new Map(space.members.map((m) => [m.id, memberName(m)]));

  // Moving the start keeps the event's length where it can: the end date follows
  // the start date, and on one day the end time follows the start time (an end
  // that wasn't after the start moves an hour past it), up to 23:59.
  function changeStartDate(value: string) {
    if (value && startDate && endDate) {
      const shift = Math.round((Date.parse(value) - Date.parse(startDate)) / 86_400_000);
      setEndDate(datePlus(endDate, shift));
    }
    setStartDate(value);
  }
  function changeStartTime(value: string) {
    setStartTime(value);
    if (startDate === endDate) {
      const length = minutes(endTime) - minutes(startTime);
      setEndTime(clock(Math.min(minutes(value) + (length > 0 ? length : 60), 23 * 60 + 59)));
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    let startsAt: string | undefined, endsAt: string | undefined;
    if (allDay) {
      if (endDate < startDate) {
        setError("The end date must be on or after the start date.");
        return;
      }
      ({ startsAt, endsAt } = allDayInstants(startDate, endDate) ?? {});
    } else {
      startsAt = startOptions[Number(form.get("startOccurrence") ?? 0)];
      endsAt = endOptions[Number(form.get("endOccurrence") ?? 0)];
      if (!startsAt || !endsAt) {
        setError("This local time does not exist because the clocks move forward. Choose another time.");
        return;
      }
    }
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      setError("End time must be after start time.");
      return;
    }
    if (!who.length) {
      setError("Choose who it's for: one or more people.");
      return;
    }
    setPending(true);
    try {
      const isGroup = false;
      const saved = await eventRequest<CalendarEvent>(event ? `/${event.id}` : "", event ? "PATCH" : "POST", {
        title: String(form.get("title") ?? ""),
        startsAt,
        endsAt,
        allDay,
        isGroup,
        assigneeIds: isGroup ? [] : who,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }
  function cancelEdit() {
    if (!event) {
      onClose();
      return;
    }
    setAllDay(event.allDay);
    setStartDate(start.date);
    setEndDate(end.date);
    setStartTime(start.time);
    setEndTime(end.time);
    setWho(savedWho);
    setError("");
    setEditing(false);
  }
  // Who it's for, as the calendar shows it: their color, half and half for two people or more.
  const colors =
    event && !event.isGroup
      ? event.assigneeIds.flatMap((id) => space.members.find((m) => m.id === id)?.color ?? [])
      : [];
  const forWhom = event ? eventFor(event, names) : "";
  const sameDay = start.date === end.date;
  return (
    <Dialog className={styles.dialog} aria-labelledby="event-heading" onClose={onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id="event-heading">{editing ? (event ? "Edit event" : "Create a new event") : event?.title}</h2>
          <button type="button" className={styles.close} aria-label="Close event" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {error && <Alert>{error}</Alert>}
        {editing ? (
          <form onSubmit={save} className={styles.form}>
            <fieldset disabled={pending}>
              {/* Focused when the dialog opens on the form (a new event: data-autofocus) and when Edit event
                  shows it (the effect above); not on a touch screen, where the keyboard would come up over
                  the form before it's seen. */}
              <label>
                Event title
                <input
                  name="title"
                  required
                  maxLength={200}
                  defaultValue={event?.title}
                  ref={titleField}
                  data-autofocus
                />
              </label>
              {/* When: All day, then the start and the end, each a date and (unless all day) a time. */}
              <div className={styles.when}>
                <label className={styles.switchRow}>
                  <span>All day</span>
                  <input
                    type="checkbox"
                    role="switch"
                    className={styles.switch}
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                  />
                </label>
                <div className={styles.whenRow} role="group" aria-label="Starts">
                  <span className={styles.whenLabel} aria-hidden="true">
                    Starts
                  </span>
                  <span className={styles.chips}>
                    <MaskedField
                      kind="date"
                      label="Start date"
                      value={startDate}
                      onChange={changeStartDate}
                      className={`${styles.masked} ${styles.date}`}
                    />
                    {!allDay && (
                      <MaskedField
                        kind="time"
                        label="Start time"
                        value={startTime}
                        onChange={changeStartTime}
                        className={`${styles.masked} ${styles.time}`}
                      />
                    )}
                  </span>
                </div>
                <div className={styles.whenRow} role="group" aria-label="Ends">
                  <span className={styles.whenLabel} aria-hidden="true">
                    Ends
                  </span>
                  <span className={styles.chips}>
                    <MaskedField
                      kind="date"
                      label="End date"
                      value={endDate}
                      onChange={setEndDate}
                      className={`${styles.masked} ${styles.date}`}
                    />
                    {!allDay && (
                      <MaskedField
                        kind="time"
                        label="End time"
                        value={endTime}
                        onChange={setEndTime}
                        className={`${styles.masked} ${styles.time}`}
                      />
                    )}
                  </span>
                </div>
              </div>
              {startOptions.length > 1 && (
                <label>
                  Start occurrence
                  <Select
                    key={startOptions.join()}
                    name="startOccurrence"
                    defaultValue={Math.max(0, startOptions.indexOf(event?.startsAt ?? ""))}
                  >
                    <option value="0">First occurrence (summer time)</option>
                    <option value="1">Second occurrence (standard time)</option>
                  </Select>
                </label>
              )}
              {endOptions.length > 1 && (
                <label>
                  End occurrence
                  <Select
                    key={endOptions.join()}
                    name="endOccurrence"
                    defaultValue={Math.max(0, endOptions.indexOf(event?.endsAt ?? ""))}
                  >
                    <option value="0">First occurrence (summer time)</option>
                    <option value="1">Second occurrence (standard time)</option>
                  </Select>
                </label>
              )}
              <MemberPicker
                legend="Who?"
                name="assignee"
                members={space.members}
                multiple
                values={who}
                onChangeMany={setWho}
              />
              <div className={ui.actions}>
                <Button variant="primary" type="submit" busy={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button onClick={cancelEdit}>Cancel</Button>
              </div>
            </fieldset>
          </form>
        ) : (
          event && (
            <div className={styles.details}>
              {/* Who, when: each a line after its mark (the first member's color, or the icons). */}
              <div className={styles.whenDetails}>
                <p>
                  <span
                    className={styles.assigneeDot}
                    data-split={colors.length > 1 || undefined}
                    style={
                      {
                        "--event-color": colors[0] ?? "var(--muted)",
                        "--event-color-2": colors[1] ?? colors[0],
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                  <span>{forWhom}</span>
                </p>
                <p>
                  <CalendarIcon />
                  <span>
                    <time dateTime={start.date}>{shortDate(start.date)}</time>
                    {!sameDay && (
                      <>
                        {" "}
                        – <time dateTime={end.date}>{shortDate(end.date)}</time>
                      </>
                    )}
                  </span>
                </p>
                <p>
                  <ClockIcon />
                  {event.allDay ? (
                    <span>All day</span>
                  ) : (
                    <span>
                      <time dateTime={event.startsAt}>{start.time}</time> –{" "}
                      <time dateTime={event.endsAt}>
                        {!sameDay && `${shortDate(end.date)}, `}
                        {end.time}
                      </time>
                    </span>
                  )}
                </p>
              </div>
              {/* This event only, in one button: to Google Calendar, or as a file for Apple's, Outlook or
                  any other calendar. Settings has the whole calendar, as a subscription. */}
              <details className={styles.addTo}>
                <summary className={ui.button}>
                  <CalendarIcon />
                  Add to my calendar
                  <ChevronDownIcon />
                </summary>
                <ul>
                  <li>
                    <a href={googleCalendarLink(event, forWhom)} target="_blank" rel="noopener noreferrer">
                      Google Calendar
                      <ExternalIcon />
                    </a>
                  </li>
                  <li>
                    <a href={`/api/shared/events/${event.id}/export`} download>
                      Apple or Outlook (.ics)
                    </a>
                  </li>
                </ul>
              </details>
              <div className={ui.actions}>
                <Button
                  variant="primary"
                  onClick={() => {
                    setError("");
                    switchedToEdit.current = true;
                    setEditing(true);
                  }}
                >
                  Edit event
                </Button>
                <Button variant="remove" onClick={() => onDelete(event)}>
                  Delete event
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </Dialog>
  );
}
