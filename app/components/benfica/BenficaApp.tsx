"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import { Dialog } from "@/components/common/Dialog";
import { Alert, Button, buttonClass } from "@/components/common/ui";
import { UndoToast, useUndo } from "@/components/common/Undo";
import { MaskedField } from "@/components/shared/MaskedField";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest } from "@/lib/api-request";
import {
  attendanceLabels,
  ticketLabels,
  reminderLabels,
  fixtureInput,
  isStadiumDay,
  type Fixture,
  type FixtureInput,
} from "@/lib/benfica-types";
import { dateLabel, datePlus, localInstants, localParts } from "@/lib/calendar";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import styles from "./Benfica.module.css";

const fixtureKey = ["benfica"];
const request = <T,>(url: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}) =>
  apiRequest<T>(url, { ...options, fallback: "Could not load or save your matches. Please try again." });
function useFixtures() {
  return useQuery({
    queryKey: fixtureKey,
    queryFn: ({ signal }) => request<Fixture[]>("/api/benfica", { signal }),
    meta: { persist: true },
  });
}
const exportUrl = (id: string) => `/api/benfica/export?${new URLSearchParams({ id })}`;
function Kickoff({ kickoff }: { kickoff: string }) {
  const local = localParts(kickoff);
  return (
    <time dateTime={kickoff}>
      {dateLabel(local.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {local.time}
    </time>
  );
}

function FixtureCard({ fixture, onRemove }: { fixture: Fixture; onRemove: () => void }) {
  const { openPanel } = useAppView();
  return (
    <li className={styles.match}>
      <div className={styles.matchTop}>
        <div className={styles.details}>
          <p className={styles.muted}>{fixture.competition}</p>
          <h2>Benfica vs {fixture.opponent}</h2>
          <Kickoff kickoff={fixture.kickoff} />
        </div>
        <span className={styles.badge} data-going={fixture.attendance === "going" || undefined}>
          {attendanceLabels[fixture.attendance]}
        </span>
      </div>
      <div className={styles.meta}>
        <span>Ticket: {ticketLabels[fixture.ticket]}</span>
        <span>Reminder: {fixture.reminderMinutes === null ? "Off" : reminderLabels[fixture.reminderMinutes]}</span>
      </div>
      <div className={styles.actions}>
        <Button onClick={() => openPanel(`match:${fixture.id}`)}>Edit match</Button>
        <a className={buttonClass()} href={exportUrl(fixture.id)} download="benfica.ics">
          Export event
        </a>
        <Button variant="remove" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  );
}

function FixturesView() {
  const fixtures = useFixtures();
  const client = useQueryClient();
  const { openPanel } = useAppView();
  const [period, setPeriod] = useState("upcoming");
  const [search, setSearch] = useState("");
  const undo = useUndo();
  const remove = useMutation({
    networkMode: "always",
    mutationFn: (id: string) => request(`/api/benfica/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: fixtureKey }),
  });
  const today = localParts(new Date()).date;
  const visible = (fixtures.data ?? []).filter(
    (fixture) =>
      fixture.id !== undo.pending?.id &&
      (period === "all" || localParts(fixture.kickoff).date >= today) &&
      `${fixture.opponent} ${fixture.competition}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <section className={styles.view}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Benfica · Estádio da Luz</p>
          <h1 className={ui.heading}>Home fixtures</h1>
          <p className={styles.muted}>Plan your next day at the stadium. All times are Lisbon time.</p>
        </div>
        <Button variant="primary" onClick={() => openPanel("new")}>
          Add match
        </Button>
      </header>
      <div className={styles.filters}>
        <label className={ui.field}>
          Search fixtures
          <input
            className={ui.input}
            type="search"
            placeholder="Opponent or competition"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Show
          <select className={ui.input} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="upcoming">Upcoming fixtures</option>
            <option value="all">All fixtures</option>
          </select>
        </label>
      </div>
      {fixtures.isPending && <p role="status">Loading your matches…</p>}
      {fixtures.error && <Alert onRetry={() => void fixtures.refetch()}>{fixtures.error.message}</Alert>}
      {remove.error && <Alert onDismiss={() => remove.reset()}>{remove.error.message}</Alert>}
      {fixtures.isSuccess && visible.length === 0 && (
        <div className={styles.empty}>
          <CalendarIcon />
          <h2>{search ? "No matching fixtures" : "Your next stadium day starts here"}</h2>
          <p>
            {search
              ? "Try another opponent or competition."
              : "Add a home match, then choose whether you're going and sort out your ticket."}
          </p>
          {!search && <Button onClick={() => openPanel("new")}>Add your first match</Button>}
        </div>
      )}
      <ul className={styles.matches}>
        {visible.map((fixture) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            onRemove={() =>
              undo.schedule({
                id: fixture.id,
                label: `Removed Benfica vs ${fixture.opponent}`,
                commit: () => remove.mutate(fixture.id),
              })
            }
          />
        ))}
      </ul>
      <UndoToast undo={undo} />
    </section>
  );
}

function CalendarView() {
  const fixtures = useFixtures();
  const { openPanel } = useAppView();
  const [month, setMonth] = useState(() => localParts(new Date()).date.slice(0, 7));
  const [all, setAll] = useState(false);
  const today = localParts(new Date()).date;
  const first = `${month}-01`;
  const start = datePlus(first, -(new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7);
  const planned = (fixtures.data ?? []).filter((fixture) => all || isStadiumDay(fixture));
  const days = Array.from({ length: 42 }, (_, i) => datePlus(start, i));
  const inMonth = planned.filter((fixture) => localParts(fixture.kickoff).date.startsWith(month));
  function move(delta: number) {
    const date = new Date(`${first}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  }
  return (
    <section className={styles.view}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Benfica · Estádio da Luz</p>
          <h1 className={ui.heading}>Stadium days</h1>
          <p className={styles.muted}>Your Going and Maybe plans, in Lisbon time.</p>
        </div>
        <a className={buttonClass()} href="/api/benfica/export" download="benfica.ics">
          Export upcoming plans
        </a>
      </header>
      <div className={styles.monthBar}>
        <Button aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeftIcon />
        </Button>
        <h2>{dateLabel(first, { month: "long", year: "numeric" })}</h2>
        <Button aria-label="Next month" onClick={() => move(1)}>
          <ChevronRightIcon />
        </Button>
        <Button onClick={() => setMonth(today.slice(0, 7))}>This month</Button>
      </div>
      <label className={styles.checkbox}>
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Show all fixtures
      </label>
      {fixtures.isPending && <p role="status">Loading your matches…</p>}
      {fixtures.error && <Alert onRetry={() => void fixtures.refetch()}>{fixtures.error.message}</Alert>}
      <div className={styles.calendar} aria-label={dateLabel(first, { month: "long", year: "numeric" })}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className={styles.weekday} key={day}>
            {day}
          </span>
        ))}
        {days.map((day) => {
          const matches = planned.filter((fixture) => localParts(fixture.kickoff).date === day);
          return (
            <div
              key={day}
              className={styles.day}
              data-outside={!day.startsWith(month) || undefined}
              data-today={day === today || undefined}
            >
              <span>{Number(day.slice(8))}</span>
              {matches.length > 0 && (
                <span
                  className={styles.dayDot}
                  role="img"
                  aria-label={`${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
                />
              )}
              {matches.map((fixture) => (
                <button
                  key={fixture.id}
                  className={styles.dayMatch}
                  onClick={() => openPanel(`match:${fixture.id}`)}
                  aria-label={`${localParts(fixture.kickoff).time} · ${fixture.opponent}, Benfica home match, ${day}, ${attendanceLabels[fixture.attendance]}`}
                >
                  {localParts(fixture.kickoff).time} · {fixture.opponent}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <h2 className={styles.sectionHeading}>Matches this month</h2>
      {fixtures.isSuccess && inMonth.length === 0 && (
        <p className={styles.muted}>
          {all
            ? "No home fixtures this month."
            : "No stadium plans this month. Mark a fixture Going or Maybe to see it here."}
        </p>
      )}
      <ul className={styles.agenda}>
        {inMonth.map((fixture) => (
          <li key={fixture.id}>
            <Button className={styles.agendaMatch} onClick={() => openPanel(`match:${fixture.id}`)}>
              <strong>Benfica vs {fixture.opponent}</strong>
              <Kickoff kickoff={fixture.kickoff} />
              <span>
                {attendanceLabels[fixture.attendance]} · {ticketLabels[fixture.ticket]}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Exports include upcoming Going and Maybe plans. Import the .ics file into Apple, Google or Outlook Calendar to
        receive reminders. After changing a fixture, export it again; imports do not sync automatically.
      </p>
    </section>
  );
}

function MatchForm({ fixture }: { fixture?: Fixture }) {
  const { closePanel } = useAppView();
  const client = useQueryClient();
  const [opponent, setOpponent] = useState(fixture?.opponent ?? "");
  const [competition, setCompetition] = useState(fixture?.competition ?? "");
  const local = fixture ? localParts(fixture.kickoff) : { date: localParts(new Date()).date, time: "20:00" };
  const [date, setDate] = useState(local.date);
  const [time, setTime] = useState(local.time);
  const [occurrence, setOccurrence] = useState("");
  const [attendance, setAttendance] = useState<FixtureInput["attendance"]>(fixture?.attendance ?? "undecided");
  const [ticket, setTicket] = useState<FixtureInput["ticket"]>(fixture?.ticket ?? "needed");
  const [reminder, setReminder] = useState(String(fixture?.reminderMinutes ?? ""));
  const [error, setError] = useState("");
  const instants = localInstants(date, time);
  const selected =
    instants.length === 1
      ? instants[0]
      : instants.includes(occurrence)
        ? occurrence
        : fixture && instants.includes(fixture.kickoff)
          ? fixture.kickoff
          : "";
  const save = useMutation({
    networkMode: "always",
    mutationFn: (body: FixtureInput) =>
      request(fixture ? `/api/benfica/${fixture.id}` : "/api/benfica", { method: fixture ? "PATCH" : "POST", body }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: fixtureKey });
      closePanel();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError(
        instants.length > 1
          ? "Choose which occurrence of this Lisbon time."
          : "This Lisbon time does not exist. Choose another kickoff time.",
      );
      return;
    }
    const parsed = fixtureInput.safeParse({
      opponent,
      competition,
      kickoff: selected,
      attendance,
      ticket,
      reminderMinutes: reminder === "" ? null : Number(reminder),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    save.mutate(parsed.data);
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <h2 className={ui.heading}>{fixture ? "Edit match" : "Add home match"}</h2>
      <p className={styles.muted}>Benfica at Estádio da Luz. Enter kickoff in Lisbon time.</p>
      {(error || save.error) && <Alert>{error || save.error?.message}</Alert>}
      <label className={ui.field}>
        Opponent
        <input
          className={ui.input}
          required
          maxLength={200}
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
        />
      </label>
      <label className={ui.field}>
        Competition
        <input
          className={ui.input}
          required
          maxLength={200}
          placeholder="e.g. Liga Portugal"
          value={competition}
          onChange={(e) => setCompetition(e.target.value)}
        />
      </label>
      <div className={styles.formDates}>
        <label className={ui.field}>
          Match date
          <MaskedField
            kind="date"
            label="Match date"
            className={ui.input}
            value={date}
            onChange={(value) => {
              setDate(value);
              setOccurrence("");
            }}
          />
        </label>
        <label className={ui.field}>
          Kickoff
          <MaskedField
            kind="time"
            label="Kickoff"
            className={ui.input}
            value={time}
            onChange={(value) => {
              setTime(value);
              setOccurrence("");
            }}
          />
        </label>
      </div>
      {instants.length > 1 && (
        <label className={ui.field}>
          Clock change
          <select className={ui.input} value={selected} onChange={(e) => setOccurrence(e.target.value)} required>
            <option value="">Choose occurrence</option>
            {instants.map((instant, i) => (
              <option key={instant} value={instant}>
                {i === 0 ? "First" : "Second"} occurrence
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={ui.field}>
        Attendance plan
        <select
          className={ui.input}
          value={attendance}
          onChange={(e) => setAttendance(e.target.value as FixtureInput["attendance"])}
        >
          {Object.entries(attendanceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.field}>
        Ticket status
        <select
          className={ui.input}
          value={ticket}
          onChange={(e) => setTicket(e.target.value as FixtureInput["ticket"])}
        >
          {Object.entries(ticketLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.field}>
        Calendar reminder
        <select className={ui.input} value={reminder} onChange={(e) => setReminder(e.target.value)}>
          <option value="">Off</option>
          {Object.entries(reminderLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.muted}>
        Reminders are delivered by your calendar app after importing an exported event. Calendar events reserve an
        estimated two hours.
      </p>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" busy={save.isPending}>
          Save
        </Button>
        <Button onClick={closePanel} disabled={save.isPending}>
          Cancel
        </Button>
        {fixture && (
          <a className={buttonClass()} href={exportUrl(fixture.id)} download="benfica.ics">
            Export saved event
          </a>
        )}
      </div>
    </form>
  );
}

function Panels() {
  const { panels, closePanel } = useAppView();
  const fixtures = useFixtures();
  const panel = panels.at(-1);
  if (!panel) return null;
  const fixture = fixtures.data?.find((item) => panel === `match:${item.id}`);
  return (
    <Dialog
      key={panel}
      className={styles.dialog}
      aria-label={panel === "new" ? "Add home match" : "Edit match"}
      onClose={closePanel}
    >
      {panel === "new" || fixture ? (
        <MatchForm fixture={fixture} />
      ) : (
        <div className={styles.form}>
          {fixtures.isPending ? (
            <p role="status">Loading match…</p>
          ) : fixtures.error ? (
            <Alert onRetry={() => void fixtures.refetch()}>{fixtures.error.message}</Alert>
          ) : (
            <p>Match not found.</p>
          )}
          <Button onClick={closePanel}>Close</Button>
        </div>
      )}
    </Dialog>
  );
}

export function BenficaApp({
  user,
  theme,
  initial,
  version,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
}) {
  const tabs = useMemo(
    () => [
      { id: "fixtures", label: "Fixtures", icon: <ListIcon />, view: <FixturesView /> },
      { id: "calendar", label: "Stadium days", icon: <CalendarIcon />, view: <CalendarView /> },
    ],
    [],
  );
  return (
    <QueryProvider userId={user.id} version={version}>
      <AppShell
        name="Benfica"
        basePath="/benfica"
        initial={initial}
        username={user.username}
        avatarUrl={user.avatarUrl}
        theme={theme}
        tabs={tabs}
      >
        <Panels />
      </AppShell>
    </QueryProvider>
  );
}
