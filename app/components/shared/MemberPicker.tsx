"use client";
import ui from "@/components/common/ui.module.css";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/common/Avatar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import styles from "./MemberPicker.module.css";

export { memberName };

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Shared picker for events and tasks: select any combination of people. */
export function MemberPicker({
  legend,
  name,
  members,
  values,
  onChangeMany,
}: {
  legend: string;
  name: string;
  members: Space["members"];
  multiple: true;
  values: readonly string[];
  onChangeMany: (values: string[]) => void;
}) {
  const chosenNames = list.format(members.filter((member) => values.includes(member.id)).map(memberName));
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.row}>
        <div className={styles.options}>
          {members.map((member) => (
            <label
              key={member.id}
              className={styles.option}
              title={memberName(member)}
              style={{ "--member-color": member.color } as CSSProperties}
            >
              <input
                type="checkbox"
                className={styles.input}
                name={name}
                value={member.id}
                checked={values.includes(member.id)}
                onChange={() =>
                  onChangeMany(
                    values.includes(member.id) ? values.filter((id) => id !== member.id) : [...values, member.id],
                  )
                }
              />
              <Avatar username={member.username} url={member.avatarUrl} className={styles.circle} />
              <span className={ui.srOnly}>{memberName(member)}</span>
            </label>
          ))}
        </div>
        <span className={styles.chosen} aria-hidden="true">
          {chosenNames}
        </span>
      </div>
    </fieldset>
  );
}
