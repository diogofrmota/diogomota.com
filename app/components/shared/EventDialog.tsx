"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { apiRequest } from "@/lib/api-request";
import { calendarZone, googleCalendarLink, localInstants, localParts, type CalendarEvent } from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import styles from "./Calendar.module.css";

export function eventRequest<T>(path = "", method = "GET", body?: object, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/shared/events${path}`, { method, body, signal, fallback: "Could not reach your calendar. Try again." });
}

export function EventDialog({ event, date, space, userId, onClose, onSaved, onDeleted }: {
  event?: CalendarEvent; date: string; space: Space; userId: string;
  onClose: () => void; onSaved: (event: CalendarEvent) => void; onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!event);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const start = event ? localParts(event.startsAt) : { date, time: "09:00" };
  const end = event ? localParts(event.endsAt) : { date, time: "10:00" };
  const [startDate, setStartDate] = useState(start.date);
  const [endDate, setEndDate] = useState(end.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const startOptions = localInstants(startDate, startTime);
  const endOptions = localInstants(endDate, endTime);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    const startsAt = startOptions[Number(form.get("startOccurrence") ?? 0)];
    const endsAt = endOptions[Number(form.get("endOccurrence") ?? 0)];
    if (!startsAt || !endsAt) { setError("This local time does not exist because the clocks move forward. Choose another time."); return; }
    if (endsAt <= startsAt) { setError("End time must be after start time."); return; }
    setPending(true);
    try {
      const assignee = form.get("assignee");
      const saved = await eventRequest<CalendarEvent>(event ? `/${event.id}` : "", event ? "PATCH" : "POST", {
        title: form.get("title"), notes: form.get("notes"), startsAt, endsAt,
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
    setStartDate(start.date); setEndDate(end.date); setStartTime(start.time); setEndTime(end.time);
    setError(""); setEditing(false);
  }
  const assignee = event?.isGroup ? "Whole group" : space.members.find((m) => m.id === event?.assigneeId)?.username ?? "Former member";
  return <Dialog className={styles.dialog} aria-labelledby="event-heading" onClose={onClose}><div className={styles.dialogBody}>
    <div className={styles.dialogHeader}><h2 id="event-heading">{editing ? event ? "Edit event" : "New event" : event?.title}</h2>
      <button type="button" aria-label="Close event" onClick={onClose}>×</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {editing ? <form onSubmit={save} className={styles.form}>
      <fieldset disabled={pending}>
        {/* data-autofocus when the dialog opens on the form (a new event), autoFocus when Edit event shows it. */}
        <label>Title<input name="title" required maxLength={200} defaultValue={event?.title} autoFocus data-autofocus /></label>
        <div className={styles.fields}>
          <label>Date<input type="date" required value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate === startDate) setEndDate(e.target.value); }} /></label>
          <label>End date<input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label>Start time<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
          <label>End time<input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
        </div>
        <p className={styles.muted}>Time zone: {calendarZone}</p>
        {startOptions.length > 1 && <label>Start occurrence<select key={startOptions.join()} name="startOccurrence" defaultValue={Math.max(0, startOptions.indexOf(event?.startsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </select></label>}
        {endOptions.length > 1 && <label>End occurrence<select key={endOptions.join()} name="endOccurrence" defaultValue={Math.max(0, endOptions.indexOf(event?.endsAt ?? ""))}>
          <option value="0">First occurrence (summer time)</option><option value="1">Second occurrence (standard time)</option>
        </select></label>}
        <label>Assignee<select name="assignee" defaultValue={event ? event.isGroup ? "group" : event.assigneeId ?? "" : userId} required>
          {event && !event.isGroup && !event.assigneeId && <option value="" disabled>Choose a member</option>}
          <option value="group">Whole group</option>
          {space.members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
        </select></label>
        <label>Notes (optional)<textarea name="notes" rows={3} maxLength={10000} defaultValue={event?.notes} /></label>
        <div className={styles.actions}><button className={styles.primary} type="submit">{pending ? "Saving…" : "Save event"}</button>
          <button type="button" onClick={cancelEdit}>Cancel</button></div>
      </fieldset>
    </form> : event && <div className={styles.details}>
      <p className={styles.badge}>{assignee}</p>
      <p><time dateTime={event.startsAt}>{start.date} · {start.time}</time> – <time dateTime={event.endsAt}>{end.date !== start.date && `${end.date} · `}{end.time}</time></p>
      {event.notes && <p className={styles.notes}>{event.notes}</p>}
      {/* This event only: to Google Calendar, or as a file for any other calendar. */}
      <div className={styles.actions}><a href={googleCalendarLink(event)} target="_blank" rel="noopener noreferrer">Export to Google Calendar ↗</a>
        <a href={`/api/shared/events/${event.id}/export`} download>Download event .ics</a></div>
      <div className={styles.actions}><button className={styles.primary} onClick={() => { setError(""); setEditing(true); setDeleting(false); }}>Edit event</button>
        <button className={styles.remove} onClick={() => setDeleting(true)}>Delete event</button></div>
      {deleting && <div className={styles.confirm}><p>Delete this event for everyone in your space?</p>
        <div className={styles.actions}><button className={styles.danger} disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Confirm delete"}</button><button disabled={pending} onClick={() => setDeleting(false)}>Keep event</button></div></div>}
    </div>}
  </div></Dialog>;
}
