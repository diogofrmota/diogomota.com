// Line icons for the apps, 24x24, drawn in the text color with one stroke
// weight, so every icon reads as part of one set (the text glyphs ‹ › ⋯ ♥ ★ ↗
// they replaced each had their own). `filled` fills the shape too, for the
// pressed state of a toggle (a favourite's heart) and for rating stars.
// Decorative: the button or link around one carries the label.
function Icon({ children, filled = false }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </Icon>
  );
}

export function GripIcon() {
  return (
    <Icon>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="3" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Icon>
  );
}

export function UserIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6" />
    </Icon>
  );
}

export function AppsIcon() {
  return (
    <Icon>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Icon>
  );
}

export function LogoutIcon() {
  return (
    <Icon>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14M10 12h10M16.5 8l4 4-4 4" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="m15 6-6 6 6 6" />
    </Icon>
  );
}

export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

/** A dialog's close button. */
export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

/**
 * Watching: a play button. Its box is right of center, so its weight (the
 * triangle's middle, a third of the way in from its flat side) is centered:
 * centered by its box, it looks pushed to the left.
 */
export function PlayIcon() {
  return (
    <Icon>
      <path d="M8.5 5.5v13L19 12z" />
    </Icon>
  );
}

/** Planned: a bookmark. */
export function BookmarkIcon() {
  return (
    <Icon>
      <path d="M7 4.5h10v15l-5-3.5-5 3.5z" />
    </Icon>
  );
}

/** Completed: a tick in a circle. */
export function DoneIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.25 12.25 2.5 2.5 5-5" />
    </Icon>
  );
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </Icon>
  );
}

/** Favourite: outlined, or filled once it is one. */
export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Icon filled={filled}>
      <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
    </Icon>
  );
}

/** A rating star: filled when it counts. */
export function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Icon filled={filled}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </Icon>
  );
}

/** More actions: three dots in a row. */
export function MoreIcon() {
  return (
    <Icon>
      <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />
    </Icon>
  );
}

/** Opens somewhere else (another site, in a new tab). */
export function ExternalIcon() {
  return (
    <Icon>
      <path d="M14 5h5v5M19 5l-8 8M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10" />
    </Icon>
  );
}

/** A photo: a frame with a hill and the sun, for choosing a profile picture. */
export function PhotoIcon() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20.5 15.5-4.5-4.5-9 8" />
    </Icon>
  );
}
