import { AppHeader } from "@/components/common/AppHeader";
import { siteName } from "@/lib/site";

// Top bar of /apps and /account. Logged out: Login | Sign Up, which send the
// user on to `next` afterwards. Logged in: the username and its account menu.
export function TopBar({ username, next, name = "Apps" }: { username: string | null; next?: string | null; name?: string }) {
  return <AppHeader name={name} back={{ href: "/", label: siteName }} username={username} next={next} />;
}
