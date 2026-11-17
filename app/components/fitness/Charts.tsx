"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import ui from "@/components/common/ui.module.css";
import { dateLabel } from "@/lib/calendar";
import { niceScale, tickLabels } from "@/lib/fitness-types";
import styles from "./Fitness.module.css";

// The Progress view's charts, drawn as SVG at the width they're given: one
// series each, in the theme's accent (the title says what it is, so no
// legend). A line of 2px with a wash under it and its last value at its end,
// or columns at most 24px wide, 2px apart, rounded at the top; hairline
// gridlines, ticks on round numbers. Hover, a tap or the arrow keys (once the
// chart is focused) show a value and its day; Show as a table has them all.

const height = 200;
const margin = { top: 20, right: 14, bottom: 26, left: 44 };

/** "4 Nov". */
const dayMonth = (date: string) => dateLabel(date, { day: "numeric", month: "short" });

/** The chart's width, as laid out (0 until it is). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Which point is shown: moved with the arrow keys, Home and End, once the chart is focused. */
function keyMove(event: KeyboardEvent, active: number | null, count: number): number | null {
  const at = active ?? count - 1;
  const next =
    event.key === "ArrowLeft"
      ? at - 1
      : event.key === "ArrowRight"
        ? at + 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? count - 1
            : null;
  if (next === null) return null;
  event.preventDefault();
  return Math.max(0, Math.min(count - 1, next));
}

/** A value and its day over the chart, and the same for screen readers. */
function Tooltip({ x, y, width, value, date }: { x: number; y: number; width: number; value: string; date: string }) {
  // Kept inside the chart at either end.
  const left = Math.max(56, Math.min(width - 56, x));
  return (
    <>
      <span className={styles.tooltip} style={{ left, top: y }} aria-hidden="true">
        <strong>{value}</strong>
        <span>{date}</span>
      </span>
      <span className={ui.srOnly} aria-live="polite">
        {value}, {date}
      </span>
    </>
  );
}

