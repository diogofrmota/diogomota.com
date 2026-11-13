"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";

// A date or a time, typed: its blanks ("__/__/____", "__:__") fill with the
// digits as they're typed, the separators in place.
const masks = { date: "__/__/____", time: "__:__" } as const;
type Masked = keyof typeof masks;
/** What an empty field shows until it's focused; then its blanks. */
const placeholders: Record<Masked, string> = { date: "dd/mm/yyyy", time: "__:__" };
const invalidMessages: Record<Masked, string> = {
  date: "Enter a date as dd/mm/yyyy.",
  time: "Enter a time from 00:00 to 23:59, as hh:mm.",
};
/** The value's digits: "2026-11-15" is 15112026, "09:30" 0930. */
const digitsOf: Record<Masked, (value: string) => string> = {
  date: (value) => (value ? `${value.slice(8, 10)}${value.slice(5, 7)}${value.slice(0, 4)}` : ""),
  time: (value) => value.replace(":", ""),
};
/** The value the digits make ("2026-11-15", "09:30"), or null while they don't make one. */
const valueOf: Record<Masked, (digits: string) => string | null> = {
  date(digits) {
    if (digits.length < 8) return null;
    const [day, month, year] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const real = Number(year) >= 1000 && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
    return real ? `${year}-${month}-${day}` : null;
  },
  time: (digits) =>
    digits.length === 4 && Number(digits.slice(0, 2)) < 24 && Number(digits.slice(2)) < 60
      ? `${digits.slice(0, 2)}:${digits.slice(2)}`
      : null,
};
const fill = (mask: string, digits: string) => {
  let i = 0;
  return mask.replace(/_/g, () => digits[i++] ?? "_");
};
/** Where the caret goes: after the last digit, or at the start. */
function caretAfter(mask: string, count: number) {
  for (let i = 0, seen = 0; i < mask.length; i++) if (mask[i] === "_" && ++seen === count) return i + 1;
  return 0;
}

/**
 * A date ("15/11/2026", its value "2026-11-15") or a 24-hour time ("09:30"),
 * as text: "dd/mm/yyyy" or "__:__" while empty, its blanks once focused,
 * filled in as it's typed (the number keys on a phone). Focused, it's all
 * selected, so typing starts it over. `onChange` only once it's a whole, real
 * date or time (or, unless `required`, once it's emptied: ""); until then it
 * says what's wrong, and the form won't send. Not the browser's date and time
 * fields: their order (mm/dd/yyyy in the US) and AM and PM follow the device's
 * language. The event form's dates and times, and a task's due date.
 */
export function MaskedField({
  kind,
  label,
  value,
  onChange,
  required = true,
  className,
}: {
  kind: Masked;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  const mask = masks[kind];
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const keepSelection = useRef(false);
  const [focused, setFocused] = useState(false);
  // The digits typed while they aren't a whole value; null shows `value`.
  const [draft, setDraft] = useState<string | null>(null);
  // A new value from outside (the end following the start, Clear) replaces them.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(null);
  }
  const digits = draft ?? digitsOf[kind](value);
  const text = digits || focused ? fill(mask, digits) : "";
  const invalid = draft !== null;

  useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== ref.current) return;
    ref.current!.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  useEffect(() => {
    ref.current?.setCustomValidity(invalid ? invalidMessages[kind] : "");
  }, [invalid, kind]);

  function change(e: ChangeEvent<HTMLInputElement>) {
    const typed = e.currentTarget.value;
    let next = typed.replace(/\D/g, "");
    // A separator or a blank deleted: the digit before it goes.
    if (typed.length < text.length && next === digits) {
      const before = typed.slice(0, e.currentTarget.selectionStart ?? typed.length).replace(/\D/g, "").length;
      next = digits.slice(0, Math.max(0, before - 1)) + digits.slice(before);
    }
    next = next.slice(0, mask.split("_").length - 1);
    if (next === digits) return;
    caret.current = caretAfter(mask, next.length);
    const parsed = !next && !required ? "" : valueOf[kind](next);
    setDraft(parsed === null ? next : null);
    if (parsed !== null && parsed !== value) onChange(parsed);
  }

  return (
    <input
      ref={ref}
      type="text"
      className={className}
      aria-label={label}
      required={required}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholders[kind]}
      value={text}
      aria-invalid={invalid && !focused ? true : undefined}
      onChange={change}
      onFocus={(e) => {
        setFocused(true);
        if (digits) {
          e.currentTarget.select();
          keepSelection.current = true;
        } else caret.current = 0;
      }}
      // The click that focused it would put the caret where it landed.
      onMouseUp={(e) => {
        if (keepSelection.current) {
          e.preventDefault();
          keepSelection.current = false;
        }
      }}
      onBlur={() => {
        setFocused(false);
        keepSelection.current = false;
      }}
    />
  );
}
