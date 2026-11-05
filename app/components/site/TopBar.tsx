import { AppHeader } from "@/components/common/AppHeader";

// Top bar of /apps and /account: the apps' top bar, with no app open. Logged
// out: Login | Sign Up, which send the user on to `next` afterwards. Logged in:
// the username and its account menu.
export function TopBar({ username, next }: { username: string | null; next?: string | null }) {
  return <AppHeader username={username} next={next} />;
}
