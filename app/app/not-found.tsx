import type { Metadata } from "next";
import { getUser } from "@/auth";
import { MessagePage } from "@/components/site/MessagePage";
import { defaultTheme } from "@/lib/themes";

export const metadata: Metadata = { title: "page not found" };

// A path that isn't a page (or an app's view that isn't one): in the apps'
// look and the user's theme, with the tab bar, and Go home.
export default async function NotFound() {
  const user = await getUser();
  return (
    <MessagePage
      title="Page not found"
      message="There's nothing at this address. The link may be wrong, or the page may have moved."
      link={{ href: "/", label: "Go home" }}
      theme={user?.themePreference ?? defaultTheme}
      user={user && { username: user.username, name: user.name, avatarUrl: user.avatarUrl }}
    />
  );
}
