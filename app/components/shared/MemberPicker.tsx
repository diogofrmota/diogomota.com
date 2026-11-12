"use client";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/common/Avatar";
import type { Space } from "@/lib/space-types";
import styles from "./MemberPicker.module.css";

/** A member's name, or their username without one. */
export const memberName = (member: { username: string; name: string | null }) => member.name ?? member.username;

/**
 * Who something is for: each member's profile picture (or initial), small and
 * in a row, then All, a circle the same size. The one chosen is ringed in its
 * color (the member's; All's is gray, like a group event's) and named after
 * the row (`allName` for All); the others are faded. Radio buttons named
 * `name`, so the arrow keys move between them and a screen reader reads each
 * one's name. `value` is a member's id or `allValue`; "" is none yet (an event
 * of a former member), which `required` doesn't let through.
 */
export function MemberPicker({ legend, name, members, value, allValue, allName, onChange, required = false }: {
  legend: string;
  name: string;
  members: Space["members"];
  value: string;
  allValue: string;
  allName: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const chosen = members.find((member) => member.id === value);
  const options = [
    ...members.map((member) => ({ value: member.id, label: memberName(member), color: member.color, member })),
    { value: allValue, label: "All", color: "var(--muted)", member: null },
  ];
  return <fieldset className={styles.picker}>
    <legend className={styles.legend}>{legend}</legend>
    <div className={styles.row}>
      <div className={styles.options}>
        {options.map((option) => <label key={option.value} className={styles.option} title={option.label}
          style={{ "--member-color": option.color } as CSSProperties}>
          <input type="radio" className={styles.input} name={name} value={option.value} required={required}
            checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.member ? <Avatar username={option.member.username} url={option.member.avatarUrl} className={styles.circle} />
            : <span className={`${styles.circle} ${styles.all}`} aria-hidden="true">All</span>}
          <span className={styles.srOnly}>{option.label}</span>
        </label>)}
      </div>
      {/* The radio chosen says it to screen readers already. */}
      <span className={styles.chosen} aria-hidden="true">{chosen ? memberName(chosen) : value === allValue ? allName : ""}</span>
    </div>
  </fieldset>;
}