/** The chart's values as a table, folded away under Show as a table. */
function TableView({ rows, header }: { rows: { date: string; value: string }[]; header: string }) {
  return (
    <details className={styles.tableView}>
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{header}</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => (
            <tr key={row.date}>
              <td>{dateLabel(row.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** The gridlines and their ticks, on the left. */
function YAxis({ ticks, y, width }: { ticks: number[]; y: (value: number) => number; width: number }) {
  const labels = tickLabels(ticks);
  return (
    <g>
      {ticks.map((tick, i) => (
        <g key={tick}>
          <line className={styles.gridline} x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
          <text className={styles.axisText} x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
            {labels[i]}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * A line over time (body weight, an exercise's heaviest set): the days are
 * placed by date, so gaps between weigh-ins show as such.
 */
export function LineChart({
  points,
  label,
  header,
  format,
}: {
  points: readonly { date: string; value: number }[];
  /** What it shows, for screen readers: "Body weight, in kg". */
  label: string;
  /** The values' column in the table. */
  header: string;
  format: (value: number) => string;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const shown = active !== null && active < points.length ? active : null;
  const plotWidth = Math.max(0, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.1 || Math.abs(high) * 0.02 || 1;
  const scale = niceScale(low - pad, high + pad, 4);
  const times = points.map((point) => Date.parse(`${point.date}T12:00:00Z`));
  const [first, last] = [times[0], times.at(-1)!];
  const x = (i: number) =>
    margin.left + (last === first ? plotWidth / 2 : ((times[i] - first) / (last - first)) * plotWidth);
  const y = (value: number) => margin.top + (1 - (value - scale.min) / (scale.max - scale.min)) * plotHeight;
  const baseline = margin.top + plotHeight;
  const line = points.map((point, i) => `${i ? "L" : "M"}${x(i)},${y(point.value)}`).join("");
  const end = points.length - 1;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const left = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - left) < Math.abs(x(nearest) - left)) nearest = i;
    setActive(nearest);
  }

  return (
    <div className={styles.chartBox}>
      <div
        ref={ref}
        className={styles.chart}
        role="group"
        aria-label={`${label}: the arrow keys go from day to day`}
        tabIndex={0}
        onKeyDown={(event) => {
          const next = keyMove(event, shown, points.length);
          if (next !== null) setActive(next);
        }}
        onFocus={() => setActive((current) => current ?? end)}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
          >
            <YAxis ticks={scale.ticks} y={y} width={width} />
            <path className={styles.area} d={`${line}L${x(end)},${baseline}L${x(0)},${baseline}Z`} />
            <path className={styles.line} d={line} />
            {shown !== null && (
              <line className={styles.crosshair} x1={x(shown)} x2={x(shown)} y1={margin.top} y2={baseline} />
            )}
            {/* The last value, at the end of the line, and the point shown. */}
            <circle className={styles.dot} cx={x(end)} cy={y(points[end].value)} r={4} />
            {shown !== null && shown !== end && (
              <circle className={styles.dot} cx={x(shown)} cy={y(points[shown].value)} r={4} />
            )}
            <text
              className={styles.endLabel}
              x={Math.min(x(end), width - margin.right)}
              y={y(points[end].value) - 10}
              textAnchor={points.length > 1 ? "end" : "middle"}
            >
              {format(points[end].value)}
            </text>
            <text
              className={styles.axisText}
              x={x(0)}
              y={height - 6}
              textAnchor={points.length > 1 ? "start" : "middle"}
            >
              {dayMonth(points[0].date)}
            </text>
            {points.length > 1 && (
              <text className={styles.axisText} x={x(end)} y={height - 6} textAnchor="end">
                {dayMonth(points[end].date)}
              </text>
            )}
          </svg>
        )}
        {shown !== null && width > 0 && (
          <Tooltip
            x={x(shown)}
            y={y(points[shown].value) - 12}
            width={width}
            value={format(points[shown].value)}
            date={dateLabel(points[shown].date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          />
        )}
      </div>
      <TableView header={header} rows={points.map((point) => ({ date: point.date, value: format(point.value) }))} />
    </div>
  );
}

/** A column's path: square at the baseline, its top corners rounded. */
function column(left: number, top: number, barWidth: number, bottom: number): string {
  const r = Math.min(4, barWidth / 2, bottom - top);
  return `M${left},${bottom}V${top + r}A${r},${r} 0 0 1 ${left + r},${top}H${left + barWidth - r}A${r},${r} 0 0 1 ${left + barWidth},${top + r}V${bottom}Z`;
}

/** A column a day (steps, water), the days without one empty, and the daily goal across them. */
export function BarChart({
  bars,
  goal,
  label,
  header,
  format,
  today,
}: {
  bars: readonly { date: string; value: number | null }[];
  goal: number;
  label: string;
  header: string;
  format: (value: number) => string;
  today: string;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const shown = active !== null && active < bars.length ? active : null;
  const plotWidth = Math.max(0, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const scale = niceScale(0, Math.max(goal, ...bars.map((bar) => bar.value ?? 0)), 4);
  const band = plotWidth / bars.length;
  const barWidth = Math.max(2, Math.min(24, band - 2));
  const x = (i: number) => margin.left + band * i + (band - barWidth) / 2;
  const y = (value: number) => margin.top + (1 - value / scale.max) * plotHeight;
  const baseline = margin.top + plotHeight;
  const labelled = [0, Math.floor(bars.length / 2), bars.length - 1];

  return (
    <div className={styles.chartBox}>
      <div
        ref={ref}
        className={styles.chart}
        role="group"
        aria-label={`${label}: the arrow keys go from day to day`}
        tabIndex={0}
        onKeyDown={(event) => {
          const next = keyMove(event, shown, bars.length);
          if (next !== null) setActive(next);
        }}
        onFocus={() => setActive((current) => current ?? bars.length - 1)}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
          >
            <YAxis ticks={scale.ticks} y={y} width={width} />
            {bars.map((bar, i) =>
              bar.value ? (
                <path
                  key={bar.date}
                  className={styles.column}
                  data-active={shown === i || undefined}
                  d={column(x(i), y(bar.value), barWidth, baseline)}
                />
              ) : null,
            )}
            <line className={styles.goalLine} x1={margin.left} x2={width - margin.right} y1={y(goal)} y2={y(goal)} />
            <text className={styles.goalLabel} x={width - margin.right} y={y(goal) - 5} textAnchor="end">
              Goal {format(goal)}
            </text>
            {labelled.map((i) => (
              <text
                key={i}
                className={styles.axisText}
                x={x(i) + barWidth / 2}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle"}
              >
                {bars[i].date === today ? "Today" : dayMonth(bars[i].date)}
              </text>
            ))}
            {/* Each day's whole column is its target, not only the bar. */}
            {bars.map((bar, i) => (
              <rect
                key={bar.date}
                className={styles.hit}
                x={margin.left + band * i}
                y={margin.top}
                width={band}
                height={plotHeight}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>
        )}
        {shown !== null && width > 0 && (
          <Tooltip
            x={x(shown) + barWidth / 2}
            y={y(bars[shown].value ?? 0) - 10}
            width={width}
            value={bars[shown].value === null ? "Not logged" : format(bars[shown].value!)}
            date={
              bars[shown].date === today
                ? "Today"
                : dateLabel(bars[shown].date, { weekday: "short", day: "numeric", month: "short" })
            }
          />
        )}
      </div>
      <TableView
        header={header}
        rows={bars.map((bar) => ({ date: bar.date, value: bar.value === null ? "–" : format(bar.value) }))}
      />
    </div>
  );
}
