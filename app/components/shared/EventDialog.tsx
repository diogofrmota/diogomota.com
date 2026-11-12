"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CalendarIcon, ChevronDownIcon, ClockIcon, CloseIcon, ExternalIcon } from "@/components/common/icons";
import { apiRequest } from "@/lib/api-request";
import {
  allDayInstants, dateLabel, datePlus, eventDates, googleCalendarLink, localInstants, localParts, type CalendarEvent,
} from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import { MemberPicker, memberName } from "./MemberPicker";
import styles from "./Calendar.module.css";

export function eventRequest<T>(path = "", method = "GET", body?: object, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/shared/events${path}`, { method, body, signal, fallback: "Could not reach your calendar. Try again." });
}

/** "12 Nov (Wed)": the date first, its weekday after it; with the year when it isn't this one ("12 Nov 2027 (Fri)"). */
export function shortDate(date: string) {
  const thisYear = date.slice(0, 4) === localParts(new Date()).date.slice(0, 4);
  return `${dateLabel(date, { day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) })} (${dateLabel(date, { weekday: "short" })})`;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

// A date or a time, typed: its blanks ("__/__/____", "__:__") fill with the
// digits as they're typed, the separators in place.
const masks = { date: "__/__/____", time: "__:__" } as const;
type Masked = keyof typeof masks;
/** What an empty field shows until it's focused; then its blanks. */
const placeholders: Record<Masked, string> = { date: "dd/mm/yyyy", time: "__:__" };
const invalidMessages: Record<Masked, string> = {
  date: "Enter a date as dd/mm/yyyy.", time: "Enter a time from 00:00 to 23:59, as hh:mm.",
};
/** The value's digits: "2026-11-15" is 15112026, "09:30" 0930. */
const digitsOf: Record<Masked, (value: string) => string> = {
  date: (value) => value ? `${value.slice(8, 10)}${value.slice(5, 7)}${value.slice(0, 4)}` : "",
  time: (value) => value.replace(":", ""),
};
/** The value the digits make ("2026-11-15", "09:30"), or null while they don't make one. */
const valueOf: Record<Masked, (digits: string) => string | null> = {
  date(digits) {
    if (digits.length < 8) return null;
    const [day, month, year] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const real = Number(year) >= 1000 && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
    return real ? `${year}-${month}-${day}` : null;
  },
  time: (digits) => digits.length === 4 && Number(digits.slice(0, 2)) < 24 && Number(digits.slice(2)) < 60
    ? `${digits.slice(0, 2)}:${digits.slice(2)}` : null,
};
const fill = (mask: string, digits: string) => { let i = 0; return mask.replace(/_/g, () => digits[i++] ?? "_"); };
/** Where the caret goes: after the last digit, or at the start. */
function caretAfter(mask: string, count: number) {
  for (let i = 0, seen = 0; i < mask.length; i++) if (mask[i] === "_" && ++seen === count) return i + 1;
  return 0;
}

// A date ("15/11/2026") or a 24-hour time ("09:30"), as text: "dd/mm/yyyy" or
// "__:__" while empty, its blanks once focused, filled in as it's typed (the
// number keys on a phone). Focused, it's all selected, so typing starts it
// over. `onChange` only once it's a whole, real date or time; until then it
// says what's wrong, and the form won't send. Not the browser's date and time
// fields: their look and order (and AM and PM) follow the device's language.
function MaskedField({ kind, label, value, onChange }: {
  kind: Masked; label: string; value: string; onChange: (value: string) => void;
}) {
  const mask = masks[kind];
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const keepSelection = useRef(false);
  const [focused, setFocused] = useState(false);
  // The digits typed while they aren't a whole value; null shows `value`.
  const [draft, setDraft] = useState<string | null>(null);
  // A new value from outside (the end following the start) replaces them.
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setDraft(null); }
  const digits = draft ?? digitsOf[kind](value);
  const text = digits || focused ? fill(mask, digits) : "";
  const invalid = draft !== null;

  useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== ref.current) return;
    ref.current!.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  useEffect(() => { ref.current?.setCustomValidity(invalid ? invalidMessages[kind] : ""); }, [invalid, kind]);

  function change(e: ChangeEvent<HTMLInputElement>) {
    const typed = e.currentTarget.value;
    let next = typed.replace(/\D/g, "");
    // A separator or a blank deleted: the digit before it goes.
    if (typed.length < text.length && next === digits) {
      const before = typed.slice(0, e.currentTarget.selectionStart ?? typed.length).replace(/\D/g, "").length;
      next = digits.slice(0, Math.max(0, before - 1)) + digits.slice(before);
    }
    next = next.slice(0, mask.split("_").length - 1);
    if (next === digits) return;
    caret.current = caretAfter(mask, next.length);
    const parsed = valueOf[kind](next);
    setDraft(parsed ? null : next);
    if (parsed && parsed !== value) onChange(parsed);
  }

  return <input ref={ref} className={`${styles.masked} ${styles[kind]}`} aria-label={label} required
    inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={placeholders[kind]} value={text}
    aria-invalid={invalid && !focused ? true : undefined} onChange={change}
    onFocus={(e) => {
      setFocused(true);
      if (digits) { e.currentTarget.select(); keepSelection.current = true; } else caret.current = 0;
    }}
    // The click that focused it would put the caret where it landed.
    onMouseUp={(e) => { if (keepSelection.current) { e.preventDefault(); keepSelection.current = false; } }}
    onBlur={() => { setFocused(false); keepSelection.current = false; }} />;
}

/** A select with its own arrow, clear of the field's right edge. */
function Select({ children, ...props }: React.ComponentProps<"select">) {
  return <span className={styles.select}>
    <select {...props}>{children}</select>
    <ChevronDownIcon />
  </span>;
}

export function EventDialog({ event, date, time, space, userId, onClose, onSaved, onDeleted }: {
  event?: CalendarEvent;
  /** A new event's day, and its start time (09:00 when not given). */
  date: string; time?: string;
  space: Space; userId: string;
  onClose: () => void; onSaved: (event: CalendarEvent) => void; onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!event);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const newStart = time ?? "09:00";
  const days = event && eventDates(event);
  const start = event ? event.allDay ? { date: days!.start.date, time: "09:00" } : localParts(event.startsAt) : { date, time: newStart };
  const end = event ? event.allDay ? { date: days!.end.date, time: "10:00" } : localParts(event.endsAt)
    : { date, time: clock(Math.min(minutes(newStart) + 60, 23 * 60 + 59)) };
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(start.date);
  const [endDate, setEndDate] = useState(end.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  // A member's id, "group", or "" for a former member's event (to be chosen again).
  const savedAssignee = event ? event.isGroup ? "group" : event.assigneeId ?? "" : userId;
  const [assignee, setAssignee] = useState(savedAssignee);
  const startOptions = allDay ? [] : localInstants(startDate, startTime);
  const endOptions = allDay ? [] : localInstants(endDate, endTime);

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
      if (endDate < startDate) { setError("The end date must be on or after the start date."); return; }
      ({ startsAt, endsAt } = allDayInstants(startDate, endDate) ?? {});
    } else {
      startsAt = startOptions[Number(form.get("startOccurrence") ?? 0)];
      endsAt = endOptions[Number(form.get("endOccurrence") ?? 0)];
      if (!startsAt || !endsAt) { setError("This local time does not exist because the clocks move forward. Choose another time."); return; }
    }
    if (!startsAt || !endsAt || endsAt <= startsAt) { setError("End time must be after start time."); return; }
    setPending(true);
    try {
      // The form has no notes: an event's own (from before) are kept.
      const saved = await eventRequest<CalendarEvent>(event ? `/${event.id}` : "", event ? "PATCH" : "POST", {
        title: form.get("title"), notes: event?.notes ?? "", startsAt, endsAt, allDay,
        isGroup: assignee === "group", assigneeId: assignee === "group" ? null : assignee,
      });
      onSaved(saved); onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  async function remove() {
    setPending(true); setError("");
    try { await eventRequest(`/${event!.id}`, "DELETE"); onDeleted(event!.id); onClose(); }
    catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }
  function cancelEdit() {
    if (!event) { onClose(); return; }
    setAllDay(event.allDay);
    setStartDate(start.date); setEndDate(end.date); setStartTime(start.time); setEndTime(end.time);
    setAssignee(savedAssignee);
    setError(""); setEditing(false);
  }
  const member = event && !event.isGroup ? space.members.find((m) => m.id === event.assigneeId) : undefined;
  const who = event?.isGroup ? "Whole group" : member ? memberName(member) : "Former member";
  const sameDay = start.date === end.date;
  return <Dialog className={styles.dialog} aria-labelledby="event-heading" onClose={onClose}><div className={styles.dialogBody}>
    <div className={styles.dialogHeader}><h2 id="event-heading">{editing ? event ? "Edit event" : "Create a new event" : event?.title}</h2>
      <button type="button" className={styles.close} aria-label="Close event" onClick={onClose}><CloseIcon /></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {editing ? <form onSubmit={save} className={styles.form}>
      <fieldset disabled={pending}>
        {/* data-autofocus when the dialog opens on the form (a new event), autoFocus when Edit event shows it. */}
        <label>Event title<input name="title" required maxLength={200} defaultValue={event?.title} autoFocus data-autofocus /></label>
        {/* When: All day, then the start and the end, each a date and (unless all day) a time. */}
        <div className={styles.when}>
          <label className={styles.switchRow}>
            <span>All day</span>
            <input type="checkbox" role="switch" className={styles.switch} checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          </label>
          <div className={styles.whenRow} role="group" aria-label="Starts">
            <span className={styles.whenLabel} aria-hidden="true">Starts</span>
            <span className={styles.chips}>
              <MaskedField kind="date" label="Start date" value={startDate} onChange={changeStartDate} />
              {!allDay && <MaskedField kind="time" label="Start time" value={startTime} onChange={changeStartTime} />}
            </span>
          </div>
          <div className={styles.whenRow} role="group" aria-label="Ends">
            <span className={styles.whenLabel} aria-hidden="true">Ends</span>
            <span className={styles.chips}>
              <MaskedField kind="date" label="End date" value={endDate} onChange={setEndDate} />
              {!allDay && <MaskedField kind="time" label="End time" value={endTime} onChange={setEndTime} />}
            </span>
          </div>
        </div>
        {startOptions.length > 1 && <label>Start occurrence<Select key={startOptions.join()} name="startOccurrence" defaultValue={Math.max(0, startOptions.indexOf(event?.startsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </Select></label>}
        {endOptions.length > 1 && <label>End occurrence<Select key={endOptions.join()} name="endOccurrence" defaultValue={Math.max(0, endOptions.indexOf(event?.endsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </Select></label>}
        <MemberPicker legend="Who?" name="assignee" members={space.members} value={assignee} allValue="group" allName="Whole group"
          onChange={setAssignee} required />
        <div className={styles.actions}><button className={styles.primary} type="submit">{pending ? "Saving…" : "Save event"}</button>
          <button type="button" onClick={cancelEdit}>Cancel</button></div>
      </fieldset>
    </form> : event && <div className={styles.details}>
      {/* Who, when: each a line after its mark (the member's color, or the icons). */}
      <div className={styles.whenDetails}>
        <p><span className={styles.assigneeDot} style={{ "--event-color": member?.color ?? "var(--muted)" } as React.CSSProperties} aria-hidden="true" />
          <span>{who}</span></p>
        <p><CalendarIcon />
          <span><time dateTime={start.date}>{shortDate(start.date)}</time>{!sameDay && <> – <time dateTime={end.date}>{shortDate(end.date)}</time></>}</span>
        </p>
        <p><ClockIcon />
          {event.allDay ? <span>All day</span>
            : <span><time dateTime={event.startsAt}>{start.time}</time> – <time dateTime={event.endsAt}>{!sameDay && `${shortDate(end.date)}, `}{end.time}</time></span>}
        </p>
      </div>
      {event.notes && <p className={styles.notes}>{event.notes}</p>}
      {/* This event only: to Google Calendar, or as a file for any other calendar. */}
      <div className={styles.actions}><a href={googleCalendarLink(event)} target="_blank" rel="noopener noreferrer">Export to Google Calendar<ExternalIcon /></a>
        <a href={`/api/shared/events/${event.id}/export`} download>Download event .ics</a></div>
      <div className={styles.actions}><button className={styles.primary} onClick={() => { setError(""); setEditing(true); setDeleting(false); }}>Edit event</button>
        <button className={styles.remove} onClick={() => setDeleting(true)}>Delete event</button></div>
      {deleting && <div className={styles.confirm}><p>Delete this event for everyone in your space?</p>
        <div className={styles.actions}><button className={styles.danger} disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Confirm delete"}</button><button disabled={pending} onClick={() => setDeleting(false)}>Keep event</button></div></div>}
    </div>}
  </div></Dialog>;
}
