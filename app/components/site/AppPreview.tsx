import { memberColors } from "@/lib/space-types";
import styles from "./AppPreview.module.css";

// A small picture of an app, drawn with the page's theme from the apps' own
// parts, so it looks like the app does for this user: on its card on /apps
// and in its login prompt. Decorative (the card's name and description say
// what the app is): no text in it but the calendar's day numbers.

const [blue, rose, green, gold] = memberColors.map((color) => color.hex);

/** Shared: a month of the calendar with members' events, and a task list beside it. */
function SharedPreview() {
  // Three weeks, Monday first: [day, the event's color, or none].
  const days: [number, string?][] = [
    [9],
    [10, blue],
    [11, rose],
    [12],
    [13, green],
    [14],
    [15, gold],
    [16, rose],
    [17],
    [18, blue],
    [19],
    [20],
    [21, green],
    [22],
    [23],
    [24, gold],
    [25],
    [26, blue],
    [27, rose],
    [28],
    [29],
  ];
  const tasks = [true, false, false, true, false];
  return (
    <span className={styles.shared}>
      <span className={styles.month}>
        {days.map(([day, color]) => (
          <span key={day} className={styles.day} data-today={day === 11 || undefined}>
            <span className={styles.dayNumber}>{day}</span>
            {color && <span className={styles.event} style={{ "--event-color": color } as React.CSSProperties} />}
          </span>
        ))}
      </span>
      <span className={styles.tasks}>
        {tasks.map((done, i) => (
          <span key={i} className={styles.task} data-done={done || undefined}>
            <span className={styles.check} />
            <span className={styles.line} style={{ width: `${[70, 85, 55, 65, 80][i]}%` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Shows: the TV Shows | Movies switch over a row of posters, two of them added. */
function ShowsPreview() {
  const posters = ["amber", "indigo", "emerald", "rose"];
  return (
    <span className={styles.shows}>
      <span className={styles.switch}>
        <span className={styles.switchOn} />
        <span className={styles.switchOff} />
      </span>
      <span className={styles.posters}>
        {posters.map((poster, i) => (
          <span key={poster} className={styles.title}>
            <span className={styles.poster} data-art={poster}>
              {i < 2 && <span className={styles.added} />}
            </span>
            <span className={styles.line} />
          </span>
        ))}
      </span>
    </span>
  );
}

const previews: Record<string, () => React.ReactNode> = { "/shared": SharedPreview, "/shows": ShowsPreview };

/** The picture of the app at `href`, or nothing for an app without one. */
export function AppPreview({ href, className = "" }: { href: string; className?: string }) {
  const Preview = previews[href];
  if (!Preview) return null;
  return (
    <span className={`${styles.preview} ${className}`} aria-hidden="true">
      <Preview />
    </span>
  );
}
