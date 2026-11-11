"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CalendarIcon, ChevronDownIcon, ClockIcon, CloseIcon, ExternalIcon } from "@/components/common/icons";
import { apiRequest } from "@/lib/api-request";
import {
  allDayInstants, dateLabel, datePlus, eventDates, googleCalendarLink, localInstants, localParts, type CalendarEvent,
} from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import styles from "./Calendar.module.css";

export function eventRequest<T>(path = "", method = "GET", body?: object, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/shared/events${path}`, { method, body, signal, fallback: "Could not reach your calendar. Try again." });
}

/** "Wed 12 Nov", with the year when it isn't this one. */
export function shortDate(date: string) {
  const thisYear = date.slice(0, 4) === localParts(new Date()).date.slice(0, 4);
  return dateLabel(date, { weekday: "short", day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) });
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

// A date or a time as a chip that shows it in words ("Wed 12 Nov", "09:30"),
// over the browser's own field, which is invisible and fills the chip: a tap or
// a click opens the browser's picker (a calendar, or the time wheels on a phone).
function PickerChip({ type, label, value, onChange }: {
  type: "date" | "time"; label: string; value: string; onChange: (value: string) => void;
}) {
  return <span className={`${styles.chip} ${type === "time" ? styles.timeChip : ""}`}>
    <span aria-hidden="true">{value ? type === "date" ? shortDate(value) : value : "—"}</span>
    <input type={type} aria-label={label} required value={value} onChange={(e) => onChange(e.target.value)}
      onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* not supported: the field still edits */ } }} />
  </span>;
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
  const startOptions = allDay ? [] : localInstants(startDate, startTime);
  const endOptions = allDay ? [] : localInstants(endDate, endTime);

  // Moving the start keeps the event's length where it can: the end date follows
  // the start date, and an end time no longer after the start moves an hour past it.
  function changeStartDate(value: string) {
    if (value && startDate && endDate) {
      const shift = Math.round((Date.parse(value) - Date.parse(startDate)) / 86_400_000);
      setEndDate(datePlus(endDate, shift));
    }
    setStartDate(value);
  }
  function changeStartTime(value: string) {
    setStartTime(value);
    if (value && startDate === endDate && endTime && minutes(endTime) <= minutes(value)) {
      setEndTime(clock(Math.min(minutes(value) + 60, 23 * 60 + 59)));
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
      const assignee = form.get("assignee");
      const saved = await eventRequest<CalendarEvent>(event ? `/${event.id}` : "", event ? "PATCH" : "POST", {
        title: form.get("title"), notes: form.get("notes"), startsAt, endsAt, allDay,
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
    setError(""); setEditing(false);
  }
  const member = event && !event.isGroup ? space.members.find((m) => m.id === event.assigneeId) : undefined;
  const assignee = event?.isGroup ? "Whole group" : member?.username ?? "Former member";
  const sameDay = start.date === end.date;
  return <Dialog className={styles.dialog} aria-labelledby="event-heading" onClose={onClose}><div className={styles.dialogBody}>
    <div className={styles.dialogHeader}><h2 id="event-heading">{editing ? event ? "Edit event" : "New event" : event?.title}</h2>
      <button type="button" className={styles.close} aria-label="Close event" onClick={onClose}><CloseIcon /></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {editing ? <form onSubmit={save} className={styles.form}>
      <fieldset disabled={pending}>
        {/* data-autofocus when the dialog opens on the form (a new event), autoFocus when Edit event shows it. */}
        <label>Title<input name="title" required maxLength={200} defaultValue={event?.title} autoFocus data-autofocus /></label>
        {/* When: All day, then the start and the end, each a date and (unless all day) a time. */}
        <div className={styles.when}>
          <label className={styles.switchRow}>
            <span>All day</span>
            <input type="checkbox" role="switch" className={styles.switch} checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          </label>
          <div className={styles.whenRow} role="group" aria-label="Starts">
            <span className={styles.whenLabel} aria-hidden="true">Starts</span>
            <span className={styles.chips}>
              <PickerChip type="date" label="Start date" value={startDate} onChange={changeStartDate} />
              {!allDay && <PickerChip type="time" label="Start time" value={startTime} onChange={changeStartTime} />}
            </span>
          </div>
          <div className={styles.whenRow} role="group" aria-label="Ends">
            <span className={styles.whenLabel} aria-hidden="true">Ends</span>
            <span className={styles.chips}>
              <PickerChip type="date" label="End date" value={endDate} onChange={setEndDate} />
              {!allDay && <PickerChip type="time" label="End time" value={endTime} onChange={setEndTime} />}
            </span>
          </div>
        </div>
        {startOptions.length > 1 && <label>Start occurrence<Select key={startOptions.join()} name="startOccurrence" defaultValue={Math.max(0, startOptions.indexOf(event?.startsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </Select></label>}
        {endOptions.length > 1 && <label>End occurrence<Select key={endOptions.join()} name="endOccurrence" defaultValue={Math.max(0, endOptions.indexOf(event?.endsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </Select></label>}
        <label>Assignee<Select name="assignee" defaultValue={event ? event.isGroup ? "group" : event.assigneeId ?? "" : userId} required>
          {event && !event.isGroup && !event.assigneeId && <option value="" disabled>Choose a member</option>}
          <option value="group">Whole group</option>
          {space.members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
        </Select></label>
        <label>Notes (optional)<textarea name="notes" rows={3} maxLength={10000} defaultValue={event?.notes} /></label>
        <div className={styles.actions}><button className={styles.primary} type="submit">{pending ? "Saving…" : "Save event"}</button>
          <button type="button" onClick={cancelEdit}>Cancel</button></div>
      </fieldset>
    </form> : event && <div className={styles.details}>
      {/* Who, when: each a line after its mark (the member's color, or the icons). */}
      <div className={styles.whenDetails}>
        <p><span className={styles.assigneeDot} style={{ "--event-color": member?.color ?? "var(--muted)" } as React.CSSProperties} aria-hidden="true" />
          <span>{assignee}</span></p>
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
