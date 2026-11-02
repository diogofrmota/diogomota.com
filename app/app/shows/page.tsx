import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/common/AppShell";
import { DiscoverIcon, HomeIcon, ProfileIcon } from "@/components/common/icons";
import { PlaceholderView } from "@/components/common/PlaceholderView";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";

// The Shows app. proxy.ts keeps logged-out users out. The views are placeholders
// until they are built.
export const metadata: Metadata = { title: "Shows", robots: { index: false } };

export const viewport = appViewport;

export default async function ShowsPage() {
  const { id } = await requireUser("/shows");
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <AppShell
      name="Shows"
      username={user.username}
      theme={user.themePreference}
      tabs={[
        {
          id: "home",
          label: "Home",
          icon: <HomeIcon />,
          view: (
            <PlaceholderView
              title="Home"
              description="Your library of TV shows and movies: watching, planned and completed."
            />
          ),
        },
        {
          id: "discover",
          label: "Discover",
          icon: <DiscoverIcon />,
          view: (
            <PlaceholderView
              title="Discover"
              description="Top rated and popular titles, what your friends added, and search."
            />
          ),
        },
        {
          id: "profile",
          label: "Profile",
          icon: <ProfileIcon />,
          view: (
            <PlaceholderView title="Profile" description="Your favourites, your stats and your friends." />
          ),
        },
      ]}
    />
  );
}
