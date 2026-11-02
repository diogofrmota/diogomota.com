// Line icons for the apps, 24x24, drawn in the text color. Decorative: the
// button or link around one carries the label.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function BackIcon() {
  return (
    <Icon>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon>
      <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />
    </Icon>
  );
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

export function TasksIcon() {
  return (
    <Icon>
      <path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.25 1.25L7.25 4.75M3.5 12l1.25 1.25 2.5-2.5M3.5 18l1.25 1.25 2.5-2.5" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Icon>
  );
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h4.5v-6h4v6h4.5V9.5" />
    </Icon>
  );
}

export function DiscoverIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Icon>
  );
}

export function ProfileIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
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
