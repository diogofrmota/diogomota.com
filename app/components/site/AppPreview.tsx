import { memberColors } from "@/lib/space-types";
import styles from "./AppPreview.module.css";

// A small picture of an app, drawn with the page's theme from the apps' own
// parts, so it looks like the app does for this user: in its window on the
// front page (AppWindow, scaled up), in its login prompt and in Shared's
// welcome. Decorative (the words beside it say what the app is): no text in it
// but the calendar's day numbers.

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

/** Recipes: a search over a row of recipes' photos, one a favourite, and the shopping list beside them. */
function RecipesPreview() {
  const dishes = ["amber", "emerald", "rose"];
  const shopping = [false, false, true, false, true];
  return (
    <span className={styles.recipes}>
      <span className={styles.recipeCards}>
        <span className={styles.searchBar} />
        <span className={styles.dishes}>
          {dishes.map((dish, i) => (
            <span key={dish} className={styles.title}>
              <span className={`${styles.poster} ${styles.dish}`} data-art={dish}>
                {i === 0 && (
                  <svg viewBox="0 0 24 24" className={styles.heart}>
                    <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
                  </svg>
                )}
              </span>
              <span className={styles.line} />
            </span>
          ))}
        </span>
      </span>
      <span className={styles.tasks}>
        {shopping.map((done, i) => (
          <span key={i} className={styles.task} data-done={done || undefined}>
            <span className={styles.check} />
            <span className={styles.line} style={{ width: `${[60, 80, 50, 70, 55][i]}%` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Fitness: a workout's sets, the first ones ticked off, and a week of steps beside them, against the goal. */
function FitnessPreview() {
  const sets = [true, true, true, false];
  const steps = [55, 80, 40, 95, 70, 60, 85];
  return (
    <span className={styles.fitness}>
      <span className={styles.workout}>
        <span className={styles.line} style={{ width: "45%" }} />
        {sets.map((done, i) => (
          <span key={i} className={styles.set} data-done={done || undefined}>
            <span className={styles.setValue} />
            <span className={styles.setValue} />
            <span className={styles.setTick} />
          </span>
        ))}
      </span>
      <span className={styles.week}>
        {steps.map((height, i) => (
          <span key={i} className={styles.stepBar} style={{ height: `${height}%` }} />
        ))}
      </span>
    </span>
  );
}

const previews: Record<string, () => React.ReactNode> = {
  "/benfica": BenficaPreview,
  "/books": BooksPreview,
  "/shared": SharedPreview,
  "/shows": ShowsPreview,
  "/recipes": RecipesPreview,
  "/fitness": FitnessPreview,
};

function BenficaPreview() {
  return (
    <span className={styles.shared}>
      <span className={styles.month}>
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} className={styles.day}>
            <span className={styles.dayNumber}>{i + 1}</span>
            {[4, 12, 18].includes(i) && (
              <span className={styles.event} style={{ "--event-color": "#bf1828" } as React.CSSProperties} />
            )}
          </span>
        ))}
      </span>
      <span className={styles.tasks}>
        {[true, false, true].map((done, i) => (
          <span key={i} className={styles.task} data-done={done || undefined}>
            <span className={styles.check} />
            <span className={styles.line} style={{ width: `${70 - i * 10}%` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

function BooksPreview() {
  return (
    <span className={styles.shows}>
      <span className={styles.searchBar} />
      <span className={styles.posters}>
        {["amber", "emerald", "indigo"].map((art, i) => (
          <span key={art} className={styles.title}>
            <span className={styles.poster} data-art={art}>
              <svg viewBox="0 0 80 110" width="100%" height="100%">
                <path
                  d="M12 0v110M22 28h44M22 38h36M22 80h32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity=".45"
                />
              </svg>
            </span>
            <span className={styles.line} style={{ width: `${[35, 65, 100][i]}%` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

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
