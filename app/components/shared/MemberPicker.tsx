"use client";
import ui from "@/components/common/ui.module.css";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/common/Avatar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import styles from "./MemberPicker.module.css";

export { memberName };

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

type Option = { value: string; label: string; color: string; member: Space["members"][number] | null };

function Choice({
  option,
  type,
  name,
  checked,
  required,
  onChange,
}: {
  option: Option;
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  required?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={styles.option} title={option.label} style={{ "--member-color": option.color } as CSSProperties}>
      <input
        type={type}
        className={styles.input}
        name={name}
        value={option.value}
        required={required}
        checked={checked}
        onChange={onChange}
      />
      {option.member ? (
        <Avatar username={option.member.username} url={option.member.avatarUrl} className={styles.circle} />
      ) : (
        <span className={`${styles.circle} ${styles.all}`} aria-hidden="true">
          All
        </span>
      )}
      <span className={ui.srOnly}>{option.label}</span>
    </label>
  );
}

/**
 * Who something is for: each member's profile picture (or initial), small and
 * in a row, then All, a circle the same size. What is chosen is ringed in its
 * color (the member's; All's is gray, like a group event's) and named after the
 * row (`allName` for All); the rest are faded.
 *
 * One member or All (a task's assignee): radio buttons named `name`, so the
 * arrow keys move between them; `value` is a member's id or `allValue`, and ""
 * is none yet, which `required` doesn't let through. With `multiple` (an
 * event's Who?): checkboxes, any number of members, or All instead; `values` are
 * the members' ids, or [allValue].
 */
export function MemberPicker(
  props: {
    legend: string;
    name: string;
    members: Space["members"];
    allValue: string;
    allName: string;
  } & (
    | { multiple?: false; value: string; onChange: (value: string) => void; required?: boolean }
    | { multiple: true; values: readonly string[]; onChangeMany: (values: string[]) => void }
  ),
) {
  const { legend, name, members, allValue, allName } = props;
  const options: Option[] = [
    ...members.map((member) => ({ value: member.id, label: memberName(member), color: member.color, member })),
    { value: allValue, label: "All", color: "var(--muted)", member: null },
  ];
  const chosen = props.multiple ? props.values : [props.value];
  const chosenNames = chosen.includes(allValue)
    ? allName
    : list.format(members.filter((member) => chosen.includes(member.id)).map(memberName));

  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.row}>
        <div className={styles.options}>
          {options.map((option) =>
            props.multiple ? (
              <Choice
                key={option.value}
                option={option}
                type="checkbox"
                name={name}
                checked={props.values.includes(option.value)}
                onChange={() => {
                  if (option.value === allValue) props.onChangeMany([allValue]);
                  else {
                    const without = props.values.filter((value) => value !== allValue);
                    const next = without.includes(option.value)
                      ? without.filter((value) => value !== option.value)
                      : [...without, option.value];
                    props.onChangeMany(next);
                  }
                }}
              />
            ) : (
              <Choice
                key={option.value}
                option={option}
                type="radio"
                name={name}
                required={props.required}
                checked={props.value === option.value}
                onChange={() => props.onChange(option.value)}
              />
            ),
          )}
        </div>
        {/* What is chosen says it to screen readers already. */}
        <span className={styles.chosen} aria-hidden="true">
          {chosenNames}
        </span>
      </div>
    </fieldset>
  );
}
