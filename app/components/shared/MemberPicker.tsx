"use client";
import ui from "@/components/common/ui.module.css";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/common/Avatar";
import { memberName } from "@/lib/names";
import type { Space } from "@/lib/space-types";
import styles from "./MemberPicker.module.css";

export { memberName };

/** The first word of someone's name, or their username: what a chip has room for. */
const firstName = (member: Space["members"][number]) => memberName(member).split(/\s+/)[0];

/**
 * Who an event or a task is for (Who?): any combination of the space's
 * members, each a chip with their picture and first name, ringed in their
 * color when chosen. No All: everyone is each of them chosen.
 */
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
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>{legend}</legend>
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
            <Avatar username={member.username} name={member.name} url={member.avatarUrl} className={styles.circle} />
            <span className={styles.name} aria-hidden="true">
              {firstName(member)}
            </span>
            <span className={ui.srOnly}>{memberName(member)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
