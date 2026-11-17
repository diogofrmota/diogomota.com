"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { ListIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { apiRequest } from "@/lib/api-request";
import type { AppViewState } from "@/lib/app-views";
import { calendarZone } from "@/lib/calendar";
import type { BenficaSchedule } from "@/lib/football-types";
import type { Theme } from "@/lib/themes";
import styles from "./Benfica.module.css";

const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarZone,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function FixturesView() {
  const fixtures = useQuery({
    queryKey: ["benfica-schedule"],
    queryFn: ({ signal }) =>
      apiRequest<BenficaSchedule>("/api/benfica/fixtures", {
        signal,
        fallback: "Could not load Benfica fixtures. Please try again.",
      }),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
    meta: { persist: true },
  });
  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <div>
          <h1 className={ui.heading}>Benfica</h1>
          <p className={styles.muted}>Upcoming games. Home matches are your stadium days.</p>
        </div>
        <Button onClick={() => void fixtures.refetch()} busy={fixtures.isFetching}>
          Refresh
        </Button>
      </div>
      <p className={styles.muted}>All dates and times are in Lisbon time. Fixtures can change.</p>
      {fixtures.isPending && <p role="status">Loading Benfica games…</p>}
      {fixtures.error && <Alert onRetry={() => void fixtures.refetch()}>{fixtures.error.message}</Alert>}
      {fixtures.data?.stale && (
        <p role="status" className={styles.muted}>
          The fixture service is unavailable. Showing the last saved schedule.
        </p>
      )}
      {fixtures.data && fixtures.data.matches.length === 0 && (
        <p className={styles.empty}>
          No upcoming games are available yet. Check back when the next fixtures are announced.
        </p>
      )}
      <ul className={styles.matches} aria-label="Upcoming Benfica games">
        {fixtures.data?.matches.map((match) => (
          <li key={match.id} className={`${styles.match} ${match.home ? styles.home : ""}`}>
            <div className={styles.matchTop}>
              <span className={match.home ? styles.homeBadge : styles.awayBadge}>
                {match.home ? "Home · Stadium day" : "Away"}
              </span>
              <span className={styles.muted}>{match.competition}</span>
            </div>
            <h2>
              {match.homeTeam} <span className={styles.versus}>vs</span> {match.awayTeam}
            </h2>
            <time dateTime={match.kickoff}>
              {date.format(new Date(match.kickoff))} ·{" "}
              {match.confirmedTime ? time.format(new Date(match.kickoff)) : "Kickoff to be confirmed"}
            </time>
            {match.home && <p className={styles.stadium}>Estádio da Luz</p>}
          </li>
        ))}
      </ul>
      <p className={styles.source}>
        Fixtures by{" "}
        <a href="https://www.football-data.org" target="_blank" rel="noreferrer">
          football-data.org
        </a>
        .
        {fixtures.data && (
          <>
            {" "}
            Updated {date.format(new Date(fixtures.data.updatedAt))} at {time.format(new Date(fixtures.data.updatedAt))}
            .
          </>
        )}{" "}
        Coverage depends on the competitions available from the provider.
      </p>
    </div>
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
  const tabs = useMemo(() => [{ id: "fixtures", label: "Fixtures", icon: <ListIcon />, view: <FixturesView /> }], []);
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
      />
    </QueryProvider>
  );
}
